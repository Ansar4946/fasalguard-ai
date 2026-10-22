"""Real disposable PostGIS/session integration. All identities/profile data are synthetic."""

import hashlib
import json
import uuid
from concurrent.futures import ThreadPoolExecutor
from datetime import UTC, datetime, timedelta
from unittest.mock import patch

import jwt
import pytest
from fastapi.testclient import TestClient
from sqlalchemy import text

from app.config import get_settings
from app.db import engine, transaction
from app.irrigation.tasks import dispatch, process
from app.main import app
from tests.irrigation.fixtures import profile, weather

pytestmark = pytest.mark.integration
POLYGON = {"type": "Polygon", "coordinates": [[[72, 31], [72.002, 31], [72.002, 31.002], [72, 31.002], [72, 31]]]}


def identity():
    assert engine().url.database in {"f03_test", "f03_runtime_test"}, "Use only the disposable F03 database."
    uid, sid, fid, farm, farmer, cycle = [str(uuid.uuid4()) for _ in range(6)]
    with transaction() as c:
        c.execute(text("INSERT INTO users(id,email,role,status) VALUES(:id,:email,'FARMER','active')"), {"id": uid, "email": f"f03-{uid}@example.invalid"})
        c.execute(
            text("INSERT INTO farmer_profiles(id,user_id,full_name,referral_code) VALUES(:id,:uid,'F03 synthetic test farmer',:code)"),
            {"id": farmer, "uid": uid, "code": uid.replace("-", "")[:12]},
        )
        c.execute(
            text("""INSERT INTO farms(id,farmer_id,name,boundary,centroid,area_hectares)
        SELECT :id,:farmer,'F03 synthetic test farm',g,ST_Centroid(g),ST_Area(g::geography)/10000
        FROM (SELECT ST_SetSRID(ST_GeomFromGeoJSON(:geometry),4326) g) b"""),
            {"id": farm, "farmer": farmer, "geometry": json.dumps(POLYGON)},
        )
        c.execute(
            text("""INSERT INTO fields(id,farm_id,name,boundary,centroid,area_hectares)
        SELECT :id,id,'F03 synthetic test field',boundary,centroid,area_hectares FROM farms WHERE id=:farm"""),
            {"id": fid, "farm": farm},
        )
        c.execute(
            text("""INSERT INTO crop_cycles(id,field_id,crop_id,status,sowing_date,expected_harvest_date)
        SELECT :id,:fid,id,'completed','2025-01-01','2025-06-01' FROM crops WHERE slug='wheat'"""),
            {"id": cycle, "fid": fid},
        )
        c.execute(
            text("""INSERT INTO auth_sessions(id,user_id,refresh_token_hash,token_family,last_used_at,expires_at)
        VALUES(:sid,:uid,:hash,:family,now(),now()+interval '6 hours')"""),
            {"sid": sid, "uid": uid, "hash": hashlib.sha256(sid.encode()).hexdigest(), "family": str(uuid.uuid4())},
        )
    s = get_settings()
    token = jwt.encode(
        {"sub": uid, "sid": sid, "type": "access", "iss": s.jwt_issuer, "aud": s.jwt_audience, "exp": datetime.now(UTC) + timedelta(hours=6)},
        s.jwt_access_secret,
        algorithm="HS256",
    )
    return {"user": uid, "session": sid, "field": fid, "cycle": cycle, "headers": {"Authorization": f"Bearer {token}"}}


@pytest.fixture
def owner():
    return identity()


def save(client, owner, version=0):
    body = {**profile(), "cropCycleId": owner["cycle"], "expectedVersion": version}
    response = client.put(f"/api/v1/fields/{owner['field']}/irrigation/profile", json=body, headers=owner["headers"])
    assert response.status_code == 200, response.text
    return response.json()


def request_body(owner, key=None):
    return {
        "cropCycleId": owner["cycle"],
        "endDate": "2025-01-07",
        "weatherSource": "MANUAL",
        "manualWeather": weather(),
        "source": "Synthetic weather test fixture; not a farmer observation",
        "confirmedNoOtherIrrigation": True,
        "idempotencyKey": key or str(uuid.uuid4()),
    }


def submit(client, owner, key=None):
    response = client.post(f"/api/v1/fields/{owner['field']}/irrigation-runs", json=request_body(owner, key), headers=owner["headers"])
    assert response.status_code == 202, response.text
    return response.json()


def test_real_api_outbox_model_publication_and_idempotency(owner):
    client = TestClient(app)
    save(client, owner)
    key = str(uuid.uuid4())
    first = submit(client, owner, key)
    assert submit(client, owner, key)["id"] == first["id"]
    with transaction() as c:
        assert c.execute(text("SELECT count(*) FROM irrigation_task_outbox WHERE run_id=:id"), {"id": first["id"]}).scalar_one() == 1
    assert process.run(first["id"], owner["user"]) == "COMPLETED"
    assert process.run(first["id"], owner["user"]) == "COMPLETED"
    result = client.get(f"/api/v1/irrigation-runs/{first['id']}", headers=owner["headers"]).json()
    assert len(result["result"]["daily"]) == 7
    assert result["result"]["weatherProvenance"]["verifiedByPlatform"] is False
    assert result["result"]["profileVersion"] == 1
    save(client, owner, 1)
    assert client.get(f"/api/v1/irrigation-runs/{first['id']}", headers=owner["headers"]).json()["result"]["profileVersion"] == 1


def test_nonowner_session_revocation_and_season_isolation(owner):
    client = TestClient(app)
    other = identity()
    save(client, owner)
    run = submit(client, owner)
    assert client.get(f"/api/v1/irrigation-runs/{run['id']}", headers=other["headers"]).status_code == 404
    assert client.get(f"/api/v1/water-productivity-runs/{run['id']}/artifact", headers=other["headers"]).status_code == 404
    response = client.put(
        f"/api/v1/fields/{owner['field']}/irrigation/profile", json={**profile(), "cropCycleId": other["cycle"], "expectedVersion": 0}, headers=owner["headers"]
    )
    assert response.status_code == 404
    with transaction() as c:
        c.execute(text("UPDATE auth_sessions SET revoked_at=now() WHERE id=:id"), {"id": owner["session"]})
    assert client.get(f"/api/v1/irrigation-runs/{run['id']}", headers=owner["headers"]).status_code == 401


def test_profile_version_conflict_and_invalid_weather(owner):
    client = TestClient(app)
    save(client, owner)
    response = client.put(
        f"/api/v1/fields/{owner['field']}/irrigation/profile", json={**profile(), "cropCycleId": owner["cycle"], "expectedVersion": 0}, headers=owner["headers"]
    )
    assert response.status_code == 409
    body = request_body(owner)
    body["manualWeather"].pop()
    assert client.post(f"/api/v1/fields/{owner['field']}/irrigation-runs", json=body, headers=owner["headers"]).status_code == 400


def test_actual_events_retries_and_conflicting_daily_total(owner):
    client = TestClient(app)
    body = {
        "cropCycleId": owner["cycle"],
        "date": "2025-01-03",
        "grossDepthMm": 20,
        "efficiency": 0.8,
        "wettedFraction": 1,
        "source": "Synthetic fixture event",
        "idempotencyKey": str(uuid.uuid4()),
    }
    path = f"/api/v1/fields/{owner['field']}/irrigation/events"
    first = client.post(path, json=body, headers=owner["headers"])
    assert first.status_code == 201
    assert client.post(path, json=body, headers=owner["headers"]).json()["id"] == first.json()["id"]
    assert client.post(path, json={**body, "grossDepthMm": 30}, headers=owner["headers"]).status_code == 409
    assert client.post(path, json={**body, "idempotencyKey": str(uuid.uuid4())}, headers=owner["headers"]).status_code == 409


def test_broker_outage_and_concurrent_duplicate_run(owner):
    client = TestClient(app)
    save(client, owner)
    key = str(uuid.uuid4())
    with ThreadPoolExecutor(max_workers=2) as pool:
        rows = list(pool.map(lambda _: submit(TestClient(app), owner, key), range(2)))
    assert rows[0]["id"] == rows[1]["id"]
    with patch("app.irrigation.tasks.process.apply_async", side_effect=ConnectionError("synthetic broker outage")):
        dispatch.run()
    with transaction() as c:
        assert c.execute(text("SELECT dispatch_count FROM irrigation_task_outbox WHERE run_id=:id"), {"id": rows[0]["id"]}).scalar_one() == 0


def test_provider_final_failure_and_account_disable_no_result(owner):
    from app.irrigation.weather import WeatherUnavailable

    client = TestClient(app)
    save(client, owner)
    body = {**request_body(owner), "weatherSource": "OPEN_METEO_ARCHIVE"}
    del body["manualWeather"]
    first = client.post(f"/api/v1/fields/{owner['field']}/irrigation-runs", json=body, headers=owner["headers"]).json()
    process.push_request(retries=2)
    try:
        with patch("app.irrigation.weather.archive", side_effect=WeatherUnavailable("WEATHER_UNAVAILABLE")):
            assert process.run(first["id"], owner["user"]) == "FAILED"
    finally:
        process.pop_request()
    result = client.get(f"/api/v1/irrigation-runs/{first['id']}", headers=owner["headers"]).json()
    assert result["result"] is None and result["failureCode"] == "WEATHER_UNAVAILABLE"
    second = submit(client, owner)
    with transaction() as c:
        c.execute(text("UPDATE users SET status='suspended' WHERE id=:id"), {"id": owner["user"]})
    assert process.run(second["id"], owner["user"]) == "FAILED"


def test_disabled_wapor_is_explicit_and_has_no_synthetic_result(owner):
    client = TestClient(app)
    body = {
        "cropCycleId": owner["cycle"],
        "startDate": "2025-01-01",
        "endDate": "2025-01-07",
        "dryMatterCarbonFraction": 0.45,
        "carbonFractionSource": "Synthetic test coefficient",
        "idempotencyKey": str(uuid.uuid4()),
    }
    response = client.post(f"/api/v1/fields/{owner['field']}/water-productivity-runs", json=body, headers=owner["headers"])
    assert response.status_code == 202
    dispatch.run()
    result = client.get(f"/api/v1/water-productivity-runs/{response.json()['id']}", headers=owner["headers"]).json()
    assert result["status"] == "BLOCKED_EXTERNAL" and result["result"] is None
    assert result["failureCode"] == "WAPOR_NOT_CONFIGURED"

"""Real PostGIS/session/outbox integration; synthetic identities are test fixtures only."""

import hashlib
import json
import uuid
from datetime import UTC, datetime, timedelta
from unittest.mock import patch

import jwt
import pytest
from fastapi.testclient import TestClient
from sqlalchemy import text

from app.config import get_settings
from app.db import engine, transaction
from app.main import app
from app.satellite import provider
from app.satellite import repository as repo
from app.satellite.science import VERSION
from app.satellite.tasks import dispatch, process_capture

pytestmark = pytest.mark.integration
POLYGON = {"type": "Polygon", "coordinates": [[[72, 31], [72.002, 31], [72.002, 31.002], [72, 31.002], [72, 31]]]}


@pytest.fixture
def identity():
    assert engine().url.database == "f02_test", "Integration tests require the dedicated disposable f02_test database."
    uid, sid, fid, farm_id, profile_id = (str(uuid.uuid4()) for _ in range(5))
    with transaction() as c:
        c.execute(text("INSERT INTO users(id,email,role,status) VALUES(:id,:email,'FARMER','active')"), {"id": uid, "email": f"f02-{uid}@example.invalid"})
        c.execute(
            text("INSERT INTO farmer_profiles(id,user_id,full_name,referral_code) VALUES(:id,:uid,'F02 synthetic test farmer',:code)"),
            {"id": profile_id, "uid": uid, "code": uid.replace("-", "")[:12]},
        )
        c.execute(
            text("""INSERT INTO farms(id,farmer_id,name,boundary,centroid,area_hectares)
        SELECT :id,:profile,'F02 test farm',g,ST_Centroid(g),ST_Area(g::geography)/10000
        FROM (SELECT ST_SetSRID(ST_GeomFromGeoJSON(:polygon),4326) g) p"""),
            {"id": farm_id, "profile": profile_id, "polygon": json.dumps(POLYGON)},
        )
        c.execute(
            text("""INSERT INTO fields(id,farm_id,name,boundary,centroid,area_hectares)
        SELECT :id,:farm,'F02 test field',boundary,centroid,area_hectares FROM farms WHERE id=:farm"""),
            {"id": fid, "farm": farm_id},
        )
        c.execute(
            text("""INSERT INTO auth_sessions(id,user_id,refresh_token_hash,token_family,last_used_at,expires_at)
        VALUES(:sid,:uid,:hash,:family,now(),now()+interval '1 hour')"""),
            {"sid": sid, "uid": uid, "hash": hashlib.sha256(sid.encode()).hexdigest(), "family": str(uuid.uuid4())},
        )
    s = get_settings()
    token = jwt.encode(
        {"sub": uid, "sid": sid, "type": "access", "iss": s.jwt_issuer, "aud": s.jwt_audience, "exp": datetime.now(UTC) + timedelta(hours=1)},
        s.jwt_access_secret,
        algorithm="HS256",
    )
    return {"user": uid, "session": sid, "field": fid, "headers": {"Authorization": f"Bearer {token}"}}


def create(client, identity):
    response = client.post(
        f"/api/v1/fields/{identity['field']}/satellite-scans", json={"from": "2025-01-01T00:00:00Z", "to": "2025-02-20T00:00:00Z"}, headers=identity["headers"]
    )
    assert response.status_code == 202, response.text
    return response.json()["id"]


def test_api_commit_outbox_empty_scene_and_idempotency(identity):
    client = TestClient(app)
    cid = create(client, identity)
    with transaction() as c:
        assert c.execute(text("SELECT count(*) FROM satellite_task_outbox WHERE capture_id=:cid"), {"cid": cid}).scalar() == 1
    with patch("app.satellite.provider.search", return_value=[]) as search:
        assert process_capture.run(cid, identity["user"]) == "NO_VALID_SCENE"
        assert process_capture.run(cid, identity["user"]) == "NO_VALID_SCENE"
        assert search.call_count == 1
    capture = client.get(f"/api/v1/satellite-scans/{cid}", headers=identity["headers"]).json()
    assert capture["processingStatus"] == "NO_VALID_SCENE"
    assert client.get(f"/api/v1/satellite-scans/{cid}/statistics", headers=identity["headers"]).json() == []


def test_actual_revoked_session_and_field_isolation(identity):
    client = TestClient(app)
    unknown_field = str(uuid.uuid4())
    assert client.get(f"/api/v1/fields/{unknown_field}/satellite-scans", headers=identity["headers"]).status_code == 404
    with transaction() as c:
        c.execute(text("UPDATE auth_sessions SET revoked_at=now() WHERE id=:id"), {"id": identity["session"]})
    assert client.get(f"/api/v1/fields/{identity['field']}/satellite-scans", headers=identity["headers"]).status_code == 401


def test_broker_outage_keeps_committed_job(identity):
    cid = create(TestClient(app), identity)
    with patch("app.satellite.tasks.process_capture.apply_async", side_effect=ConnectionError("test broker outage")):
        assert dispatch.run() == 0
    with transaction() as c:
        assert c.execute(text("SELECT dispatch_count FROM satellite_task_outbox WHERE capture_id=:cid"), {"cid": cid}).scalar() == 0


def test_provider_failure_after_retry_exhaustion_is_not_prediction(identity):
    cid = create(TestClient(app), identity)
    process_capture.push_request(retries=3)
    try:
        with patch("app.satellite.provider.search", side_effect=provider.ProviderError("CATALOG_UNAVAILABLE")):
            assert process_capture.run(cid, identity["user"]) == "FAILED"
    finally:
        process_capture.pop_request()
    with transaction() as c:
        capture = repo.get(c, identity["user"], cid)
        assert capture["metadata"]["failureCode"] == "CATALOG_UNAVAILABLE"
        assert repo.result_rows(c, cid, "statistics") == []


def test_field_lock_excludes_concurrent_scene_selection(identity):
    cid = create(TestClient(app), identity)
    key = f"satellite-field-{identity['field']}"
    with transaction() as c:  # what dispatch does just before the task runs
        c.execute(text("UPDATE satellite_task_outbox SET next_dispatch_at=now()+interval '15 minutes' WHERE capture_id=:cid"), {"cid": cid})
    with engine().connect() as lock:
        lock.execute(text("SELECT pg_advisory_lock(hashtextextended(:key,0))"), {"key": key})
        lock.commit()
        try:
            with patch("app.satellite.provider.search") as search:
                assert process_capture.run(cid, identity["user"]) == "ALREADY_RUNNING"
                search.assert_not_called()
            with transaction() as c:  # D10: the loser is redispatched within a minute, not after 15 minutes
                wait = c.execute(
                    text("SELECT extract(epoch FROM next_dispatch_at-now()) FROM satellite_task_outbox WHERE capture_id=:cid"), {"cid": cid}
                ).scalar_one()
            assert wait <= 60
        finally:
            lock.execute(text("SELECT pg_advisory_unlock(hashtextextended(:key,0))"), {"key": key})
            lock.commit()


def synthetic_result():
    import io

    from PIL import Image

    stream = io.BytesIO()
    Image.new("RGBA", (1, 1), (0, 255, 0, 255)).save(stream, format="PNG")
    stats = {"mean": 0.5, "min": 0.5, "max": 0.5, "validPixelCount": 1, "validPixelPercentage": 100, "processingVersion": VERSION}
    return {
        "outputs": {"TRUE_COLOR": (stream.getvalue(), "image/png")},
        "statistics": {index: stats for index in ("NDVI", "EVI", "NDWI", "NDMI")},
        "provenance": {
            "processingVersion": VERSION,
            "crs": "EPSG:32642",
            "transform": [10, 0, 786450, 0, -10, 3433700],
            "width": 1,
            "height": 1,
            "testFixture": True,
        },
    }


def test_successful_publication_dedup_reprocessing_and_other_user_denial(identity):
    client = TestClient(app)
    item = {
        "id": f"synthetic-test-scene-{identity['field']}",
        "collection": "sentinel-2-l2a",
        "properties": {"datetime": "2025-01-09T06:00:27Z", "eo:cloud_cover": 0, "earthsearch:boa_offset_applied": True},
        "assets": {name: {"raster:bands": [{"scale": 0.0001, "offset": -0.1}]} for name in ("blue", "green", "red", "nir", "swir16")},
    }
    with patch("app.satellite.provider.search", return_value=[item]), patch("app.satellite.raster.process", return_value=synthetic_result()):
        first = create(client, identity)
        assert process_capture.run(first, identity["user"]) == "PROCESSED"
        second = create(client, identity)
        assert process_capture.run(second, identity["user"]) == "NO_VALID_SCENE"
        # A historical processing version can be replaced with the current version.
        with transaction() as c:
            c.execute(
                text("UPDATE satellite_captures SET raw_metadata=jsonb_set(raw_metadata,'{processingVersion}','\"old-test-version\"') WHERE id=:cid"),
                {"cid": first},
            )
        third = create(client, identity)
        assert process_capture.run(third, identity["user"]) == "PROCESSED"
        changed = {"type": "Polygon", "coordinates": [[[72.0001, 31], [72.002, 31], [72.002, 31.002], [72.0001, 31.002], [72.0001, 31]]]}
        with transaction() as c:
            c.execute(
                text("UPDATE fields SET boundary=ST_SetSRID(ST_GeomFromGeoJSON(:polygon),4326) WHERE id=:fid"),
                {"fid": identity["field"], "polygon": json.dumps(changed)},
            )
        fourth = create(client, identity)
        assert process_capture.run(fourth, identity["user"]) == "PROCESSED"
    assert len(client.get(f"/api/v1/satellite-scans/{fourth}/statistics", headers=identity["headers"]).json()) == 4
    content_path = f"/api/v1/satellite-scans/{fourth}/layers/TRUE_COLOR/content"
    assert client.get(content_path, headers=identity["headers"]).status_code == 200
    other = globals()["identity"].__wrapped__()
    assert client.get(f"/api/v1/satellite-scans/{fourth}", headers=other["headers"]).status_code == 404
    assert client.get(content_path, headers=other["headers"]).status_code == 404
    comparison = client.get(f"/api/v1/fields/{identity['field']}/satellite-comparison", headers=identity["headers"]).json()
    assert len(comparison["observations"]) == 1  # previous field boundary excluded


def test_two_scheduler_ticks_preserve_entitlements(identity):
    from concurrent.futures import ThreadPoolExecutor
    from types import SimpleNamespace

    from app.satellite.tasks import schedule

    free = globals()["identity"].__wrapped__()
    with transaction() as c:
        c.execute(text("INSERT INTO subscriptions(user_id,plan_code,status,started_at) VALUES(:uid,'FARMER_PRO','ACTIVE',now())"), {"uid": identity["user"]})
        c.execute(
            text("UPDATE fields SET next_satellite_check_at=now()-interval '1 minute' WHERE id IN (:paid,:free)"),
            {"paid": identity["field"], "free": free["field"]},
        )
    with patch("app.satellite.tasks.get_settings", return_value=SimpleNamespace(satellite_scheduler_enabled=True)):
        with ThreadPoolExecutor(max_workers=2) as pool:
            counts = list(pool.map(lambda _: schedule.run(), range(2)))
    assert sum(counts) == 1
    with transaction() as c:
        assert c.execute(text("SELECT count(*) FROM satellite_captures WHERE field_id=:fid"), {"fid": identity["field"]}).scalar() == 1
        assert c.execute(text("SELECT count(*) FROM satellite_captures WHERE field_id=:fid"), {"fid": free["field"]}).scalar() == 0

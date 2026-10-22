"""Real shared PostGIS and sessions; provider/Redis failures are explicitly mocked."""

import json
import time
from concurrent.futures import ThreadPoolExecutor
from datetime import UTC, datetime, timedelta
from unittest.mock import patch

import pytest
from fastapi.testclient import TestClient
from sqlalchemy import text

from app.db import transaction
from app.main import app
from app.weather import provider, service
from tests.irrigation.test_integration import identity
from tests.weather.fixtures import raw

pytestmark = pytest.mark.integration


class MemoryCache:
    value = None

    def get(self, key):
        return self.value

    def setex(self, key, ttl, value):
        self.value = value


@pytest.fixture
def setup():
    owner = identity()
    b = provider.parse(raw(datetime.now(UTC)), datetime.now(UTC))
    with patch.object(service, "cache", return_value=MemoryCache()), patch.object(provider, "fetch", return_value=b) as fetch:
        yield TestClient(app), owner, b, fetch


def url(owner, action="forecast"):
    return f"/api/v1/fields/{owner['field']}/weather/{action}"


def test_persists_and_reuses_forecast(setup):
    client, owner, b, fetch = setup
    for action in ("forecast", "current", "risks", "suitability"):
        response = client.get(url(owner, action), headers=owner["headers"])
        assert response.status_code == 200, response.text
        assert response.json()["freshness"] == "FRESH"
    assert fetch.call_count == 1
    with transaction() as c:
        record = c.execute(text("SELECT metadata,points FROM weather_forecasts WHERE field_id=:id"), {"id": owner["field"]}).first()
        assert record[0]["bundle"]["providerIssuedAt"] is None and len(record[1]) == 168


def test_permissions_and_revocation(setup):
    client, owner, _, fetch = setup
    assert client.get(url(owner)).status_code == 401
    other = identity()
    assert client.get(url(owner), headers=other["headers"]).status_code == 404
    with transaction() as c:
        c.execute(text("UPDATE auth_sessions SET revoked_at=now() WHERE id=:id"), {"id": owner["session"]})
    assert client.get(url(owner), headers=owner["headers"]).status_code == 401
    assert fetch.call_count == 0


def test_outage_stale_then_expired(setup):
    client, owner, b, fetch = setup
    assert client.get(url(owner), headers=owner["headers"]).status_code == 200

    def shift(seconds):
        old = {**b, "fetchedAt": (datetime.now(UTC) - timedelta(seconds=seconds)).isoformat()}
        with transaction() as c:
            c.execute(
                text("UPDATE weather_forecasts SET metadata=jsonb_set(metadata,'{bundle}',CAST(:b AS jsonb)) WHERE field_id=:id"),
                {"id": owner["field"], "b": json.dumps(old)},
            )

    fetch.side_effect = provider.ProviderError()
    with patch.object(service, "cache", return_value=MemoryCache()):
        shift(1000)
        assert client.get(url(owner), headers=owner["headers"]).json()["freshness"] == "STALE"
        assert client.get(url(owner, "risks"), headers=owner["headers"]).json()["recommendationAllowed"] is False
        shift(5000)
        assert client.get(url(owner), headers=owner["headers"]).status_code == 503


def test_concurrent_refresh_never_duplicates_provider_call(setup):
    client, owner, b, fetch = setup

    def slow(*args):
        time.sleep(0.3)
        return b

    fetch.side_effect = slow
    with ThreadPoolExecutor(max_workers=4) as pool:
        results = list(pool.map(lambda _: client.get(url(owner), headers=owner["headers"]), range(4)))
    assert all(r.status_code in (200, 503) for r in results)
    assert any(r.status_code == 200 for r in results)
    assert fetch.call_count == 1


def test_shared_cell_persists_each_field(setup):
    client, owner, _, fetch = setup
    other = identity()
    for user in (owner, other):
        assert client.get(url(user), headers=user["headers"]).status_code == 200
    assert fetch.call_count == 1
    with transaction() as c:
        assert (
            c.execute(
                text("SELECT count(DISTINCT field_id) FROM weather_forecasts WHERE field_id IN (:a,:b)"), {"a": owner["field"], "b": other["field"]}
            ).scalar_one()
            == 2
        )


def test_redis_outage_does_not_mask_successful_persistence(setup):
    import redis

    client, owner, _, fetch = setup
    with patch.object(service, "cache", side_effect=redis.ConnectionError("Synthetic Redis outage")):
        assert client.get(url(owner), headers=owner["headers"]).status_code == 200
        assert client.get(url(owner), headers=owner["headers"]).status_code == 200
    assert fetch.call_count == 1


def test_failed_refresh_does_not_extend_cached_fetched_time(setup):
    client, owner, b, fetch = setup
    old = {**b, "fetchedAt": (datetime.now(UTC) - timedelta(seconds=1000)).isoformat()}
    with transaction() as c:
        ctx = service.context(c, owner["user"], owner["field"])
        service.persist(c, owner["field"], old, f"{round(ctx['latitude'], 3):.3f}:{round(ctx['longitude'], 3):.3f}")
    fetch.side_effect = provider.ProviderError()
    result = client.get(url(owner), headers=owner["headers"])
    assert result.status_code == 200 and result.json()["freshness"] == "STALE"
    assert result.json()["fetchedAt"] == old["fetchedAt"]


def test_field_location_change_invalidates_previous_forecast(setup):
    client, owner, _, fetch = setup
    assert client.get(url(owner), headers=owner["headers"]).status_code == 200
    with transaction() as c:
        c.execute(text("UPDATE fields SET centroid=ST_SetSRID(ST_MakePoint(73,32),4326) WHERE id=:id"), {"id": owner["field"]})
    with patch.object(service, "cache", return_value=MemoryCache()):
        assert client.get(url(owner), headers=owner["headers"]).status_code == 200
    assert fetch.call_count == 2


def test_real_redis_cache_isolation_and_expiry(setup):
    import uuid

    client, owner, _, fetch = setup
    real = service.redis.Redis.from_url(service.get_settings().redis_url, socket_timeout=1)
    prefix = f"test:f04:{uuid.uuid4()}:"
    keys = []

    class IsolatedRedis:
        def get(self, key):
            return real.get(prefix + key)

        def setex(self, key, ttl, value):
            keys.append(prefix + key)
            real.setex(prefix + key, 1, value)

    try:
        with patch.object(service, "cache", return_value=IsolatedRedis()):
            assert client.get(url(owner), headers=owner["headers"]).status_code == 200
            assert keys and real.ttl(keys[0]) in (0, 1)
            time.sleep(1.1)
            assert real.get(keys[0]) is None
            # Database freshness survives Redis eviction without another provider call.
            assert client.get(url(owner), headers=owner["headers"]).status_code == 200
            assert fetch.call_count == 1
    finally:
        if keys:
            real.delete(*keys)

import uuid
from concurrent.futures import ThreadPoolExecutor
from datetime import UTC, datetime
from unittest.mock import patch

import pytest
from fastapi import FastAPI
from fastapi.testclient import TestClient
from sqlalchemy import text
from sqlalchemy.exc import OperationalError

from app.auth import Principal, current_principal
from app.config import get_settings
from app.db import transaction
from app.errors import install
from app.offline.limits import OfflineBodyLimit
from app.offline.router import router
from app.offline.schemas import Batch, Capture

app = FastAPI()
install(app)
app.include_router(router, prefix="/api/v1")
app.add_middleware(OfflineBodyLimit)


def identity():
    # Only integration cases import the shared real-PostGIS fixture and full platform app.
    from tests.irrigation.test_integration import identity as create_identity

    return create_identity()


def record(actor):
    return {
        "clientId": str(uuid.uuid4()),
        "fieldId": actor["field"],
        "cropSeasonId": actor["cycle"],
        "capturedAt": datetime.now(UTC).isoformat(),
        "imageSha256": "a" * 64,
        "prediction": None,
    }


def test_disabled_and_unauthorized_are_explicit():
    client = TestClient(app)
    assert client.get("/api/v1/offline-models/manifest").status_code == 401
    app.dependency_overrides[current_principal] = lambda: Principal("x", "y", "FARMER")
    try:
        with patch.object(get_settings(), "offline_sync_enabled", False):
            r = client.get("/api/v1/offline-models/manifest")
            assert r.status_code == 503 and r.json()["error"]["code"] == "OFFLINE_SYNC_DISABLED"
    finally:
        app.dependency_overrides.clear()


def test_chunked_body_is_bounded_before_parsing():
    assert TestClient(app).post("/api/v1/offline-scans/sync", content=iter([b"x" * 40000, b"x" * 40000])).status_code == 413


@pytest.mark.parametrize(
    "patch_value",
    [
        {"imageSha256": "bad"},
        {"capturedAt": "2035-01-01T00:00:00Z"},
        {"capturedAt": "2026-01-01T00:00:00"},
        {"ownerId": str(uuid.uuid4())},
        {"prediction": {"modelVersionId": str(uuid.uuid4()), "modelSha256": "a" * 64, "label": "x", "score": True}},
    ],
)
def test_bad_payload(patch_value):
    body = record({"field": str(uuid.uuid4()), "cycle": str(uuid.uuid4())})
    with pytest.raises(ValueError):
        Capture.model_validate({**body, **patch_value})


def test_batch_limit_and_duplicate_ids():
    value = record({"field": str(uuid.uuid4()), "cycle": str(uuid.uuid4())})
    for captures in ([], [value, value], [value] * 21):
        with pytest.raises(ValueError):
            Batch(captures=captures)


def test_production_cannot_enable_unreleased_sync():
    from app.config import Settings

    with pytest.raises(ValueError, match="F06 production sync is blocked"):
        Settings(
            NODE_ENV="production",
            OFFLINE_SYNC_ENABLED=True,
            DATABASE_URL="postgresql://synthetic:synthetic@example.invalid/db?sslmode=verify-full",
            JWT_ACCESS_SECRET="synthetic-test-secret-with-at-least-48-characters-long",
        )


@pytest.fixture
def owner(monkeypatch):
    monkeypatch.setattr(get_settings(), "offline_sync_enabled", True)
    return identity()


@pytest.mark.integration
def test_real_sync_replay_changes_and_no_diagnosis(owner):
    client = TestClient(app)
    value = record(owner)
    headers = owner["headers"]
    first = client.post("/api/v1/offline-scans/sync", headers=headers, json={"captures": [value]})
    assert first.status_code == 200, first.text
    assert client.post("/api/v1/offline-scans/sync", headers=headers, json={"captures": [value]}).json() == first.json()
    sid = first.json()["results"][0]["scanId"]
    feed = client.get("/api/v1/offline-scans/changes", headers=headers)
    assert feed.status_code == 200 and feed.headers["cache-control"] == "private, no-store"
    assert len(feed.json()["changes"]) == 1 and feed.json()["changes"][0]["clientInferenceVerified"] is False
    assert client.get("/api/v1/offline-scans/changes", params={"cursor": feed.json()["cursor"]}, headers=headers).json()["changes"] == []
    context = client.get("/api/v1/offline-scans/context", headers=headers)
    assert context.status_code == 200 and context.json()["ownerId"] == owner["user"]
    with transaction() as c:
        assert c.execute(text("SELECT count(*) FROM diagnoses WHERE scan_id=:id"), {"id": sid}).scalar_one() == 0
        assert c.execute(text("SELECT count(*) FROM offline_crop_observations WHERE scan_id=:id"), {"id": sid}).scalar_one() == 1


@pytest.mark.integration
def test_parallel_retries_and_payload_conflict(owner):
    value = record(owner)
    client = TestClient(app)
    with ThreadPoolExecutor(max_workers=2) as pool:
        responses = list(pool.map(lambda _: client.post("/api/v1/offline-scans/sync", headers=owner["headers"], json={"captures": [value]}), range(2)))
    assert all(r.status_code == 200 for r in responses)
    assert responses[0].json() == responses[1].json()
    value["imageSha256"] = "b" * 64
    assert client.post("/api/v1/offline-scans/sync", headers=owner["headers"], json={"captures": [value]}).status_code == 409


@pytest.mark.integration
def test_owner_season_atomicity_and_revocation(owner):
    client = TestClient(app)
    other = identity()
    value = record(owner)
    assert client.post("/api/v1/offline-scans/sync", headers=other["headers"], json={"captures": [value]}).status_code == 404
    wrong = {**record(owner), "cropSeasonId": other["cycle"]}
    assert client.post("/api/v1/offline-scans/sync", headers=owner["headers"], json={"captures": [value, wrong]}).status_code == 404
    with transaction() as c:
        assert c.execute(text("SELECT count(*) FROM offline_crop_observations WHERE owner_id=:uid"), {"uid": owner["user"]}).scalar_one() == 0
        c.execute(text("UPDATE auth_sessions SET revoked_at=now() WHERE id=:id"), {"id": owner["session"]})
    assert client.get("/api/v1/offline-scans/changes", headers=owner["headers"]).status_code == 401


@pytest.mark.integration
def test_unapproved_prediction_is_never_persisted(owner):
    value = record(owner)
    value["prediction"] = {"modelVersionId": str(uuid.uuid4()), "modelSha256": "a" * 64, "label": "fabricated", "score": 0.99}
    response = TestClient(app).post("/api/v1/offline-scans/sync", headers=owner["headers"], json={"captures": [value]})
    assert response.status_code == 409
    assert response.json()["error"]["code"] == "OFFLINE_MODEL_NOT_APPROVED"


def test_storage_outage_is_sanitized(monkeypatch):
    monkeypatch.setattr(get_settings(), "offline_sync_enabled", True)
    app.dependency_overrides[current_principal] = lambda: Principal("x", "y", "FARMER")
    try:
        body = record({"field": str(uuid.uuid4()), "cycle": str(uuid.uuid4())})
        with patch("app.offline.router.transaction", side_effect=OperationalError("private SQL", {}, Exception("private host"))):
            r = TestClient(app).post("/api/v1/offline-scans/sync", json={"captures": [body]})
        assert r.status_code == 503 and "private" not in r.text
    finally:
        app.dependency_overrides.clear()


@pytest.mark.parametrize("path", ["/offline-scans/context", "/offline-scans/changes", "/offline-models/manifest"])
def test_read_storage_outage_is_retryable(monkeypatch, path):
    monkeypatch.setattr(get_settings(), "offline_sync_enabled", True)
    app.dependency_overrides[current_principal] = lambda: Principal("x", "y", "FARMER")
    try:
        with patch("app.offline.router.transaction", side_effect=OperationalError("private SQL", {}, Exception("private host"))):
            response = TestClient(app).get("/api/v1" + path)
        assert response.status_code == 503 and "private" not in response.text
    finally:
        app.dependency_overrides.clear()


def test_wrong_role_cannot_use_offline_sync():
    app.dependency_overrides[current_principal] = lambda: Principal("x", "y", "EXPERT")
    try:
        assert TestClient(app).get("/api/v1/offline-models/manifest").status_code == 403
    finally:
        app.dependency_overrides.clear()

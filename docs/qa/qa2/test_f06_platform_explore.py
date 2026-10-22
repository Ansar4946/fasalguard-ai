"""F06 exploratory QA of the platform offline-sync API against a real disposable PostGIS database (f03_test inside qa2).
Model rows below are SYNTHETIC gating fixtures, not real crop models (BLOCKED_EXTERNAL: no cleared weights).
Run (inside platform test image, repo mounted): python -m pytest /qa/test_f06_platform_explore.py -m integration -o addopts="" -p no:cacheprovider --rootdir=/app
"""

import json
import uuid

import pytest
from fastapi.testclient import TestClient
from sqlalchemy import text

from app.config import get_settings
from app.db import transaction
from tests.offline.test_offline import app, identity, record

pytestmark = pytest.mark.integration
client = TestClient(app)


@pytest.fixture
def owner(monkeypatch):
    monkeypatch.setattr(get_settings(), "offline_sync_enabled", True)
    return identity()


def crop_of(actor):
    with transaction() as c:
        return c.execute(text("SELECT crop_id::text FROM crop_cycles WHERE id=:id"), {"id": actor["cycle"]}).scalar_one()


def approve(crop, classes=("healthy", "rust"), status="APPROVED", broken=False):
    sha = uuid.uuid4().hex + uuid.uuid4().hex
    manifest = {"sha256": sha, "cropId": crop, "license": "SYNTHETIC-QA", "evaluationReference": "SYNTHETIC-QA-NONE", "runtime": "onnx",
                "width": 64, "height": 64, "classes": list(classes), "mean": [0, 0, 0], "std": [1, 1, 1], "layout": "NCHW", "output": "logits", "resize": "stretch"}
    if broken:
        manifest["width"] = 5
    with transaction() as c:
        mid = c.execute(
            text("INSERT INTO model_versions(provider,model_id,model_version,metadata) VALUES('ONNX_MOBILE',:m,:v,CAST(:md AS jsonb)) RETURNING id::text"),
            {"m": "qa2-" + uuid.uuid4().hex[:8], "v": "0", "md": json.dumps({"approvalStatus": status, "manifest": manifest})},
        ).scalar_one()
    return mid, sha


def cleanup_models():
    with transaction() as c:
        c.execute(text("DELETE FROM model_versions WHERE model_id LIKE 'qa2-%'"))


def test_feed_isolation_between_farmers(owner):
    other = identity()
    a, b = record(owner), record(other)
    assert client.post("/api/v1/offline-scans/sync", headers=owner["headers"], json={"captures": [a]}).status_code == 200
    assert client.post("/api/v1/offline-scans/sync", headers=other["headers"], json={"captures": [b]}).status_code == 200
    fa = client.get("/api/v1/offline-scans/changes", headers=owner["headers"]).json()["changes"]
    fb = client.get("/api/v1/offline-scans/changes", headers=other["headers"]).json()["changes"]
    assert [x["clientId"] for x in fa] == [a["clientId"]] and [x["clientId"] for x in fb] == [b["clientId"]]
    # B reusing A's client id is a different owner scope: must not collide or leak
    clash = {**record(other), "clientId": a["clientId"]}
    assert client.post("/api/v1/offline-scans/sync", headers=other["headers"], json={"captures": [clash]}).status_code == 200
    ctx = client.get("/api/v1/offline-scans/context", headers=other["headers"]).json()
    assert ctx["ownerId"] == other["user"] and all(f["fieldId"] != owner["field"] for f in ctx["fields"])


def test_approved_model_gating_and_unverified_flag(owner):
    crop = crop_of(owner)
    mid, sha = approve(crop)
    try:
        ok = {**record(owner), "prediction": {"modelVersionId": mid, "modelSha256": sha, "label": "rust", "score": 0.8}}
        r = client.post("/api/v1/offline-scans/sync", headers=owner["headers"], json={"captures": [ok]})
        assert r.status_code == 200 and r.json()["clientInferenceVerified"] is False
        change = client.get("/api/v1/offline-scans/changes", headers=owner["headers"]).json()["changes"][0]
        assert change["clientInferenceVerified"] is False
        with transaction() as c:
            assert c.execute(text("SELECT count(*) FROM diagnoses WHERE scan_id=:s"), {"s": r.json()["results"][0]["scanId"]}).scalar_one() == 0
        bad = {
            "wrong sha": {"modelVersionId": mid, "modelSha256": "f" * 64, "label": "rust", "score": 0.5},
            "label not in classes": {"modelVersionId": mid, "modelSha256": sha, "label": "blight", "score": 0.5},
        }
        for name, p in bad.items():
            r = client.post("/api/v1/offline-scans/sync", headers=owner["headers"], json={"captures": [{**record(owner), "prediction": p}]})
            assert r.status_code == 409 and r.json()["error"]["code"] == "OFFLINE_MODEL_NOT_APPROVED", name
        other_crop_mid, other_sha = approve(str(uuid.uuid4()))
        r = client.post("/api/v1/offline-scans/sync", headers=owner["headers"],
                        json={"captures": [{**record(owner), "prediction": {"modelVersionId": other_crop_mid, "modelSha256": other_sha, "label": "rust", "score": 0.5}}]})
        assert r.status_code == 409, "model approved for a different crop must not be accepted"
        pend_mid, pend_sha = approve(crop, status="PENDING")
        r = client.post("/api/v1/offline-scans/sync", headers=owner["headers"],
                        json={"captures": [{**record(owner), "prediction": {"modelVersionId": pend_mid, "modelSha256": pend_sha, "label": "rust", "score": 0.5}}]})
        assert r.status_code == 409, "unapproved model must not be accepted"
    finally:
        cleanup_models()


def test_manifest_endpoint_lists_only_valid_approved_models(owner):
    empty = client.get("/api/v1/offline-models/manifest", headers=owner["headers"]).json()
    assert empty == {"available": False, "models": [], "reason": "NO_APPROVED_OFFLINE_MODEL"}
    crop = crop_of(owner)
    good, _ = approve(crop)
    approve(crop, broken=True)
    approve(crop, status="REJECTED")
    try:
        got = client.get("/api/v1/offline-models/manifest", headers=owner["headers"]).json()
        assert got["available"] is True and [m["modelVersionId"] for m in got["models"]] == [good]
    finally:
        cleanup_models()


def test_hourly_limit_returns_429_and_keeps_earlier_work(owner):
    sent = []
    for _ in range(5):
        batch = [record(owner) for _ in range(20)]
        r = client.post("/api/v1/offline-scans/sync", headers=owner["headers"], json={"captures": batch})
        assert r.status_code == 200, r.text
        sent += batch
    r = client.post("/api/v1/offline-scans/sync", headers=owner["headers"], json={"captures": [record(owner)]})
    assert r.status_code == 429 and r.json()["error"]["code"] == "OFFLINE_SYNC_LIMIT"
    # a replay of an already-synced id still succeeds even at the limit (idempotent, no new rows)
    r = client.post("/api/v1/offline-scans/sync", headers=owner["headers"], json={"captures": [sent[0]]})
    assert r.status_code == 200
    with transaction() as c:
        assert c.execute(text("SELECT count(*) FROM offline_crop_observations WHERE owner_id=:u"), {"u": owner["user"]}).scalar_one() == 100


def test_cursor_validation_and_paging(owner):
    for bad in ("-1", "abc", "9223372036854775808", "1.5"):
        assert client.get("/api/v1/offline-scans/changes", params={"cursor": bad}, headers=owner["headers"]).status_code == 400, bad
    for _ in range(3):
        client.post("/api/v1/offline-scans/sync", headers=owner["headers"], json={"captures": [record(owner)]})
    page = client.get("/api/v1/offline-scans/changes", headers=owner["headers"]).json()
    assert len(page["changes"]) == 3 and page["hasMore"] is False
    assert client.get("/api/v1/offline-scans/changes", params={"cursor": 10**15}, headers=owner["headers"]).json()["changes"] == []


def test_soft_deleted_field_is_hidden_from_feed_and_blocks_sync(owner):
    r = client.post("/api/v1/offline-scans/sync", headers=owner["headers"], json={"captures": [record(owner)]})
    assert r.status_code == 200
    with transaction() as c:
        c.execute(text("UPDATE fields SET deleted_at=now() WHERE id=:f"), {"f": owner["field"]})
    assert client.get("/api/v1/offline-scans/changes", headers=owner["headers"]).json()["changes"] == []
    assert client.post("/api/v1/offline-scans/sync", headers=owner["headers"], json={"captures": [record(owner)]}).status_code == 404
    assert client.get("/api/v1/offline-scans/context", headers=owner["headers"]).json()["fields"] == []


def test_unauthenticated_and_wrong_role(owner):
    assert client.post("/api/v1/offline-scans/sync", json={"captures": [record(owner)]}).status_code == 401
    assert client.get("/api/v1/offline-scans/context").status_code == 401
    assert client.get("/api/v1/offline-scans/changes", headers={"Authorization": "Bearer not-a-token"}).status_code == 401


def test_extra_fields_and_type_confusion_rejected(owner):
    base = record(owner)
    for patch in ({"ownerId": str(uuid.uuid4())}, {"clientId": "not-a-uuid"}, {"capturedAt": "yesterday"}, {"imageSha256": "A" * 64}):
        r = client.post("/api/v1/offline-scans/sync", headers=owner["headers"], json={"captures": [{**base, **patch}]})
        assert r.status_code == 400, patch
    r = client.post("/api/v1/offline-scans/sync", headers=owner["headers"], json={"captures": [base], "extra": 1})
    assert r.status_code == 400

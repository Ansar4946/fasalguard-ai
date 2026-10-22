from contextlib import contextmanager
from datetime import UTC, datetime, timedelta
from unittest.mock import patch

from fastapi.testclient import TestClient

from app.auth import Principal
from app.main import app
from app.satellite.router import CreateScan, farmer

CLIENT = TestClient(app)
CID = "89814600-84a4-48ad-93a8-df65b2e2a001"


@contextmanager
def fake_transaction():
    yield object()


def test_unauthenticated():
    assert CLIENT.get(f"/api/v1/satellite-scans/{CID}").status_code == 401


def test_other_owner_and_unknown_capture_are_non_disclosing():
    app.dependency_overrides[farmer] = lambda: Principal("other-user", "session", "FARMER")
    try:
        with patch("app.satellite.router.transaction", fake_transaction), patch("app.satellite.repository.get", return_value=None):
            assert CLIENT.get(f"/api/v1/satellite-scans/{CID}").status_code == 404
            assert CLIENT.get(f"/api/v1/satellite-scans/{CID}/layers").status_code == 404
            assert CLIENT.get(f"/api/v1/satellite-scans/{CID}/layers/NDVI/content").status_code == 404
    finally:
        app.dependency_overrides.clear()


def test_invalid_dates_and_nonfinite_cloud():
    import pytest
    from pydantic import ValidationError

    now = datetime.now(UTC)
    for body in (
        {"from": now, "to": now},
        {"from": now - timedelta(days=91), "to": now},
        {"from": "2025-01-01", "to": "2025-02-01"},
        {"maxCloudCoverage": float("nan")},
    ):
        with pytest.raises(ValidationError):
            CreateScan.model_validate(body)

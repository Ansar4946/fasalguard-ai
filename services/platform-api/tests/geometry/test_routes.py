from unittest.mock import patch

from fastapi.testclient import TestClient
from sqlalchemy.exc import OperationalError

from app.auth import Principal, current_principal
from app.main import app
from tests.geometry.fixtures import square


def test_missing_auth_and_role_are_denied():
    client = TestClient(app)
    assert client.post("/api/v1/geometry/validate", json={}).status_code == 401
    app.dependency_overrides[current_principal] = lambda: Principal("x", "y", "EXPERT")
    try:
        assert client.post("/api/v1/geometry/validate", json={"geometry": {"type": "Polygon", "coordinates": []}}).status_code == 403
    finally:
        app.dependency_overrides.clear()


def test_body_is_capped_even_without_content_length():
    response = TestClient(app).post("/api/v1/geometry/validate", content=iter([b"x" * 150000, b"y" * 150000]))
    assert response.status_code == 413


def test_storage_outage_is_sanitized_and_retryable():
    app.dependency_overrides[current_principal] = lambda: Principal("x", "y", "FARMER")
    try:
        with patch("app.geometry.router.transaction", side_effect=OperationalError("private SQL", {}, Exception("private host"))):
            response = TestClient(app).post("/api/v1/geometry/validate", json={"geometry": square()})
        assert response.status_code == 503
        assert response.json()["error"]["code"] == "GEOMETRY_UNAVAILABLE"
        assert "private" not in response.text
    finally:
        app.dependency_overrides.clear()

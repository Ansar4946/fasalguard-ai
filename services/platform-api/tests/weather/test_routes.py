from fastapi.testclient import TestClient

from app.auth import Principal, current_principal
from app.main import app


def test_anonymous_and_nonfarmer_denied():
    client = TestClient(app)
    path = "/api/v1/fields/00000000-0000-4000-8000-000000000000/weather/forecast"
    assert client.get(path).status_code == 401
    app.dependency_overrides[current_principal] = lambda: Principal("test", "test", "EXPERT")
    try:
        assert client.get(path).status_code == 403
    finally:
        app.dependency_overrides.clear()


def test_invalid_field_identifier():
    app.dependency_overrides[current_principal] = lambda: Principal("test", "test", "FARMER")
    try:
        assert TestClient(app).get("/api/v1/fields/not-a-uuid/weather/forecast").status_code == 400
    finally:
        app.dependency_overrides.clear()

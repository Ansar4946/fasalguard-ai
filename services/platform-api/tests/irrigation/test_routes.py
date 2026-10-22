from uuid import uuid4

from fastapi.testclient import TestClient

from app.auth import Principal, current_principal
from app.main import app


def test_irrigation_requires_auth_and_caps_body():
    client = TestClient(app)
    path = f"/api/v1/fields/{uuid4()}/irrigation/context"
    assert client.get(path).status_code == 401
    assert client.post(path, content=b"x" * 262145).status_code == 413


def test_farmer_role_and_unknown_field_permissions():
    client = TestClient(app)
    path = f"/api/v1/fields/{uuid4()}/irrigation/context"
    try:
        app.dependency_overrides[current_principal] = lambda: Principal(str(uuid4()), str(uuid4()), "EXPERT")
        assert client.get(path).status_code == 403
    finally:
        app.dependency_overrides.clear()

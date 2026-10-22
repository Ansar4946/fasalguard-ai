"""A database outage must answer 503 (retryable), never 500."""

from fastapi import FastAPI
from fastapi.testclient import TestClient
from sqlalchemy.exc import OperationalError
from sqlalchemy.exc import TimeoutError as PoolTimeoutError

from app.errors import install


def _client() -> TestClient:
    app = FastAPI()
    install(app)

    @app.get("/down")
    def down():
        raise OperationalError("SELECT 1", {}, Exception("connection refused postgres://user:secret@db/x"))

    @app.get("/pool")
    def pool():
        raise PoolTimeoutError("QueuePool limit reached")

    @app.get("/bug")
    def bug():
        raise RuntimeError("boom")

    return TestClient(app, raise_server_exceptions=False)


def test_operational_error_is_503_without_leaking_details():
    r = _client().get("/down")
    assert r.status_code == 503
    assert r.json()["error"]["code"] == "SERVICE_UNAVAILABLE"
    assert "secret" not in r.text and "postgres" not in r.text


def test_pool_timeout_is_503():
    assert _client().get("/pool").status_code == 503


def test_other_errors_stay_500():
    assert _client().get("/bug").status_code == 500

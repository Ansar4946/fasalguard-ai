"""Production startup/readiness policy; test values only, no real services."""

from unittest.mock import MagicMock, patch

import pytest
from fastapi.testclient import TestClient
from pydantic import ValidationError

from app.config import Settings
from app.main import app


def configuration(**overrides):
    return {
        "NODE_ENV": "production",
        "JWT_ACCESS_SECRET": "synthetic-configuration-secret-" * 3,
        "DATABASE_URL": "postgresql://user:synthetic@db.example.invalid/db?sslmode=verify-full",
        "REDIS_URL": "rediss://user:synthetic@cache.example.invalid:6380/0",
        "PLATFORM_CELERY_BROKER_URL": "rediss://user:synthetic@cache.example.invalid:6380/2",
        **overrides,
    }


def test_secure_production_configuration():
    assert Settings(**configuration()).environment == "production"


@pytest.mark.parametrize(
    "overrides",
    [
        {"DATABASE_URL": "postgresql://user:do-not-expose@db/db"},
        {"DATABASE_URL": "postgresql://user:do-not-expose@db/db?sslmode=require"},
        {"JWT_ACCESS_SECRET": "do-not-expose-short-secret-12345678"},
        {"REDIS_URL": "redis://user:do-not-expose@cache/0"},
        {"REDIS_URL": "rediss://cache/0?ssl_cert_reqs=none"},
        {"PLATFORM_CELERY_BROKER_URL": "redis://cache/2"},
        {"PLATFORM_CELERY_BROKER_URL": "rediss://cache/2?ssl_cert_reqs=none"},
        {"PLATFORM_CELERY_BROKER_URL": "rediss://user:synthetic@cache.example.invalid:6380/0"},
    ],
)
def test_insecure_configuration_fails_without_leaking_values(overrides):
    with pytest.raises(ValidationError) as caught:
        Settings(**configuration(**overrides))
    assert "do-not-expose" not in str(caught.value)
    assert "user:synthetic" not in str(caught.value)


@pytest.mark.parametrize("database,cache,expected", [(True, True, 200), (False, True, 503), (True, False, 503), (False, False, 503)])
def test_dependency_readiness(database, cache, expected):
    connection = MagicMock()
    connection.__enter__.return_value.ping.return_value = cache
    with patch("app.main.db.ping", return_value=database), patch("app.main.redis.Redis.from_url", return_value=connection):
        response = TestClient(app).get("/api/v1/ready")
        assert response.status_code == expected
        assert response.json()["database"] is database
        assert response.json()["redis"] is cache

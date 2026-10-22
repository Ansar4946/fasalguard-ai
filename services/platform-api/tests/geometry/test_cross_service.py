"""Actual HTTP proof that Nest and FastAPI coordinate on the same PostGIS lock/version."""

import os
from concurrent.futures import ThreadPoolExecutor

import httpx
import pytest
from fastapi.testclient import TestClient

from app.main import app
from tests.geometry.fixtures import with_hole
from tests.irrigation.test_integration import identity

pytestmark = [pytest.mark.integration, pytest.mark.skipif(not os.getenv("F05_CORE_API_URL"), reason="Requires isolated current core API HTTP endpoint")]


def test_cross_service_boundary_writes_conflict_and_metadata_edit_preserves_holes():
    owner = identity()
    shape = with_hole()
    core = os.environ["F05_CORE_API_URL"].rstrip("/")
    with httpx.Client(timeout=20, trust_env=False) as client, ThreadPoolExecutor(max_workers=2) as pool:
        nest = pool.submit(client.patch, f"{core}/fields/{owner['field']}", headers=owner["headers"], json={"boundary": shape, "expectedVersion": 1})
        python = pool.submit(
            TestClient(app).patch,
            f"/api/v1/fields/{owner['field']}/boundary",
            headers=owner["headers"],
            json={"geometry": shape, "expectedVersion": 1, "source": "MAP_DRAWN"},
        )
        responses = [nest.result(), python.result()]
        assert sorted(r.status_code for r in responses) == [200, 409]
        current = client.get(f"{core}/fields/{owner['field']}", headers=owner["headers"])
        assert current.status_code == 200
        assert current.json()["version"] == 2 and current.json()["boundary"] == shape
        renamed = client.patch(f"{core}/fields/{owner['field']}", headers=owner["headers"], json={"name": "Synthetic metadata-only edit"})
        assert renamed.status_code == 200
        assert renamed.json()["boundary"] == shape and renamed.json()["version"] == 3

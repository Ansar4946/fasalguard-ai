"""Actual PostGIS, shared JWT sessions and transactions; synthetic parcels only."""

import json
import uuid
from concurrent.futures import ThreadPoolExecutor

import pytest
from fastapi.testclient import TestClient
from sqlalchemy import text

from app.db import transaction
from app.geometry import service
from app.main import app
from tests.geometry.fixtures import feature, square, with_hole
from tests.irrigation.test_integration import identity

pytestmark = pytest.mark.integration


@pytest.fixture
def owner():
    actor = identity()
    with transaction() as c:
        actor["farm"] = c.execute(text("SELECT farm_id::text FROM fields WHERE id=:id"), {"id": actor["field"]}).scalar_one()
    return actor


def submit(client, owner, data=None, key=None):
    return client.post(
        f"/api/v1/farms/{owner['farm']}/fields/import",
        headers=owner["headers"],
        json={"geojson": data or feature(), "idempotencyKey": key or str(uuid.uuid4())},
    )


def test_import_export_roundtrip_holes_and_idempotency(owner):
    client = TestClient(app)
    key = str(uuid.uuid4())
    first = submit(client, owner, key=key)
    assert first.status_code == 201, first.text
    assert submit(client, owner, key=key).json() == first.json()
    fid = first.json()["fields"][0]["id"]
    output = client.get(f"/api/v1/farms/{owner['farm']}/fields/geojson", headers=owner["headers"])
    assert output.status_code == 200 and output.headers["cache-control"] == "private, no-store"
    item = next(f for f in output.json()["features"] if f["id"] == fid)
    assert item["geometry"] == with_hole() and item["properties"]["version"] == 1
    assert submit(client, owner, data=feature(name="Different"), key=key).status_code == 409
    with transaction() as c:
        assert c.execute(text("SELECT count(*) FROM field_geometry_imports WHERE owner_id=:id"), {"id": owner["user"]}).scalar_one() == 1


def test_invalid_topology_and_atomic_import_rollback(owner):
    client = TestClient(app)
    bow = {"type": "Polygon", "coordinates": [[[72.0002, 31.0002], [72.0008, 31.0008], [72.0002, 31.0008], [72.0008, 31.0002], [72.0002, 31.0002]]]}
    for bad in (bow, square(73, 32), {"type": "Polygon", "coordinates": [[[72, 31], [72.001, 31], [72.002, 31], [72, 31]]]}):
        result = submit(client, owner, {"type": "FeatureCollection", "features": [feature(), feature(bad)]})
        assert result.status_code == 400, result.text
    with transaction() as c:
        assert c.execute(text("SELECT count(*) FROM fields WHERE farm_id=:id"), {"id": owner["farm"]}).scalar_one() == 1
        assert c.execute(text("SELECT count(*) FROM field_geometry_imports WHERE owner_id=:id"), {"id": owner["user"]}).scalar_one() == 0


def test_geodesic_area_golden_and_hole_subtraction(owner):
    # Independent pyproj3.7.2 Geod(ellps='WGS84').polygon_area_perimeter reference, executed separately.
    with transaction() as c:
        golden = service.metrics(c, {"type": "Polygon", "coordinates": [[[0, 0], [1, 0], [1, 1], [0, 1], [0, 0]]]})
        assert golden["areaSquareMeters"] == pytest.approx(12308778361.469452, rel=1e-10)
        assert golden["areaAcres"] == pytest.approx(golden["areaSquareMeters"] / 4046.8564224)
        assert service.metrics(c, with_hole())["areaSquareMeters"] < service.metrics(c, square())["areaSquareMeters"]
    result = TestClient(app).post("/api/v1/geometry/validate", headers=owner["headers"], json={"geometry": with_hole(), "farmId": owner["farm"]})
    assert result.status_code == 200 and result.json()["isSurvey"] is False


def test_foreign_owner_and_revoked_session_denied(owner):
    client = TestClient(app)
    other = identity()
    endpoint = f"/api/v1/farms/{owner['farm']}/fields/geojson"
    assert client.get(endpoint).status_code == 401
    assert client.get(endpoint, headers=other["headers"]).status_code == 404
    assert (
        client.patch(
            f"/api/v1/fields/{owner['field']}/boundary", headers=other["headers"], json={"geometry": square(), "expectedVersion": 1, "source": "MAP_DRAWN"}
        ).status_code
        == 404
    )
    with transaction() as c:
        c.execute(text("UPDATE auth_sessions SET revoked_at=now() WHERE id=:id"), {"id": owner["session"]})
    assert client.get(endpoint, headers=owner["headers"]).status_code == 401


def test_concurrent_updates_have_one_version_conflict(owner):
    client = TestClient(app)
    url = f"/api/v1/fields/{owner['field']}/boundary"
    body = {"geometry": with_hole(), "expectedVersion": 1, "source": "MAP_DRAWN"}
    with ThreadPoolExecutor(max_workers=2) as pool:
        results = list(pool.map(lambda _: client.patch(url, headers=owner["headers"], json=body), range(2)))
    assert sorted(r.status_code for r in results) == [200, 409]
    assert next(r.json() for r in results if r.status_code == 200)["version"] == 2


def test_concurrent_import_retries_create_once(owner):
    client = TestClient(app)
    key = str(uuid.uuid4())
    with ThreadPoolExecutor(max_workers=2) as pool:
        results = list(pool.map(lambda _: submit(client, owner, key=key), range(2)))
    assert all(r.status_code == 201 for r in results)
    assert results[0].json()["fields"][0]["id"] == results[1].json()["fields"][0]["id"]


def test_gps_metadata_persists_and_failed_update_preserves_geometry(owner):
    client = TestClient(app)
    shape = square()
    samples = [{"longitude": p[0], "latitude": p[1], "accuracyMeters": 12, "capturedAt": "2026-10-14T10:00:00Z"} for p in shape["coordinates"][0][:-1]]
    url = f"/api/v1/fields/{owner['field']}/boundary"
    body = {"geometry": shape, "expectedVersion": 1, "source": "GPS_CAPTURE", "gpsSamples": samples, "confirmedGpsAccuracy": True}
    response = client.patch(url, headers=owner["headers"], json=body)
    assert response.status_code == 200, response.text
    with transaction() as c:
        metadata = c.execute(text("SELECT boundary_metadata FROM fields WHERE id=:id"), {"id": owner["field"]}).scalar_one()
        assert metadata["gpsSamples"] == samples and metadata["source"] == "GPS_CAPTURE"
    bad = {"geometry": square(73, 32), "expectedVersion": 2, "source": "MAP_DRAWN"}
    assert client.patch(url, headers=owner["headers"], json=bad).status_code == 400
    with transaction() as c:
        assert c.execute(text("SELECT version FROM fields WHERE id=:id"), {"id": owner["field"]}).scalar_one() == 2


def test_invalid_holes_and_farm_holes_are_rejected(owner):
    client = TestClient(app)
    outside_hole = square()
    outside_hole["coordinates"].append(square(72.0012, 31.0012, 0.0001)["coordinates"][0])
    assert submit(client, owner, feature(outside_hole)).status_code == 400
    with transaction() as c:
        parent = {
            "type": "Polygon",
            "coordinates": [
                [[72, 31], [72.002, 31], [72.002, 31.002], [72, 31.002], [72, 31]],
                square()["coordinates"][0],
            ],
        }
        c.execute(text("UPDATE farms SET boundary=ST_SetSRID(ST_GeomFromGeoJSON(:g),4326) WHERE id=:id"), {"g": json.dumps(parent), "id": owner["farm"]})
    # Entirely inside the outer farm ring, but inside its excluded hole.
    assert submit(client, owner, feature(square(72.0003, 31.0003, 0.0001))).status_code == 400


def test_deleted_field_cannot_be_read_via_import_replay(owner):
    client = TestClient(app)
    key = str(uuid.uuid4())
    created = submit(client, owner, key=key)
    assert created.status_code == 201
    with transaction() as c:
        c.execute(text("UPDATE fields SET deleted_at=now() WHERE id=:id"), {"id": created.json()["fields"][0]["id"]})
    assert submit(client, owner, key=key).status_code == 404


def test_conflicting_field_names_are_sanitized_and_atomic(owner):
    client = TestClient(app)
    assert submit(client, owner).status_code == 201
    conflict = submit(client, owner)
    assert conflict.status_code == 409
    assert conflict.json()["error"]["code"] == "IMPORT_CONFLICT"
    assert "uq_fields" not in conflict.text
    with transaction() as c:
        assert c.execute(text("SELECT count(*) FROM fields WHERE farm_id=:id"), {"id": owner["farm"]}).scalar_one() == 2


def test_empty_collection_and_foreign_import(owner):
    client = TestClient(app)
    stranger = identity()
    assert submit(client, {**owner, "headers": stranger["headers"]}).status_code == 404
    with transaction() as c:
        c.execute(text("UPDATE fields SET deleted_at=now() WHERE farm_id=:id"), {"id": owner["farm"]})
    response = client.get(f"/api/v1/farms/{owner['farm']}/fields/geojson", headers=owner["headers"])
    assert response.status_code == 200 and response.json() == {"type": "FeatureCollection", "features": []}


def test_export_enforces_aggregate_vertex_limit_before_serialization(owner):
    with transaction() as c:
        c.execute(
            text("""INSERT INTO fields(farm_id,name,boundary,centroid,area_hectares)
          SELECT f.id,'Synthetic dense parcel ' || series.n,ST_Segmentize(f.boundary,0.000002),f.centroid,f.area_hectares
          FROM farms f CROSS JOIN generate_series(1,13) series(n) WHERE f.id=:id"""),
            {"id": owner["farm"]},
        )
    result = TestClient(app).get(f"/api/v1/farms/{owner['farm']}/fields/geojson", headers=owner["headers"])
    assert result.status_code == 413

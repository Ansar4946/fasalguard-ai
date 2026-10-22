import copy
import uuid

import pytest
from pydantic import ValidationError

from app.geometry.schemas import Boundary, Import, Validate
from tests.geometry.fixtures import feature, square, with_hole


def test_preserves_holes_and_ignores_imported_identity_properties():
    f = feature()
    f["id"] = str(uuid.uuid4())
    f["properties"].update({"farmId": "foreign", "owner_id": "foreign", "areaHectares": 999})
    result = Import(geojson=f, idempotencyKey=uuid.uuid4())
    assert result.geojson["features"][0]["geometry"] == with_hole()
    assert result.geojson["features"][0]["properties"] == {"name": "Synthetic imported field"}


@pytest.mark.parametrize(
    "change",
    ["point-null", "point-number", "point-object", "empty", "open", "few", "bool", "nan", "inf", "lon", "lat", "z", "multi", "crs", "dateline", "many"],
)
def test_invalid_shapes_fail_cleanly(change):
    g = copy.deepcopy(square())
    if change.startswith("point-"):
        g["coordinates"][0][0] = {"point-null": None, "point-number": 7, "point-object": {}}[change]
    if change == "empty":
        g["coordinates"] = []
    if change == "open":
        g["coordinates"][0][-1] = [72.5, 31.5]
    if change == "few":
        g["coordinates"][0] = [[72, 31]] * 4
    if change in {"bool", "nan", "inf", "lon", "lat", "z"}:
        g["coordinates"][0][0] = {
            "bool": [True, 31],
            "nan": [float("nan"), 31],
            "inf": [float("inf"), 31],
            "lon": [181, 31],
            "lat": [72, 91],
            "z": [72, 31, 1],
        }[change]
    if change == "multi":
        g["type"] = "MultiPolygon"
    if change == "crs":
        g["crs"] = {"name": "EPSG:3857"}
    if change == "dateline":
        g = {"type": "Polygon", "coordinates": [[[179, 0], [-179, 0], [-179, 1], [179, 0]]]}
    if change == "many":
        g["coordinates"][0] = g["coordinates"][0] * 1001
    with pytest.raises(ValidationError):
        Validate(geometry=g)


@pytest.mark.parametrize(
    "data",
    [
        {"type": "FeatureCollection", "features": []},
        {"type": "FeatureCollection", "features": [feature()] * 26},
        {"type": "Feature", "geometry": square(), "properties": {"name": "x"}},
        {"type": "LineString", "coordinates": []},
    ],
)
def test_invalid_import_envelopes(data):
    with pytest.raises(ValidationError):
        Import(geojson=data, idempotencyKey=uuid.uuid4())


def test_gps_requires_confirmation_matching_samples_and_timezone():
    shape = square()
    samples = [{"longitude": p[0], "latitude": p[1], "accuracyMeters": 8, "capturedAt": "2026-10-14T10:00:00Z"} for p in shape["coordinates"][0][:-1]]
    base = {"geometry": shape, "expectedVersion": 1, "source": "GPS_CAPTURE", "gpsSamples": samples, "confirmedGpsAccuracy": True}
    assert len(Boundary(**base).gpsSamples) == 4
    for invalid in ({"confirmedGpsAccuracy": False}, {"gpsSamples": samples[:-1]}, {"source": "MAP_DRAWN"}, {"expectedVersion": True}):
        with pytest.raises(ValidationError):
            Boundary(**{**base, **invalid})
    samples[0]["capturedAt"] = "2026-10-14T10:00:00"
    with pytest.raises(ValidationError):
        Boundary(**base)

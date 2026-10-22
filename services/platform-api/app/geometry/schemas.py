"""Bounded RFC7946 Polygon inputs. PostGIS remains the topology/area authority."""

import math
from datetime import datetime
from typing import Literal
from uuid import UUID

from pydantic import BaseModel, ConfigDict, Field, field_validator, model_validator

MAX_VERTICES = 5000
MAX_FEATURES = 25


def polygon(value):
    if not isinstance(value, dict) or value.get("type") != "Polygon" or "crs" in value:
        raise ValueError("Provide a WGS84 GeoJSON Polygon; other geometries/CRS are unsupported.")
    rings = value.get("coordinates")
    if not isinstance(rings, list) or not 1 <= len(rings) <= 21:
        raise ValueError("A polygon needs an exterior ring and at most 20 holes.")
    if sum(len(r) if isinstance(r, list) else MAX_VERTICES + 1 for r in rings) > MAX_VERTICES:
        raise ValueError("Polygon exceeds 5000 positions.")
    for ring in rings:
        if not isinstance(ring, list) or len(ring) < 4:
            raise ValueError("Each ring requires at least four positions.")
        for point in ring:
            if not isinstance(point, list) or len(point) != 2:
                raise ValueError("Positions must contain exactly longitude and latitude (2D).")
            if any(isinstance(v, bool) or not isinstance(v, int | float) or not math.isfinite(v) for v in point):
                raise ValueError("Coordinates must be finite numbers.")
            if not -180 <= point[0] <= 180 or not -90 <= point[1] <= 90:
                raise ValueError("Coordinates are outside WGS84 bounds.")
        if ring[0] != ring[-1] or len({tuple(p) for p in ring[:-1]}) < 3:
            raise ValueError("Rings must be closed and contain three distinct vertices.")
        if any(abs(a[0] - b[0]) > 180 for a, b in zip(ring, ring[1:], strict=False)):
            raise ValueError("Antimeridian-crossing boundaries are unsupported.")
    return {"type": "Polygon", "coordinates": rings}


class Strict(BaseModel):
    model_config = ConfigDict(extra="forbid", allow_inf_nan=False)


class Validate(Strict):
    geometry: dict
    farmId: UUID | None = None
    _polygon = field_validator("geometry")(polygon)


class Sample(Strict):
    longitude: float = Field(ge=-180, le=180)
    latitude: float = Field(ge=-90, le=90)
    accuracyMeters: float = Field(gt=0, le=10000)
    capturedAt: datetime

    @field_validator("longitude", "latitude", "accuracyMeters", mode="before")
    @classmethod
    def no_bool(cls, v):
        if isinstance(v, bool):
            raise ValueError("A measurement cannot be a boolean.")
        return v

    @field_validator("capturedAt")
    @classmethod
    def timezone_required(cls, v):
        if v.tzinfo is None:
            raise ValueError("GPS timestamps require a timezone.")
        return v


class Boundary(Validate):
    expectedVersion: int = Field(ge=1, strict=True)
    source: Literal["MAP_DRAWN", "GEOJSON_IMPORT", "GPS_CAPTURE"]
    gpsSamples: list[Sample] = Field(default_factory=list, max_length=MAX_VERTICES)
    confirmedGpsAccuracy: bool = False

    @model_validator(mode="after")
    def gps_matches(self):
        if self.source == "GPS_CAPTURE":
            if not self.confirmedGpsAccuracy or len(self.geometry["coordinates"]) != 1:
                raise ValueError("Confirm GPS accuracy; GPS capture supports one exterior ring.")
            vertices = self.geometry["coordinates"][0][:-1]
            if len(vertices) != len(self.gpsSamples):
                raise ValueError("Every GPS vertex requires a measurement.")
            for point, sample in zip(vertices, self.gpsSamples, strict=False):
                if abs(point[0] - sample.longitude) > 1e-9 or abs(point[1] - sample.latitude) > 1e-9:
                    raise ValueError("GPS samples must match the boundary vertices.")
        elif self.gpsSamples:
            raise ValueError("GPS samples require GPS_CAPTURE source.")
        return self


class Import(Strict):
    geojson: dict
    idempotencyKey: UUID

    @field_validator("geojson")
    @classmethod
    def bounded_features(cls, value):
        if "crs" in value:
            raise ValueError("Only RFC7946 WGS84 GeoJSON is supported.")
        kind = value.get("type")
        if kind == "Polygon":
            features = [{"type": "Feature", "geometry": value, "properties": {"name": "Imported field"}}]
        elif kind == "Feature":
            features = [value]
        elif kind == "FeatureCollection":
            features = value.get("features")
        else:
            raise ValueError("Provide a Polygon, Feature or FeatureCollection.")
        if not isinstance(features, list) or not 1 <= len(features) <= MAX_FEATURES:
            raise ValueError("Import must contain 1–25 polygon features.")
        normalized = []
        total = 0
        for i, feature in enumerate(features):
            if not isinstance(feature, dict) or feature.get("type") != "Feature" or "crs" in feature:
                raise ValueError("Each imported entry must be a Feature.")
            geometry = polygon(feature.get("geometry"))
            total += sum(len(r) for r in geometry["coordinates"])
            props = feature.get("properties") or {}
            if not isinstance(props, dict):
                raise ValueError("Properties must be an object.")
            name = props.get("name", f"Imported field {i + 1}")
            if not isinstance(name, str) or not 2 <= len(name.strip()) <= 160:
                raise ValueError("Field names must contain 2–160 characters.")
            normalized.append({"type": "Feature", "geometry": geometry, "properties": {"name": name.strip()}})
        if total > MAX_VERTICES:
            raise ValueError("Import exceeds 5000 positions in total.")
        return {"type": "FeatureCollection", "features": normalized}

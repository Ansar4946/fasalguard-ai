"""PostGIS topology, spheroidal area, permissions and shared farm transaction locks."""

import json

from sqlalchemy import text

from app.errors import ApiError

ACRE_M2 = 4046.8564224


def lock(c, farm_id):
    c.execute(text("SET LOCAL lock_timeout='5s'"))
    c.execute(text("SET LOCAL statement_timeout='8s'"))
    c.execute(text("SELECT pg_advisory_xact_lock(hashtextextended(:key,0))"), {"key": f"farm-boundary:{farm_id}"})


def farm(c, user_id, farm_id):
    row = (
        c.execute(
            text("""SELECT f.id::text,f.version FROM farms f JOIN farmer_profiles fp ON fp.id=f.farmer_id
      JOIN users u ON u.id=fp.user_id WHERE f.id=:id AND fp.user_id=:uid AND f.deleted_at IS NULL
      AND u.deleted_at IS NULL AND u.status='active'"""),
            {"id": str(farm_id), "uid": user_id},
        )
        .mappings()
        .first()
    )
    if not row:
        raise ApiError(404, "FARM_NOT_FOUND", "Farm not found.")
    return dict(row)


def field(c, user_id, field_id):
    row = (
        c.execute(
            text("""SELECT fi.id::text,fi.farm_id::text AS "farmId",fi.version,fi.name,
      ST_AsGeoJSON(fi.boundary)::json AS boundary,fi.area_hectares AS "areaHectares",
      ST_AsGeoJSON(fi.centroid)::json AS centroid,fi.created_at AS "createdAt",fi.updated_at AS "updatedAt"
      FROM fields fi JOIN farms f ON f.id=fi.farm_id JOIN farmer_profiles fp ON fp.id=f.farmer_id
      JOIN users u ON u.id=fp.user_id WHERE fi.id=:id AND fp.user_id=:uid AND fi.deleted_at IS NULL
      AND f.deleted_at IS NULL AND u.deleted_at IS NULL AND u.status='active'"""),
            {"id": str(field_id), "uid": user_id},
        )
        .mappings()
        .first()
    )
    if not row:
        raise ApiError(404, "FIELD_NOT_FOUND", "Field not found.")
    return dict(row)


def metrics(c, geometry, farm_id=None):
    data = {"geometry": json.dumps(geometry)}
    # Validate topology before invoking geography measurement on an invalid surface.
    valid = c.execute(text("SELECT ST_IsValid(ST_SetSRID(ST_GeomFromGeoJSON(:geometry),4326),0)"), data).scalar()
    if not valid:
        raise ApiError(400, "INVALID_POLYGON", "Boundary is self-intersecting or has invalid rings/holes.")
    row = (
        c.execute(
            text("""WITH g AS (SELECT ST_SetSRID(ST_GeomFromGeoJSON(:geometry),4326) value)
      SELECT ST_Area(value::geography,true) AS "areaSquareMeters",ST_AsGeoJSON(ST_Centroid(value))::json AS centroid,
      ARRAY[ST_XMin(value),ST_YMin(value),ST_XMax(value),ST_YMax(value)] AS bbox FROM g"""),
            data,
        )
        .mappings()
        .one()
    )
    area = float(row["areaSquareMeters"])
    if area <= 0:
        raise ApiError(400, "INVALID_POLYGON_AREA", "Boundary area must be positive.")
    if farm_id:
        contained = c.execute(
            text("SELECT ST_CoveredBy(ST_SetSRID(ST_GeomFromGeoJSON(:geometry),4326),boundary) FROM farms WHERE id=:id AND deleted_at IS NULL"),
            {**data, "id": str(farm_id)},
        ).scalar()
        if not contained:
            raise ApiError(400, "FIELD_OUTSIDE_FARM", "Field must be inside its parent farm, including farm holes.")
    return {
        **dict(row),
        "areaSquareMeters": area,
        "areaHectares": area / 10000,
        "areaAcres": area / ACRE_M2,
        "areaMethod": "PostGIS geography WGS84 spheroid",
        "isSurvey": False,
    }


def collection(c, user_id, farm_id):
    farm(c, user_id, farm_id)
    lock(c, farm_id)
    farm(c, user_id, farm_id)
    size = (
        c.execute(
            text("SELECT count(*) AS fields,coalesce(sum(ST_NPoints(boundary)),0) AS vertices FROM fields WHERE farm_id=:id AND deleted_at IS NULL"),
            {"id": str(farm_id)},
        )
        .mappings()
        .one()
    )
    if size["fields"] > 1000 or size["vertices"] > 50000:
        raise ApiError(413, "EXPORT_TOO_LARGE", "Export supports up to 1000 fields and 50000 positions per farm.")
    rows = (
        c.execute(
            text("""SELECT id::text,name,version,area_hectares,ST_AsGeoJSON(boundary)::json AS geometry
      FROM fields WHERE farm_id=:id AND deleted_at IS NULL ORDER BY created_at,id LIMIT 1001"""),
            {"id": str(farm_id)},
        )
        .mappings()
        .all()
    )
    if len(rows) > 1000:
        raise ApiError(413, "EXPORT_TOO_LARGE", "Export supports up to 1000 fields per farm.")
    return {
        "type": "FeatureCollection",
        "features": [
            {
                "type": "Feature",
                "id": r["id"],
                "geometry": r["geometry"],
                "properties": {
                    "name": r["name"],
                    "farmId": str(farm_id),
                    "version": r["version"],
                    "areaHectares": r["area_hectares"],
                    "areaAcres": float(r["area_hectares"]) * 10000 / ACRE_M2,
                },
            }
            for r in rows
        ],
    }

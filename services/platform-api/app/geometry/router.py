"""F05 bounded geometry operations; import cannot assign identities or crop seasons."""

import hashlib
import json
from uuid import UUID

from fastapi import APIRouter, Depends, Response
from sqlalchemy import text
from sqlalchemy.exc import IntegrityError, OperationalError

from app.auth import Principal, require_roles
from app.db import transaction
from app.errors import ApiError
from app.geometry import service as geo
from app.geometry.schemas import Boundary, Import, Validate
from app.logging import log

router = APIRouter(tags=["Farm maps and boundaries"])
farmer = require_roles("FARMER")


def private(response):
    response.headers["Cache-Control"] = "private, no-store"
    response.headers["X-Content-Type-Options"] = "nosniff"


@router.post("/geometry/validate")
def validate(body: Validate, p: Principal = Depends(farmer)):
    try:
        with transaction() as c:
            c.execute(text("SET LOCAL statement_timeout='8s'"))
            if body.farmId:
                geo.farm(c, p.user_id, body.farmId)
            return geo.metrics(c, body.geometry, body.farmId)
    except OperationalError as exc:
        raise ApiError(503, "GEOMETRY_UNAVAILABLE", "Boundary storage is busy or unavailable. Retry shortly.") from exc


@router.get("/farms/{farm_id}/fields/geojson")
def export(farm_id: UUID, response: Response, p: Principal = Depends(farmer)):
    private(response)
    try:
        with transaction() as c:
            return geo.collection(c, p.user_id, farm_id)
    except OperationalError as exc:
        raise ApiError(503, "GEOMETRY_UNAVAILABLE", "Boundary storage is busy or unavailable. Retry shortly.") from exc


@router.post("/farms/{farm_id}/fields/import", status_code=201)
def import_fields(farm_id: UUID, body: Import, p: Principal = Depends(farmer)):
    digest = hashlib.sha256(json.dumps(body.geojson, sort_keys=True, separators=(",", ":")).encode()).hexdigest()
    try:
        with transaction() as c:
            geo.farm(c, p.user_id, farm_id)
            # Global owner/key lock before farm lock avoids races when retrying the same key for another farm.
            c.execute(text("SET LOCAL lock_timeout='5s'"))
            c.execute(text("SELECT pg_advisory_xact_lock(hashtextextended(:key,0))"), {"key": f"geometry-import:{p.user_id}:{body.idempotencyKey}"})
            geo.lock(c, farm_id)
            geo.farm(c, p.user_id, farm_id)
            previous = (
                c.execute(
                    text("SELECT farm_id::text,request_hash,result FROM field_geometry_imports WHERE owner_id=:uid AND idempotency_key=:key"),
                    {"uid": p.user_id, "key": str(body.idempotencyKey)},
                )
                .mappings()
                .first()
            )
            if previous:
                if previous["farm_id"] != str(farm_id) or previous["request_hash"] != digest:
                    raise ApiError(409, "IDEMPOTENCY_CONFLICT", "This retry key belongs to a different import.")
                # Recheck access to every resulting field; deleted/transferred resources cannot leak via replay.
                for item in previous["result"]["fields"]:
                    geo.field(c, p.user_id, item["id"])
                return previous["result"]
            items = []
            for feature in body.geojson["features"]:
                shape = feature["geometry"]
                metric = geo.metrics(c, shape, farm_id)
                fid = c.execute(
                    text("""INSERT INTO fields(farm_id,name,boundary,centroid,area_hectares,boundary_metadata)
                  VALUES(:farm,:name,ST_SetSRID(ST_GeomFromGeoJSON(:shape),4326),ST_SetSRID(ST_GeomFromGeoJSON(:centroid),4326),:area,
                  CAST(:metadata AS jsonb)) RETURNING id::text"""),
                    {
                        "farm": str(farm_id),
                        "name": feature["properties"]["name"],
                        "shape": json.dumps(shape),
                        "centroid": json.dumps(metric["centroid"]),
                        "area": metric["areaHectares"],
                        "metadata": json.dumps({"source": "GEOJSON_IMPORT", "isSurvey": False}),
                    },
                ).scalar_one()
                items.append({**geo.field(c, p.user_id, fid), "currentCropCycle": None})
            result = json.loads(json.dumps({"imported": len(items), "fields": items}, default=str))
            c.execute(
                text("""INSERT INTO field_geometry_imports(owner_id,farm_id,idempotency_key,request_hash,result)
              VALUES(:uid,:farm,:key,:hash,CAST(:result AS jsonb))"""),
                {"uid": p.user_id, "farm": str(farm_id), "key": str(body.idempotencyKey), "hash": digest, "result": json.dumps(result)},
            )
            log.info("geometry_import_completed", farm_id=str(farm_id), count=len(items))
            return result
    except IntegrityError as exc:
        raise ApiError(409, "IMPORT_CONFLICT", "An active field already has this name. Rename the GeoJSON feature and retry with a new key.") from exc
    except OperationalError as exc:
        raise ApiError(503, "GEOMETRY_BUSY", "Boundary storage is busy or unavailable. Retry the same import key.") from exc


@router.patch("/fields/{field_id}/boundary")
def boundary(field_id: UUID, body: Boundary, p: Principal = Depends(farmer)):
    try:
        with transaction() as c:
            previous = geo.field(c, p.user_id, field_id)
            if body.farmId and str(body.farmId) != previous["farmId"]:
                raise ApiError(404, "FIELD_NOT_FOUND", "Field not found.")
            geo.lock(c, previous["farmId"])
            previous = geo.field(c, p.user_id, field_id)
            if previous["version"] != body.expectedVersion:
                raise ApiError(409, "BOUNDARY_VERSION_CONFLICT", "Boundary changed. Reload before saving.")
            metric = geo.metrics(c, body.geometry, previous["farmId"])
            metadata = {"source": body.source, "isSurvey": False, "gpsSamples": [s.model_dump(mode="json") for s in body.gpsSamples]}
            c.execute(
                text("""UPDATE fields SET boundary=ST_SetSRID(ST_GeomFromGeoJSON(:shape),4326),
              centroid=ST_SetSRID(ST_GeomFromGeoJSON(:centroid),4326),area_hectares=:area,
              boundary_metadata=CAST(:metadata AS jsonb),version=version+1,updated_at=now() WHERE id=:id"""),
                {
                    "shape": json.dumps(body.geometry),
                    "centroid": json.dumps(metric["centroid"]),
                    "area": metric["areaHectares"],
                    "metadata": json.dumps(metadata),
                    "id": str(field_id),
                },
            )
            log.info("field_boundary_updated", field_id=str(field_id), version=body.expectedVersion + 1, source=body.source)
            return {**geo.field(c, p.user_id, field_id), "metrics": metric}
    except OperationalError as exc:
        raise ApiError(503, "GEOMETRY_BUSY", "Boundary storage is busy or unavailable. Reload and retry.") from exc

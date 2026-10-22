"""Backward-compatible satellite views with authenticated raster delivery."""

import time
from datetime import UTC, datetime, timedelta
from uuid import UUID

import redis
from fastapi import APIRouter, Depends, Request
from fastapi.responses import FileResponse
from pydantic import BaseModel, ConfigDict, Field, model_validator
from sqlalchemy import text

from app.auth import Principal, require_roles
from app.config import get_settings
from app.db import transaction
from app.errors import ApiError
from app.satellite import repository as repo
from app.satellite.raster import geometry, private_path
from app.satellite.science import VERSION

router = APIRouter(tags=["Satellite monitoring"])
farmer = require_roles("FARMER")


class CreateScan(BaseModel):
    model_config = ConfigDict(extra="forbid", populate_by_name=True)
    start: datetime | None = Field(None, alias="from")
    end: datetime | None = Field(None, alias="to")
    maxCloudCoverage: float = Field(30, ge=0, le=100, allow_inf_nan=False)

    @model_validator(mode="after")
    def dates(self):
        now = datetime.now(UTC)
        self.end = self.end or now
        self.start = self.start or self.end - timedelta(days=30)
        if (
            self.start.tzinfo is None
            or self.end.tzinfo is None
            or self.start >= self.end
            or self.end - self.start > timedelta(days=90)
            or self.end > now + timedelta(minutes=5)
        ):
            raise ValueError("Date range must be timezone-aware, past, ordered and at most 90 days.")
        return self


def not_found():
    return ApiError(404, "SATELLITE_SCAN_NOT_FOUND", "Field or satellite scan was not found.")


def owned(c, p, capture_id):
    result = repo.get(c, p.user_id, str(capture_id))
    if result is None:
        raise not_found()
    return result


@router.post("/fields/{field_id}/satellite-scans", status_code=202)
def create(field_id: UUID, body: CreateScan, p: Principal = Depends(farmer)):
    with transaction() as c:
        field = repo.field(c, p.user_id, str(field_id))
        if field is None:
            raise not_found()
        try:
            geometry(field["boundary"])
        except ValueError as exc:
            raise ApiError(400, "INVALID_FIELD_GEOMETRY", "The field boundary cannot be processed.") from exc
        limiter = redis.Redis.from_url(get_settings().redis_url, socket_timeout=2, socket_connect_timeout=2)
        try:
            key = f"platform:satellite-limit:{p.user_id}:{int(time.time() // 3600)}"
            count = limiter.eval("local n=redis.call('INCR',KEYS[1]); if n==1 then redis.call('EXPIRE',KEYS[1],3700) end; return n", 1, key)
        except redis.RedisError as exc:
            raise ApiError(503, "QUEUE_UNAVAILABLE", "Satellite monitoring is temporarily unavailable.") from exc
        finally:
            limiter.close()
        if count > 10:
            raise ApiError(429, "RATE_LIMITED", "Too many satellite requests; try again later.")
        capture_id = repo.create(c, p.user_id, str(field_id), field["boundary"], body.start, body.end, body.maxCloudCoverage)
        return repo.get(c, p.user_id, capture_id)
    # Durable outbox dispatch occurs after commit; scheduler retries broker failures.


@router.get("/fields/{field_id}/satellite-scans")
def recent(field_id: UUID, p: Principal = Depends(farmer)):
    with transaction() as c:
        if repo.field(c, p.user_id, str(field_id)) is None:
            raise not_found()
        return repo.recent(c, p.user_id, str(field_id))


@router.get("/satellite-scans/{capture_id}")
def get(capture_id: UUID, p: Principal = Depends(farmer)):
    with transaction() as c:
        return owned(c, p, capture_id)


@router.get("/satellite-scans/{capture_id}/statistics")
def statistics(capture_id: UUID, p: Principal = Depends(farmer)):
    with transaction() as c:
        owned(c, p, capture_id)
        return repo.result_rows(c, str(capture_id), "statistics")


@router.get("/satellite-scans/{capture_id}/layers")
def layers(capture_id: UUID, request: Request, p: Principal = Depends(farmer)):
    with transaction() as c:
        capture = owned(c, p, capture_id)
        if capture["provider"] != repo.PROVIDER:
            raise ApiError(409, "LEGACY_CAPTURE", "Use the existing provider's layer delivery.")
        rows = repo.result_rows(c, str(capture_id), "layers")
    for row in rows:
        # Same-origin BFF, not an exposed local path or private backend URL.
        row["access"] = {"url": f"/api/satellite-scans/{capture_id}/layers/{row['type']}/content", "expiresAt": None}
    return rows


@router.get("/satellite-scans/{capture_id}/layers/{layer_type}/content")
def content(capture_id: UUID, layer_type: str, p: Principal = Depends(farmer)):
    with transaction() as c:
        owned(c, p, capture_id)
        row = c.execute(
            text("""SELECT ma.object_key,ma.content_type FROM satellite_layers sl
        JOIN media_assets ma ON ma.id=sl.media_asset_id WHERE sl.capture_id=:cid AND sl.type=:type AND ma.status='ready' AND ma.owner_id=:uid"""),
            {"cid": str(capture_id), "type": layer_type, "uid": p.user_id},
        ).first()
    if row is None:
        raise not_found()
    target = private_path(row.object_key)
    if not target.is_file():
        raise ApiError(503, "MEDIA_UNAVAILABLE", "This satellite layer is temporarily unavailable.")
    return FileResponse(target, media_type=row.content_type, headers={"Cache-Control": "private, no-store", "X-Content-Type-Options": "nosniff"})


@router.get("/fields/{field_id}/satellite-comparison")
def comparison(field_id: UUID, p: Principal = Depends(farmer)):
    with transaction() as c:
        if repo.field(c, p.user_id, str(field_id)) is None:
            raise not_found()
        rows = (
            c.execute(
                text("""SELECT sc.id::text AS "captureId",sc.acquisition_date AS "acquisitionDate",
        sc.raw_metadata->>'geometryHash' AS geometry_hash,
        jsonb_build_object('crs',sc.raw_metadata->'crs','transform',sc.raw_metadata->'transform',
        'width',sc.raw_metadata->'width','height',sc.raw_metadata->'height') AS grid,
        jsonb_object_agg(ss.index,ss.statistics) AS statistics FROM satellite_captures sc
        JOIN satellite_statistics ss ON ss.capture_id=sc.id WHERE sc.field_id=:fid
        AND sc.processing_status='COMPLETED' AND sc.raw_metadata->>'processingVersion'=:version
        GROUP BY sc.id ORDER BY sc.acquisition_date DESC LIMIT 12"""),
                {"fid": str(field_id), "version": VERSION},
            )
            .mappings()
            .all()
        )
    # Boundaries changed between captures are not a comparable trend.
    observations = (
        [dict(row, healthScore=None) for row in rows if row["geometry_hash"] == rows[0]["geometry_hash"] and row["grid"] == rows[0]["grid"]] if rows else []
    )
    return {
        "fieldId": str(field_id),
        "comparisonBasis": "PREVIOUS_VALID_OBSERVATION" if len(observations) >= 2 else "INSUFFICIENT_HISTORY",
        "observations": observations,
    }

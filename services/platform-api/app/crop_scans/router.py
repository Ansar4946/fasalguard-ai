"""/api/v1/crop-scans — same contract as the NestJS CropScanController, plus /capabilities."""

import time
import uuid
from typing import Literal

import redis
from fastapi import APIRouter, Depends, Query, status
from pydantic import BaseModel, ConfigDict

from app.auth import Principal, require_roles
from app.config import get_settings
from app.crop_scans import handoff
from app.crop_scans import repository as repo
from app.crop_scans.vision import registry
from app.db import transaction
from app.errors import ApiError
from app.logging import log

router = APIRouter(prefix="/crop-scans", tags=["Crop image screening"])
farmer = require_roles("FARMER")
_redis: redis.Redis | None = None


def _uuid4(value: str, name: str) -> str:
    try:
        u = uuid.UUID(value)
    except (ValueError, AttributeError, TypeError) as exc:
        raise ApiError(400, "VALIDATION_FAILED", f"{name} must be a UUID v4.") from exc
    if u.version != 4:
        raise ApiError(400, "VALIDATION_FAILED", f"{name} must be a UUID v4.")
    return str(u)


class CreateScan(BaseModel):
    model_config = ConfigDict(extra="forbid")
    fieldId: uuid.UUID | None = None


class AddImage(BaseModel):
    model_config = ConfigDict(extra="forbid")
    mediaId: uuid.UUID
    category: Literal["LEAF_FRONT", "LEAF_BACK", "WHOLE_PLANT", "FIELD_CONTEXT", "PEST_IMAGE"]


def _not_found() -> ApiError:
    return ApiError(404, "CROP_SCAN_NOT_FOUND", "Crop scan was not found.")


def _rate_limit(user_id: str) -> None:
    global _redis
    s = get_settings()
    _redis = _redis or redis.Redis.from_url(s.redis_url, socket_timeout=2)
    key = f"platform:ratelimit:crop-scan-analyse:{user_id}:{int(time.time() // 3600)}"
    try:
        n = _redis.incr(key)
        if n == 1:
            _redis.expire(key, 3700)
    except redis.RedisError:
        log.warning("rate_limit_unavailable", key="crop-scan-analyse")
        return  # fail open on limiter outage; auth + ownership still enforced
    if n > s.analyse_limit_per_hour:
        raise ApiError(429, "RATE_LIMITED", "Too many analyses this hour. Try again later.")


@router.get("/capabilities")
def capabilities(p: Principal = Depends(farmer)) -> dict:
    s = get_settings()
    reg = registry(s)
    return {
        "provider": "roboflow" if s.roboflow_api_key else None,
        "configured": bool(s.roboflow_api_key and reg),
        "supportedCrops": sorted(reg),
        "models": [{"crop": m.crop, "modelId": m.model_id, "version": m.version} for m in reg.values()],
        "policy": {"minimumConfidence": s.vision_minimum_confidence, "expertReviewBelow": s.vision_expert_review_below},
    }


@router.post("", status_code=status.HTTP_201_CREATED)
def create(body: CreateScan, p: Principal = Depends(farmer)) -> dict:
    s = get_settings()
    field_id = str(body.fieldId) if body.fieldId else None
    with transaction() as c:
        if field_id and not repo.owned_field(c, p.user_id, field_id):
            raise ApiError(403, "FIELD_ACCESS_DENIED", "You do not have access to this field.")
        sid = repo.create(c, p.user_id, field_id, {"minimumConfidence": s.vision_minimum_confidence, "expertReviewBelow": s.vision_expert_review_below})
        out = repo.get(c, p.user_id, sid)
    log.info("crop_scan_created", scan_id=sid, field_id=field_id)
    return out


@router.post("/{scan_id}/images", status_code=status.HTTP_201_CREATED)
def add_image(scan_id: str, body: AddImage, p: Principal = Depends(farmer)) -> dict:
    sid = _uuid4(scan_id, "id")
    with transaction() as c:
        scan = repo.lock(c, p.user_id, sid)
        if scan is None:
            raise _not_found()
        if scan["status"] not in repo.ANALYSABLE:
            raise ApiError(400, "SCAN_NOT_EDITABLE", "Images can no longer be added to this scan.")
        if not repo.media_ready(c, p.user_id, str(body.mediaId)):
            raise ApiError(400, "INVALID_SCAN_MEDIA", "Image must be a completed private crop-scan upload owned by the farmer.")
        if repo.image_count(c, sid) >= 5:
            raise ApiError(400, "TOO_MANY_SCAN_IMAGES", "A scan can have at most 5 images.")
        repo.add_image(c, sid, str(body.mediaId), body.category)
        repo.set_status(c, sid, repo.UPLOADING)
        return repo.get(c, p.user_id, sid)


@router.post("/{scan_id}/analyse", status_code=status.HTTP_202_ACCEPTED)
def analyse(scan_id: str, p: Principal = Depends(farmer)) -> dict:
    sid = _uuid4(scan_id, "id")
    with transaction() as c:
        scan = repo.lock(c, p.user_id, sid)
        if scan is None:
            raise _not_found()
        if repo.image_count(c, sid) < 1:
            raise ApiError(400, "SCAN_IMAGE_REQUIRED", "Add at least one completed crop image before analysis.")
        if scan["status"] not in repo.ANALYSABLE:
            raise ApiError(400, "SCAN_NOT_READY", "This scan cannot be analysed in its current state.")
        _rate_limit(p.user_id)
        repo.set_status(c, sid, repo.IMAGE_VALIDATION, clear_failure=True)
    # Committed above; only now dispatch (Phase B blocker B5: never dispatch before commit).
    from app.crop_scans.tasks import analyse as analyse_task

    analyse_task.apply_async(args=[sid, p.user_id], task_id=f"crop-scan-{sid}-{uuid.uuid4().hex[:8]}")
    handoff.emit("ANALYSIS_REQUESTED", sid)
    with transaction() as c:
        return repo.get(c, p.user_id, sid)


@router.get("/{scan_id}")
def get_scan(scan_id: str, p: Principal = Depends(farmer)) -> dict:
    sid = _uuid4(scan_id, "id")
    with transaction() as c:
        out = repo.get(c, p.user_id, sid)
    if out is None:
        raise _not_found()
    return out


@router.get("")
def list_recent(fieldId: str = Query(...), p: Principal = Depends(farmer)) -> list[dict]:
    fid = _uuid4(fieldId, "fieldId")
    with transaction() as c:
        return repo.list_recent_for_field(c, p.user_id, fid)

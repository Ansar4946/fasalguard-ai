import hashlib
import json
from contextlib import contextmanager

from fastapi import APIRouter, Depends, Query, Response
from sqlalchemy import text
from sqlalchemy.exc import OperationalError

from app.auth import Principal, require_roles
from app.config import get_settings
from app.db import transaction
from app.errors import ApiError
from app.logging import log
from app.offline.schemas import Batch, Manifest

router = APIRouter(tags=["Offline crop screening"])


@contextmanager
def storage():
    try:
        with transaction() as c:
            c.execute(text("SET LOCAL statement_timeout='8s'"))
            yield c
    except OperationalError as exc:
        raise ApiError(503, "OFFLINE_STORAGE_UNAVAILABLE", "Sync storage unavailable. Keep local records and retry unchanged IDs.") from exc


def enabled(p: Principal = Depends(require_roles("FARMER"))):
    if not get_settings().offline_sync_enabled:
        raise ApiError(503, "OFFLINE_SYNC_DISABLED", "Offline sync is not enabled. Local captures are retained.")
    return p


def manifests(c):
    rows = c.execute(
        text("""SELECT id::text,model_id,model_version,metadata FROM model_versions
      WHERE provider='ONNX_MOBILE' AND metadata->>'approvalStatus'='APPROVED' ORDER BY created_at DESC LIMIT 100""")
    ).mappings()
    result = []
    for row in rows:
        try:
            result.append(
                Manifest.model_validate(
                    {**row["metadata"]["manifest"], "modelVersionId": row["id"], "modelId": row["model_id"], "version": row["model_version"]}
                ).model_dump(mode="json")
            )
        except (ValueError, KeyError, TypeError):
            log.warning("offline_manifest_invalid", model_version_id=row["id"])
    return result


def private(response):
    response.headers["Cache-Control"] = "private, no-store"


def context_rows(c, uid):
    return (
        c.execute(
            text("""SELECT fi.id::text AS "fieldId",fi.name,f.id::text AS "farmId",cc.id::text AS "cropSeasonId",cc.crop_id::text AS "cropId"
      FROM fields fi JOIN farms f ON f.id=fi.farm_id JOIN farmer_profiles fp ON fp.id=f.farmer_id
      JOIN crop_cycles cc ON cc.field_id=fi.id WHERE fp.user_id=:uid AND fi.deleted_at IS NULL AND f.deleted_at IS NULL
      AND cc.deleted_at IS NULL ORDER BY cc.created_at DESC LIMIT 500"""),
            {"uid": uid},
        )
        .mappings()
        .all()
    )


@router.get("/offline-scans/context")
def context(response: Response, p: Principal = Depends(enabled)):
    private(response)
    with storage() as c:
        return {"ownerId": p.user_id, "fields": [dict(r) for r in context_rows(c, p.user_id)]}


@router.get("/offline-models/manifest")
def models(response: Response, p: Principal = Depends(enabled)):
    private(response)
    with storage() as c:
        available = manifests(c)
        return {"available": bool(available), "models": available, "reason": None if available else "NO_APPROVED_OFFLINE_MODEL"}


def accessible(c, uid, field_id, season):
    row = c.execute(
        text("""SELECT cc.crop_id::text FROM crop_cycles cc JOIN fields fi ON fi.id=cc.field_id JOIN farms f ON f.id=fi.farm_id
      JOIN farmer_profiles fp ON fp.id=f.farmer_id WHERE fp.user_id=:uid AND fi.id=:field AND cc.id=:season
      AND cc.deleted_at IS NULL AND fi.deleted_at IS NULL AND f.deleted_at IS NULL FOR SHARE OF cc,fi,f,fp"""),
        {"uid": uid, "field": str(field_id), "season": str(season)},
    ).first()
    if not row:
        raise ApiError(404, "OFFLINE_CONTEXT_NOT_FOUND", "Field and crop season are unavailable to this account.")
    return row[0]


@router.post("/offline-scans/sync")
def sync(body: Batch, response: Response, p: Principal = Depends(enabled)):
    private(response)
    try:
        with transaction() as c:
            c.execute(text("SET LOCAL lock_timeout='5s'"))
            c.execute(text("SET LOCAL statement_timeout='8s'"))
            c.execute(text("SELECT pg_advisory_xact_lock(hashtextextended(:key,0))"), {"key": f"offline-owner:{p.user_id}"})
            approved = {m["modelVersionId"]: m for m in manifests(c)}
            results = []
            for item in body.captures:
                crop = accessible(c, p.user_id, item.fieldId, item.cropSeasonId)
                payload = item.model_dump(mode="json")
                digest = hashlib.sha256(json.dumps(payload, sort_keys=True, separators=(",", ":")).encode()).hexdigest()
                old = (
                    c.execute(
                        text("SELECT id::text,scan_id::text,request_hash FROM offline_crop_observations WHERE owner_id=:uid AND client_id=:cid"),
                        {"uid": p.user_id, "cid": str(item.clientId)},
                    )
                    .mappings()
                    .first()
                )
                if old:
                    if old["request_hash"] != digest:
                        raise ApiError(409, "OFFLINE_ID_REUSED", "This capture ID already belongs to different content. Keep both records for review.")
                    results.append({"clientId": str(item.clientId), "id": old["id"], "scanId": old["scan_id"], "status": "SYNCED"})
                    continue
                if item.prediction:
                    m = approved.get(str(item.prediction.modelVersionId))
                    if not m or m["sha256"] != item.prediction.modelSha256 or m["cropId"] != crop or item.prediction.label not in m["classes"]:
                        raise ApiError(409, "OFFLINE_MODEL_NOT_APPROVED", "Capture model is unavailable or incompatible. Keep the local record for review.")
                count = c.execute(
                    text("SELECT count(*) FROM offline_crop_observations WHERE owner_id=:uid AND created_at>now()-interval '1 hour'"), {"uid": p.user_id}
                ).scalar_one()
                if count >= 100:
                    raise ApiError(429, "OFFLINE_SYNC_LIMIT", "Hourly capture sync limit reached. Local captures are retained.")
                sid = c.execute(
                    text("""INSERT INTO crop_scans(owner_id,field_id,status,confidence_policy)
                  VALUES(:uid,:field,'CREATED',CAST(:policy AS jsonb)) RETURNING id::text"""),
                    {"uid": p.user_id, "field": str(item.fieldId), "policy": json.dumps({"source": "OFFLINE_CAPTURE", "clientInferenceVerified": False})},
                ).scalar_one()
                oid = c.execute(
                    text("""INSERT INTO offline_crop_observations(owner_id,client_id,scan_id,crop_cycle_id,request_hash,payload)
                  VALUES(:uid,:cid,:sid,:season,:hash,CAST(:payload AS jsonb)) RETURNING id::text"""),
                    {"uid": p.user_id, "cid": str(item.clientId), "sid": sid, "season": str(item.cropSeasonId), "hash": digest, "payload": json.dumps(payload)},
                ).scalar_one()
                change = {"id": oid, "scanId": sid, "clientId": str(item.clientId), "capture": payload, "clientInferenceVerified": False}
                c.execute(
                    text("""INSERT INTO sync_changes(user_id,resource_type,resource_id,operation,data)
                  VALUES(:uid,'OFFLINE_CROP_SCAN',:id,'UPSERT',CAST(:data AS jsonb))"""),
                    {"uid": p.user_id, "id": oid, "data": json.dumps(change)},
                )
                results.append({"clientId": str(item.clientId), "id": oid, "scanId": sid, "status": "SYNCED"})
            log.info("offline_sync_completed", count=len(results))
            return {"results": results, "clientInferenceVerified": False}
    except OperationalError as exc:
        raise ApiError(503, "OFFLINE_STORAGE_UNAVAILABLE", "Sync storage unavailable. Keep local records and retry unchanged IDs.") from exc


@router.get("/offline-scans/changes")
def changes(response: Response, cursor: int = Query(default=0, ge=0, le=9223372036854775807), p: Principal = Depends(enabled)):
    private(response)
    with storage() as c:
        c.execute(text("SET LOCAL statement_timeout='8s'"))
        rows = (
            c.execute(
                text("""SELECT sc.sequence,sc.data FROM sync_changes sc JOIN offline_crop_observations o ON o.id=sc.resource_id
          JOIN crop_scans cs ON cs.id=o.scan_id JOIN fields fi ON fi.id=cs.field_id JOIN farms f ON f.id=fi.farm_id
          JOIN farmer_profiles fp ON fp.id=f.farmer_id JOIN crop_cycles cc ON cc.id=o.crop_cycle_id
          WHERE sc.user_id=:uid AND fp.user_id=:uid AND o.owner_id=:uid AND sc.resource_type='OFFLINE_CROP_SCAN' AND sc.sequence>:cursor
          AND fi.deleted_at IS NULL AND f.deleted_at IS NULL AND cc.deleted_at IS NULL ORDER BY sc.sequence LIMIT 100"""),
                {"uid": p.user_id, "cursor": cursor},
            )
            .mappings()
            .all()
        )
        return {"changes": [r["data"] for r in rows], "cursor": str(rows[-1]["sequence"]) if rows else str(cursor), "hasMore": len(rows) == 100}

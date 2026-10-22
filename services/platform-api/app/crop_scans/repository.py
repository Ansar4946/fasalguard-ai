"""SQL for the crop-scan domain. Tables are owned by the NestJS TypeORM migrations; the queries are
ported from services/api/src/domain/crop-scans/crop-scan.service.ts and crop-scan.processor.ts so
both services read and write identical rows during the migration."""

import json

from sqlalchemy import text
from sqlalchemy.engine import Connection

# Statuses (services/api/src/domain/crop-scans/crop-scan.enums.ts)
CREATED, UPLOADING, IMAGE_VALIDATION, ANALYSING = "CREATED", "UPLOADING", "IMAGE_VALIDATION", "ANALYSING"
NEEDS_FOLLOW_UP, DIAGNOSED, EXPERT_REVIEW = "NEEDS_FOLLOW_UP", "DIAGNOSED", "EXPERT_REVIEW"
VERIFIED, RESOLVED = "VERIFIED", "RESOLVED"
ANALYSABLE = (CREATED, UPLOADING, NEEDS_FOLLOW_UP)
CATEGORIES = ("LEAF_FRONT", "LEAF_BACK", "WHOLE_PLANT", "FIELD_CONTEXT", "PEST_IMAGE")
PROVIDER_NAME = "RoboflowVisionProvider"  # same value the NestJS processor stores, for continuity

_GET = text(
    """SELECT cs.id::text,cs.field_id::text AS "fieldId",cs.status,cs.confidence_policy AS "confidencePolicy",
       cs.failure_code AS "failureCode",cs.created_at AS "createdAt",
       COALESCE(jsonb_agg(DISTINCT jsonb_build_object('id',si.id,'mediaId',si.media_asset_id,'category',si.category,
         'widthPixels',si.width_pixels,'heightPixels',si.height_pixels)) FILTER(WHERE si.id IS NOT NULL),'[]') AS images,
       d.screened_condition AS "screenedCondition",d.confidence,d.disposition,d.is_firm_diagnosis AS "isFirmDiagnosis",d.disclaimer,
       COALESCE((SELECT jsonb_agg(jsonb_build_object('condition',da.condition,'confidence',da.confidence) ORDER BY da.rank)
                 FROM diagnosis_alternatives da WHERE da.diagnosis_id=d.id),'[]') AS alternatives
     FROM crop_scans cs LEFT JOIN scan_images si ON si.scan_id=cs.id LEFT JOIN diagnoses d ON d.scan_id=cs.id
     WHERE cs.id=:id AND cs.owner_id=:owner GROUP BY cs.id,d.id"""
)


def owned_field(c: Connection, owner: str, field_id: str) -> bool:
    return (
        c.execute(
            text(
                "SELECT 1 FROM fields fi JOIN farms f ON f.id=fi.farm_id JOIN farmer_profiles fp ON fp.id=f.farmer_id "
                "WHERE fi.id=:f AND fp.user_id=:u AND fi.deleted_at IS NULL"
            ),
            {"f": field_id, "u": owner},
        ).first()
        is not None
    )


def create(c: Connection, owner: str, field_id: str | None, policy: dict) -> str:
    return c.execute(
        text("INSERT INTO crop_scans(owner_id,field_id,status,confidence_policy) VALUES(:o,:f,:s,CAST(:p AS jsonb)) RETURNING id::text"),
        {"o": owner, "f": field_id, "s": CREATED, "p": json.dumps(policy)},
    ).scalar_one()


def get(c: Connection, owner: str, scan_id: str) -> dict | None:
    row = c.execute(_GET, {"id": scan_id, "owner": owner}).mappings().first()
    if row is None:
        return None
    out = dict(row)
    out["createdAt"] = out["createdAt"].isoformat() if out["createdAt"] else None
    return out


def lock(c: Connection, owner: str, scan_id: str) -> dict | None:
    row = (
        c.execute(
            text("SELECT id::text,status,field_id::text FROM crop_scans WHERE id=:id AND owner_id=:o FOR UPDATE"),
            {"id": scan_id, "o": owner},
        )
        .mappings()
        .first()
    )
    return dict(row) if row else None


def media_ready(c: Connection, owner: str, media_id: str) -> bool:
    return (
        c.execute(
            text("SELECT 1 FROM media_assets WHERE id=:m AND owner_id=:o AND purpose='crop-scan' AND status='ready'"),
            {"m": media_id, "o": owner},
        ).first()
        is not None
    )


def add_image(c: Connection, scan_id: str, media_id: str, category: str) -> None:
    c.execute(
        text(
            "INSERT INTO scan_images(scan_id,media_asset_id,category) VALUES(:s,:m,:c) "
            "ON CONFLICT(scan_id,media_asset_id) DO UPDATE SET category=excluded.category,updated_at=now()"
        ),
        {"s": scan_id, "m": media_id, "c": category},
    )


def image_count(c: Connection, scan_id: str) -> int:
    return int(c.execute(text("SELECT count(*) FROM scan_images WHERE scan_id=:s"), {"s": scan_id}).scalar_one())


def set_status(c: Connection, scan_id: str, status: str, failure_code: str | None = None, clear_failure: bool = False) -> None:
    if failure_code is not None or clear_failure:
        c.execute(
            text("UPDATE crop_scans SET status=:st,failure_code=:fc,updated_at=now(),version=version+1 WHERE id=:id"),
            {"id": scan_id, "st": status, "fc": failure_code},
        )
    else:
        c.execute(text("UPDATE crop_scans SET status=:st,updated_at=now(),version=version+1 WHERE id=:id"), {"id": scan_id, "st": status})


def list_recent_for_field(c: Connection, owner: str, field_id: str) -> list[dict]:
    rows = c.execute(
        text(
            """SELECT cs.id::text,cs.created_at AS "createdAt",d.screened_condition AS "screenedCondition"
               FROM crop_scans cs LEFT JOIN diagnoses d ON d.scan_id=cs.id
               WHERE cs.owner_id=:o AND cs.field_id=:f AND cs.status IN ('DIAGNOSED','EXPERT_REVIEW','VERIFIED','RESOLVED')
               ORDER BY cs.created_at DESC LIMIT 10"""
        ),
        {"o": owner, "f": field_id},
    ).mappings()
    return [{**dict(r), "createdAt": r["createdAt"].isoformat()} for r in rows]


def scan_images_for_analysis(c: Connection, owner: str, scan_id: str) -> list[dict]:
    rows = c.execute(
        text(
            """SELECT si.id::text,ma.object_key AS "objectKey",ma.content_type AS "contentType",ma.size_bytes AS "sizeBytes",
                      si.category,c.name AS "cropName",cc.id::text AS "cropCycleId",f.id::text AS "farmId"
               FROM scan_images si JOIN media_assets ma ON ma.id=si.media_asset_id JOIN crop_scans cs ON cs.id=si.scan_id
               LEFT JOIN fields fi ON fi.id=cs.field_id LEFT JOIN farms f ON f.id=fi.farm_id
               LEFT JOIN LATERAL(SELECT * FROM crop_cycles x WHERE x.field_id=fi.id AND x.status='active' AND x.deleted_at IS NULL
                                 ORDER BY x.created_at DESC LIMIT 1) cc ON true
               LEFT JOIN crops c ON c.id=cc.crop_id
               WHERE si.scan_id=:s AND cs.owner_id=:o AND ma.status='ready'"""
        ),
        {"s": scan_id, "o": owner},
    ).mappings()
    return [dict(r) for r in rows]


def update_dimensions(c: Connection, image_id: str, w: int, h: int) -> None:
    c.execute(text("UPDATE scan_images SET width_pixels=:w,height_pixels=:h,updated_at=now() WHERE id=:id"), {"id": image_id, "w": w, "h": h})


def save_quality(c: Connection, image_id: str, acceptable: bool, issues: list, metadata: dict) -> None:
    c.execute(
        text(
            "INSERT INTO image_quality_results(scan_image_id,acceptable,issues,provider_metadata) "
            "VALUES(:i,:a,CAST(:iss AS jsonb),CAST(:m AS jsonb)) ON CONFLICT(scan_image_id) DO UPDATE SET "
            "acceptable=excluded.acceptable,issues=excluded.issues,provider_metadata=excluded.provider_metadata,updated_at=now()"
        ),
        {"i": image_id, "a": acceptable, "iss": json.dumps(issues), "m": json.dumps(metadata)},
    )


def policy_of(c: Connection, scan_id: str) -> dict:
    return c.execute(text("SELECT confidence_policy FROM crop_scans WHERE id=:s"), {"s": scan_id}).scalar_one()


def save_result(c: Connection, scan_id: str, pred, disposition: str, disclaimer: str) -> None:
    mv = c.execute(
        text(
            "INSERT INTO model_versions(provider,model_id,model_version) VALUES(:p,:m,:v) "
            "ON CONFLICT(provider,model_id,model_version) DO UPDATE SET updated_at=now() RETURNING id"
        ),
        {"p": PROVIDER_NAME, "m": pred.model_id, "v": pred.model_version},
    ).scalar_one()
    c.execute(
        text(
            "INSERT INTO model_predictions(scan_id,model_version_id,predicted_condition,confidence,inference_timestamp,raw_provider_response) "
            "VALUES(:s,:mv,:pc,:cf,:ts,CAST(:raw AS jsonb))"
        ),
        {"s": scan_id, "mv": mv, "pc": pred.predicted_condition, "cf": pred.confidence, "ts": pred.inference_timestamp, "raw": json.dumps(pred.raw)},
    )
    did = c.execute(
        text(
            "INSERT INTO diagnoses(scan_id,screened_condition,confidence,disposition,is_firm_diagnosis,disclaimer) "
            "VALUES(:s,:c,:cf,:d,false,:dis) ON CONFLICT(scan_id) DO UPDATE SET screened_condition=excluded.screened_condition,"
            "confidence=excluded.confidence,disposition=excluded.disposition,is_firm_diagnosis=false,disclaimer=excluded.disclaimer,"
            "updated_at=now() RETURNING id"
        ),
        {"s": scan_id, "c": pred.predicted_condition, "cf": pred.confidence, "d": disposition, "dis": disclaimer},
    ).scalar_one()
    c.execute(text("DELETE FROM diagnosis_alternatives WHERE diagnosis_id=:d"), {"d": did})
    for i, alt in enumerate(pred.alternatives, start=1):
        c.execute(
            text("INSERT INTO diagnosis_alternatives(diagnosis_id,rank,condition,confidence) VALUES(:d,:r,:c,:cf)"),
            {"d": did, "r": i, "c": alt["condition"], "cf": alt["confidence"]},
        )


def record_ai_run(c: Connection, **kw) -> None:
    """Same columns as services/api AIRunLogger.record (best-effort, never raises to caller)."""
    try:
        with c.begin_nested():
            c.execute(
                text(
                    """INSERT INTO ai_runs(id,user_id,farm_id,crop_season_id,incident_id,operation,provider,model,status,started_at,
                       completed_at,latency_ms,input_type,evidence_ids,tool_calls,tool_call_count,incident_created,confidence,
                       output_schema_version,input_tokens,output_tokens,estimated_cost,cost_currency,error_code,human_review_status,
                       source_table,source_id)
                       VALUES(gen_random_uuid(),:user_id,:farm_id,:crop_season_id,NULL,'CROP_ANALYSIS',:provider,:model,:status,:started_at,
                       :completed_at,:latency_ms,'crop_scan_images','[]','[]',0,false,:confidence,NULL,NULL,NULL,NULL,NULL,:error_code,
                       :human_review_status,'crop_scans',:source_id)"""
                ),
                {
                    "user_id": kw.get("user_id"),
                    "farm_id": kw.get("farm_id"),
                    "crop_season_id": kw.get("crop_season_id"),
                    "provider": PROVIDER_NAME,
                    "model": kw.get("model", "unknown"),
                    "status": kw["status"],
                    "started_at": kw["started_at"],
                    "completed_at": kw.get("completed_at"),
                    "latency_ms": kw.get("latency_ms"),
                    "confidence": kw.get("confidence"),
                    "error_code": kw.get("error_code"),
                    "human_review_status": kw.get("human_review_status", "NOT_REQUIRED"),
                    "source_id": kw["source_id"],
                },
            )
    except Exception:  # noqa: BLE001 - telemetry must never break the scan (legacy contract)
        pass

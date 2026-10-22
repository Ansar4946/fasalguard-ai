"""F03 persistence in the existing identity/schema, no duplicate seasons."""

import hashlib
import json

from sqlalchemy import text

from app.errors import ApiError

OWNERSHIP = """JOIN fields fi ON fi.id=r.field_id JOIN farms f ON f.id=fi.farm_id
JOIN farmer_profiles fp ON fp.id=f.farmer_id JOIN crop_cycles cc ON cc.id=r.crop_cycle_id
JOIN users account ON account.id=fp.user_id
WHERE r.id=:id AND r.owner_id=:uid AND fp.user_id=:uid
AND fi.deleted_at IS NULL AND f.deleted_at IS NULL AND cc.deleted_at IS NULL AND cc.field_id=fi.id
AND account.status='active' AND account.deleted_at IS NULL"""


def context(c, uid, fid, cycle=None):
    rows = (
        c.execute(
            text("""SELECT fi.id::text,fi.area_hectares AS area,ST_Y(fi.centroid) AS latitude,
    ST_X(fi.centroid) AS longitude,ST_AsGeoJSON(fi.boundary)::json AS boundary,
    cc.id::text AS "cropCycleId",cc.sowing_date AS "sowingDate",cc.expected_harvest_date AS "endDate",cr.slug AS crop,
    cc.status AS "seasonStatus"
    FROM fields fi JOIN farms f ON f.id=fi.farm_id JOIN farmer_profiles fp ON fp.id=f.farmer_id
    LEFT JOIN crop_cycles cc ON cc.field_id=fi.id AND cc.deleted_at IS NULL
    LEFT JOIN crops cr ON cr.id=cc.crop_id
    WHERE fi.id=:fid AND fp.user_id=:uid AND fi.deleted_at IS NULL AND f.deleted_at IS NULL
    ORDER BY cc.sowing_date DESC NULLS LAST"""),
            {"fid": str(fid), "uid": uid},
        )
        .mappings()
        .all()
    )
    if not rows or (cycle is not None and not any(row["cropCycleId"] == str(cycle) for row in rows)):
        raise ApiError(404, "FIELD_OR_SEASON_NOT_FOUND", "Field or crop season was not found.")
    return dict(next(row for row in rows if cycle is None or row["cropCycleId"] == str(cycle)))


def owned_run(c, uid, run_id):
    row = c.execute(text(f"SELECT r.* FROM irrigation_runs r {OWNERSHIP}"), {"id": str(run_id), "uid": uid}).mappings().first()
    if not row:
        raise ApiError(404, "RUN_NOT_FOUND", "Calculation was not found.")
    return dict(row)


def digest(value):
    return hashlib.sha256(json.dumps(value, sort_keys=True, default=str, allow_nan=False).encode()).hexdigest()


def latest_profile(c, uid, fid, cycle):
    context(c, uid, fid, cycle)
    row = (
        c.execute(
            text("""SELECT id::text,version,inputs,created_at AS "createdAt" FROM field_water_profiles
    WHERE field_id=:fid AND crop_cycle_id=:cycle AND owner_id=:uid ORDER BY version DESC LIMIT 1"""),
            {"fid": str(fid), "cycle": str(cycle), "uid": uid},
        )
        .mappings()
        .first()
    )
    return dict(row) if row else None


def lock(c, key):
    c.execute(text("SELECT pg_advisory_xact_lock(hashtextextended(:key,0))"), {"key": key})


def events(c, uid, fid, cycle):
    context(c, uid, fid, cycle)
    return [
        dict(row)
        for row in c.execute(
            text("""SELECT id::text,inputs,created_at AS "createdAt" FROM irrigation_events
    WHERE field_id=:fid AND crop_cycle_id=:cycle AND owner_id=:uid ORDER BY event_date"""),
            {"fid": str(fid), "cycle": str(cycle), "uid": uid},
        ).mappings()
    ]


def run_view(row):
    return {
        "id": str(row["id"]),
        "fieldId": str(row["field_id"]),
        "cropCycleId": str(row["crop_cycle_id"]),
        "kind": row["kind"],
        "status": row["status"],
        "result": row["result"],
        "failureCode": row["failure_code"],
        "createdAt": row["created_at"],
        "updatedAt": row["updated_at"],
    }


def finish(c, run_id, status, result=None, code=None):
    c.execute(
        text("UPDATE irrigation_runs SET status=:status,result=CAST(:result AS jsonb),failure_code=:code,updated_at=now() WHERE id=:id"),
        {"status": status, "result": json.dumps(result, allow_nan=False), "code": code, "id": run_id},
    )
    if status in {"COMPLETED", "FAILED", "BLOCKED_EXTERNAL"}:
        c.execute(text("UPDATE irrigation_task_outbox SET completed_at=now() WHERE run_id=:id"), {"id": run_id})

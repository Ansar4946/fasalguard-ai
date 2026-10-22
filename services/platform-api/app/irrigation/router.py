"""F03 owner-scoped input ledger and durable calculation requests."""

import json
from datetime import date, datetime, timedelta
from uuid import UUID
from zoneinfo import ZoneInfo

from fastapi import APIRouter, Depends
from fastapi.responses import FileResponse
from sqlalchemy import text

from app.auth import Principal, require_roles
from app.config import get_settings
from app.db import transaction
from app.errors import ApiError
from app.irrigation import repository as repo
from app.irrigation.schemas import Event, Productivity, Profile, Run
from app.irrigation.science import VERSION

router = APIRouter(tags=["Irrigation and water productivity"])
farmer = require_roles("FARMER")


def today():
    return datetime.now(ZoneInfo("Asia/Karachi")).date()


def supported(context):
    if not context["cropCycleId"] or not context["sowingDate"]:
        raise ApiError(409, "SEASON_INPUTS_REQUIRED", "A crop season and sowing date are required.")
    if "rice" in (context["crop"] or "").lower():
        raise ApiError(409, "UNSUPPORTED_CROP_SYSTEM", "Flooded rice requires a separate water-balance model.")


@router.get("/fields/{field_id}/irrigation/context")
def context(field_id: UUID, p: Principal = Depends(farmer)):
    with transaction() as c:
        result = repo.context(c, p.user_id, field_id)
        return {**result, "waterProductivityEnabled": get_settings().wapor_enabled}


@router.get("/fields/{field_id}/irrigation/profile")
def profile(field_id: UUID, cropCycleId: UUID, p: Principal = Depends(farmer)):
    with transaction() as c:
        return repo.latest_profile(c, p.user_id, field_id, cropCycleId)


@router.put("/fields/{field_id}/irrigation/profile")
def save_profile(field_id: UUID, body: Profile, p: Principal = Depends(farmer)):
    with transaction() as c:
        ctx = repo.context(c, p.user_id, field_id, body.cropCycleId)
        supported(ctx)
        if body.initialDate != ctx["sowingDate"] or body.initialDate > today():
            raise ApiError(400, "INVALID_INITIAL_DATE", "Initial soil condition must be dated at sowing; supply a complete balance from sowing.")
        repo.lock(c, f"water-profile:{body.cropCycleId}")
        previous = repo.latest_profile(c, p.user_id, field_id, body.cropCycleId)
        version = previous["version"] if previous else 0
        if body.expectedVersion != version:
            raise ApiError(409, "PROFILE_VERSION_CONFLICT", "The profile changed. Reload before saving.")
        next_version = c.execute(
            text("SELECT COALESCE(max(version),0)+1 FROM field_water_profiles WHERE crop_cycle_id=:cycle"), {"cycle": str(body.cropCycleId)}
        ).scalar_one()
        c.execute(
            text("""INSERT INTO field_water_profiles(field_id,crop_cycle_id,owner_id,version,inputs)
        VALUES(:fid,:cycle,:uid,:version,CAST(:inputs AS jsonb))"""),
            {
                "fid": str(field_id),
                "cycle": str(body.cropCycleId),
                "uid": p.user_id,
                "version": next_version,
                "inputs": body.model_dump_json(exclude={"expectedVersion"}),
            },
        )
        return repo.latest_profile(c, p.user_id, field_id, body.cropCycleId)


@router.get("/fields/{field_id}/irrigation/events")
def events(field_id: UUID, cropCycleId: UUID, p: Principal = Depends(farmer)):
    with transaction() as c:
        return repo.events(c, p.user_id, field_id, cropCycleId)


@router.post("/fields/{field_id}/irrigation/events", status_code=201)
def event(field_id: UUID, body: Event, p: Principal = Depends(farmer)):
    data = body.model_dump(mode="json")
    with transaction() as c:
        ctx = repo.context(c, p.user_id, field_id, body.cropCycleId)
        supported(ctx)
        if not ctx["sowingDate"] <= body.date <= today() or (ctx["endDate"] and body.date > ctx["endDate"]):
            raise ApiError(400, "INVALID_EVENT_DATE", "Record actual irrigation within the crop season, not a future application.")
        repo.lock(c, f"water-events:{body.cropCycleId}")
        repo.lock(c, f"water-event-key:{p.user_id}:{body.idempotencyKey}")
        previous = (
            c.execute(
                text("SELECT id::text,inputs,field_id::text FROM irrigation_events WHERE owner_id=:uid AND idempotency_key=:key"),
                {"uid": p.user_id, "key": str(body.idempotencyKey)},
            )
            .mappings()
            .first()
        )
        if previous:
            if previous["inputs"] != data or previous["field_id"] != str(field_id):
                raise ApiError(409, "IDEMPOTENCY_CONFLICT", "This retry key was used for another event.")
            return {"id": previous["id"], "inputs": previous["inputs"]}
        if c.execute(
            text("SELECT 1 FROM irrigation_events WHERE crop_cycle_id=:cycle AND event_date=:day"), {"cycle": str(body.cropCycleId), "day": body.date}
        ).first():
            raise ApiError(409, "DAILY_EVENT_EXISTS", "One confirmed daily irrigation total is supported; an event already exists for this date.")
        row = c.execute(
            text("""INSERT INTO irrigation_events(field_id,crop_cycle_id,owner_id,event_date,inputs,idempotency_key)
        VALUES(:fid,:cycle,:uid,:day,CAST(:inputs AS jsonb),:key) RETURNING id::text"""),
            {
                "fid": str(field_id),
                "cycle": str(body.cropCycleId),
                "uid": p.user_id,
                "day": body.date,
                "inputs": json.dumps(data),
                "key": str(body.idempotencyKey),
            },
        ).scalar_one()
        return {"id": row, "inputs": data}


def create_run(c, p, field_id, body, kind):
    ctx = repo.context(c, p.user_id, field_id, body.cropCycleId)
    supported(ctx)
    request = {"body": body.model_dump(mode="json"), "field": str(field_id), "kind": kind}
    hash_value = repo.digest(request)
    repo.lock(c, f"water-run-user:{p.user_id}")
    existing = (
        c.execute(text("SELECT * FROM irrigation_runs WHERE owner_id=:uid AND idempotency_key=:key"), {"uid": p.user_id, "key": str(body.idempotencyKey)})
        .mappings()
        .first()
    )
    if existing:
        if existing["request_hash"] != hash_value:
            raise ApiError(409, "IDEMPOTENCY_CONFLICT", "This retry key was used for another calculation.")
        return repo.run_view(existing)
    count = c.execute(text("SELECT count(*) FROM irrigation_runs WHERE owner_id=:uid AND created_at>now()-interval '1 hour'"), {"uid": p.user_id}).scalar_one()
    if count >= get_settings().irrigation_run_limit:
        raise ApiError(429, "RATE_LIMITED", "Too many calculation requests. Try again later.")
    if kind == "IRRIGATION":
        if c.execute(text("SELECT 1 FROM irrigation_events WHERE crop_cycle_id=:cycle AND owner_id<>:uid LIMIT 1"),
                     {"cycle": str(body.cropCycleId), "uid": p.user_id}).first():
            raise ApiError(
                409,
                "SEASON_HISTORY_UNAVAILABLE",
                "This season contains another account's private irrigation history; an authorized history transfer is required.",
            )
        current = repo.latest_profile(c, p.user_id, field_id, body.cropCycleId)
        if not current:
            raise ApiError(409, "PROFILE_REQUIRED", "Record the crop and soil profile first.")
        start = date.fromisoformat(current["inputs"]["initialDate"])
        max_days = min(get_settings().irrigation_max_days, sum(current["inputs"]["parameters"][v] for v in ("Lini", "Ldev", "Lmid", "Lend")))
        if not start <= body.endDate <= today() or (body.endDate - start).days + 1 > max_days:
            raise ApiError(400, "INVALID_RUN_PERIOD", "Choose a past period from sowing within the configured crop stages.")
        if ctx["endDate"] and body.endDate > ctx["endDate"]:
            raise ApiError(400, "OUTSIDE_CROP_SEASON", "The calculation cannot extend beyond this crop season.")
        if body.manualWeather and [item.date for item in body.manualWeather] != [start + timedelta(days=i) for i in range((body.endDate - start).days + 1)]:
            raise ApiError(400, "INCOMPLETE_DAILY_WEATHER", "Provide one ordered weather row for every date from sowing to the end date.")
        inputs = {
            "request": request,
            "profile": current["inputs"],
            "profileVersion": current["version"],
            "events": [row["inputs"] for row in repo.events(c, p.user_id, field_id, body.cropCycleId)],
            "areaHa": float(ctx["area"]),
            "context": ctx,
            "processingVersion": VERSION,
        }
    else:
        if body.startDate < ctx["sowingDate"] or body.endDate > today() or (ctx["endDate"] and body.endDate > ctx["endDate"]):
            raise ApiError(400, "INVALID_RUN_PERIOD", "Satellite period must be past and within the selected season.")
        inputs = {"request": request, "context": ctx, "processingVersion": "f03-pywapor-3.7.3-v1"}
    row = (
        c.execute(
            text("""INSERT INTO irrigation_runs(field_id,crop_cycle_id,owner_id,kind,idempotency_key,request_hash,inputs)
    VALUES(:fid,:cycle,:uid,:kind,:key,:hash,CAST(:inputs AS jsonb)) RETURNING *"""),
            {
                "fid": str(field_id),
                "cycle": str(body.cropCycleId),
                "uid": p.user_id,
                "kind": kind,
                "key": str(body.idempotencyKey),
                "hash": hash_value,
                "inputs": json.dumps(inputs, default=str, allow_nan=False),
            },
        )
        .mappings()
        .one()
    )
    c.execute(text("INSERT INTO irrigation_task_outbox(run_id) VALUES(:id)"), {"id": row["id"]})
    return repo.run_view(row)


@router.post("/fields/{field_id}/irrigation-runs", status_code=202)
def submit(field_id: UUID, body: Run, p: Principal = Depends(farmer)):
    with transaction() as c:
        return create_run(c, p, field_id, body, "IRRIGATION")


@router.post("/fields/{field_id}/water-productivity-runs", status_code=202)
def productivity(field_id: UUID, body: Productivity, p: Principal = Depends(farmer)):
    with transaction() as c:
        return create_run(c, p, field_id, body, "WATER_PRODUCTIVITY")


@router.get("/fields/{field_id}/irrigation-runs")
def history(field_id: UUID, p: Principal = Depends(farmer)):
    with transaction() as c:
        repo.context(c, p.user_id, field_id)
        rows = c.execute(
            text("SELECT id FROM irrigation_runs WHERE field_id=:fid AND owner_id=:uid ORDER BY created_at DESC LIMIT 50"),
            {"fid": str(field_id), "uid": p.user_id},
        ).scalars()
        return [repo.run_view(repo.owned_run(c, p.user_id, row)) for row in rows]


@router.get("/irrigation-runs/{run_id}")
@router.get("/water-productivity-runs/{run_id}")
def run(run_id: UUID, p: Principal = Depends(farmer)):
    with transaction() as c:
        return repo.run_view(repo.owned_run(c, p.user_id, run_id))


@router.get("/water-productivity-runs/{run_id}/artifact")
def artifact(run_id: UUID, p: Principal = Depends(farmer)):
    from app.irrigation.wapor import private_artifact

    with transaction() as c:
        row = repo.owned_run(c, p.user_id, run_id)
        if row["kind"] != "WATER_PRODUCTIVITY" or row["status"] != "COMPLETED":
            raise ApiError(409, "ARTIFACT_NOT_READY", "A completed satellite calculation is required.")
    path = private_artifact(run_id)
    if not path.is_file():
        raise ApiError(503, "ARTIFACT_UNAVAILABLE", "The private artifact is unavailable.")
    return FileResponse(path, media_type="application/x-netcdf", headers={"Cache-Control": "private, no-store", "X-Content-Type-Options": "nosniff"})

"""Owner-scoped F04 endpoints compatible with the existing web weather contracts."""

from datetime import UTC, datetime
from uuid import UUID

from fastapi import APIRouter, Depends
from sqlalchemy import text

from app.auth import Principal, require_roles
from app.db import transaction
from app.weather import rules, service

router = APIRouter(tags=["Field weather"])
farmer = require_roles("FARMER")


@router.get("/fields/{field_id}/weather/forecast")
def forecast(field_id: UUID, p: Principal = Depends(farmer)):
    return service.load(p.user_id, field_id)[1]


@router.get("/fields/{field_id}/weather/current")
def current(field_id: UUID, p: Principal = Depends(farmer)):
    b = service.load(p.user_id, field_id)[1]
    return {**{k: v for k, v in b.items() if k not in ("current", "hourly", "daily")}, "observedAt": b["current"]["time"], "weather": b["current"]}


@router.get("/fields/{field_id}/weather/risks")
@router.get("/fields/{field_id}/weather/suitability")
def risks(field_id: UUID, p: Principal = Depends(farmer)):
    with transaction() as c:
        ctx = service.context(c, p.user_id, field_id)
        b = service.bundle(c, ctx)
        records = (
            c.execute(
                text("""SELECT id::text,category,suitability,priority,conditions,message,source,source_url AS "sourceUrl",
          validation_status AS "validationStatus",version FROM crop_weather_rules WHERE crop_id=:crop AND active=true
          AND validation_status IN ('DEMO_UNVERIFIED','EXPERT_APPROVED')"""),
                {"crop": ctx["cropId"]},
            )
            .mappings()
            .all()
            if ctx["cropId"]
            else []
        )
        result = rules.evaluate(b["hourly"], [dict(r) for r in records], b["freshness"] == "FRESH", datetime.now(UTC))
        return {
            **result,
            "fieldId": str(field_id),
            "crop": ctx["crop"],
            "provider": b["provider"],
            "freshness": b["freshness"],
            "fetchedAt": b["fetchedAt"],
            "expiresAt": b["expiresAt"],
        }

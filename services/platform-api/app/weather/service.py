"""Shared PostgreSQL persistence, provider-aware Redis cache and bounded stale fallback."""

import json
import time
from datetime import UTC, datetime, timedelta

import redis
from sqlalchemy import text

from app.config import get_settings
from app.db import transaction
from app.errors import ApiError
from app.logging import log
from app.weather import provider


def cache():
    return redis.Redis.from_url(get_settings().redis_url, socket_timeout=0.3, socket_connect_timeout=0.3)


def context(c, user_id, field_id):
    row = (
        c.execute(
            text("""SELECT fi.id::text, ST_Y(fi.centroid) AS latitude,ST_X(fi.centroid) AS longitude,
      cc.id::text AS "cropCycleId",cc.crop_id::text AS "cropId",cr.name AS crop
      FROM fields fi JOIN farms fa ON fa.id=fi.farm_id JOIN farmer_profiles fp ON fp.id=fa.farmer_id
      LEFT JOIN LATERAL (SELECT * FROM crop_cycles WHERE field_id=fi.id AND status='active' AND deleted_at IS NULL
        ORDER BY created_at DESC,id DESC LIMIT 1) cc ON true LEFT JOIN crops cr ON cr.id=cc.crop_id
      WHERE fi.id=:fid AND fp.user_id=:uid AND fi.deleted_at IS NULL AND fa.deleted_at IS NULL"""),
            {"fid": str(field_id), "uid": user_id},
        )
        .mappings()
        .first()
    )
    if not row:
        raise ApiError(404, "FIELD_NOT_FOUND", "Field not found.")
    if row["latitude"] is None or row["longitude"] is None:
        raise ApiError(409, "FIELD_LOCATION_REQUIRED", "Set the field boundary before requesting weather.")
    return dict(row)


def age(bundle, now):
    try:
        return (now - datetime.fromisoformat(bundle["fetchedAt"])).total_seconds()
    except (KeyError, TypeError, ValueError):
        return float("inf")


def latest(c, field_id, cell):
    row = c.execute(
        text(
            "SELECT metadata FROM weather_forecasts WHERE field_id=:fid AND provider='OPEN_METEO' "
            "AND metadata->>'cell'=:cell ORDER BY generated_at DESC LIMIT 1"
        ),
        {"fid": str(field_id), "cell": cell},
    ).scalar()
    return row.get("bundle") if row else None


def persist(c, field_id, bundle, cell):
    fetched = datetime.fromisoformat(bundle["fetchedAt"])
    bucket = datetime.fromtimestamp(int(fetched.timestamp()) // 900 * 900, UTC)
    c.execute(
        text("""INSERT INTO weather_forecasts(field_id,provider,source_identifier,observation_status,
      generated_at,valid_from,valid_to,cache_bucket,points,metadata)
      VALUES(:fid,'OPEN_METEO',:source,'RECORDED',:fetched,:start,:end,:bucket,CAST(:points AS jsonb),CAST(:metadata AS jsonb))
      ON CONFLICT(field_id,provider,cache_bucket) DO UPDATE SET source_identifier=excluded.source_identifier,
      generated_at=excluded.generated_at,valid_from=excluded.valid_from,
      valid_to=excluded.valid_to,points=excluded.points,metadata=excluded.metadata,updated_at=now()"""),
        {
            "fid": str(field_id),
            "source": f"OPEN_METEO:{field_id}:{bundle['fetchedAt']}",
            "fetched": fetched,
            "start": bundle["hourly"][0]["time"],
            "end": bundle["hourly"][-1]["time"],
            "bucket": bucket,
            "points": json.dumps(bundle["hourly"]),
            "metadata": json.dumps({"cell": cell, "bundle": bundle}),
        },
    )


def bundle(c, ctx):
    s, now = get_settings(), datetime.now(UTC)
    if s.environment == "production" and not s.open_meteo_api_key:
        raise ApiError(503, "WEATHER_COMMERCIAL_KEY_REQUIRED", "Commercial weather access is not configured.")
    if s.weather_provider != "open-meteo":
        raise ApiError(
            503, "WEATHER_PROVIDER_NOT_SUPPORTED", "F04 currently supports Open-Meteo; the legacy OpenWeatherMap adapter remains available before cutover."
        )
    lat, lon = round(ctx["latitude"], 3), round(ctx["longitude"], 3)
    cell = f"{lat:.3f}:{lon:.3f}"
    key = f"weather:f04:v1:open-meteo:Asia-Karachi:{cell}"
    old = latest(c, ctx["id"], cell)
    value = old if old and 0 <= age(old, now) < s.weather_cache_ttl else None
    if value is None:
        # Transaction lock coordinates API processes and workers, even when Redis is unavailable.
        locked = c.execute(text("SELECT pg_try_advisory_xact_lock(hashtextextended(:key,0))"), {"key": key}).scalar()
        if not locked and not old:
            deadline = time.monotonic() + 7
            while not locked and time.monotonic() < deadline:
                time.sleep(0.1)
                locked = c.execute(text("SELECT pg_try_advisory_xact_lock(hashtextextended(:key,0))"), {"key": key}).scalar()
            if locked:
                # Another endpoint (including the shared header) may have just refreshed this field.
                candidate = latest(c, ctx["id"], cell)
                if candidate and 0 <= age(candidate, datetime.now(UTC)) < s.weather_cache_ttl:
                    old = value = candidate
        if not locked:
            if old and 0 <= age(old, now) <= s.weather_cache_ttl + s.weather_max_stale:
                value = old
            else:
                raise ApiError(503, "WEATHER_REFRESH_IN_PROGRESS", "Forecast refresh in progress. Retry shortly.")
        elif value is None:
            now = datetime.now(UTC)
            try:
                encoded = cache().get(key)
                candidate = json.loads(encoded) if encoded else None
                if candidate and 0 <= age(candidate, now) < s.weather_cache_ttl:
                    value = candidate
            except (redis.RedisError, ValueError, TypeError):
                log.warning("weather_cache_unavailable")
            if value is None:
                try:
                    value = provider.fetch(lat, lon)
                except provider.ProviderError as exc:
                    log.warning("weather_provider_failed", code=exc.code, field_id=ctx["id"])
                    if old and 0 <= age(old, now) <= s.weather_cache_ttl + s.weather_max_stale:
                        value = old
                    else:
                        raise ApiError(503, exc.code, "Weather provider unavailable. Retry shortly.") from exc
                else:
                    try:
                        cache().setex(key, s.weather_cache_ttl, json.dumps(value))
                    except redis.RedisError:
                        log.warning("weather_cache_unavailable")
            if value is not old:
                persist(c, ctx["id"], value, cell)
    now = datetime.now(UTC)
    fresh = 0 <= age(value, now) < s.weather_cache_ttl
    expires = datetime.fromisoformat(value["fetchedAt"]) + timedelta(seconds=s.weather_cache_ttl)
    log.info("weather_forecast_served", field_id=ctx["id"], freshness="FRESH" if fresh else "STALE")
    return {
        **value,
        "fieldId": ctx["id"],
        "freshness": "FRESH" if fresh else "STALE",
        "expiresAt": expires.isoformat(),
        "ageSeconds": max(0, int(age(value, now))),
        "generatedAt": value["fetchedAt"],
        "cachePolicy": {"sharedProviderFetch": True, "ttlSeconds": s.weather_cache_ttl, "coordinatePrecisionDecimals": 3},
    }


def load(user_id, field_id):
    with transaction() as c:
        ctx = context(c, user_id, field_id)
        return ctx, bundle(c, ctx)

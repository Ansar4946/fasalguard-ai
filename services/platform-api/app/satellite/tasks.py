"""Celery F02 tasks with durable dispatch, worker exclusion and idempotent publication."""

from datetime import UTC, datetime, timedelta

from sqlalchemy import text

from app.config import get_settings
from app.db import engine, transaction
from app.logging import log
from app.satellite import provider, raster
from app.satellite import repository as repo
from app.worker import celery_app

ALREADY_RUNNING_RETRY_SECONDS = 45
TERMINAL = frozenset({"COMPLETED", "NO_VALID_SCENE", "CLOUD_BLOCKED", "FAILED"})


@celery_app.task(name="satellite.dispatch")
def dispatch():
    published = 0
    with transaction() as c:
        rows = (
            c.execute(
                text("""SELECT o.capture_id::text,o.user_id::text FROM satellite_task_outbox o
        JOIN satellite_captures sc ON sc.id=o.capture_id WHERE o.completed_at IS NULL
        AND o.next_dispatch_at<=now() AND sc.processing_status NOT IN ('COMPLETED','NO_VALID_SCENE','CLOUD_BLOCKED','FAILED')
        ORDER BY o.next_dispatch_at FOR UPDATE OF o SKIP LOCKED LIMIT 20""")
            )
            .mappings()
            .all()
        )
        for row in rows:
            try:
                process_capture.apply_async(args=[row["capture_id"], row["user_id"]], task_id=f"satellite-{row['capture_id']}", queue="satellite")
            except Exception as exc:  # noqa: BLE001
                log.warning("satellite_dispatch_failed", capture_id=row["capture_id"], error_type=type(exc).__name__)
                continue
            # Redis publish and SQL commit cannot be atomic: duplicates are safe; expired leases redispatch.
            c.execute(
                text("UPDATE satellite_task_outbox SET next_dispatch_at=now()+interval '15 minutes',dispatch_count=dispatch_count+1 WHERE capture_id=:cid"),
                {"cid": row["capture_id"]},
            )
            published += 1
    return published


@celery_app.task(name="satellite.process", bind=True, max_retries=3, soft_time_limit=540, time_limit=600)
def process_capture(self, capture_id: str, user_id: str):
    # Serialize a field's scene selection AND publication, including different capture IDs.
    with engine().connect() as guard:
        field_id = guard.execute(text("SELECT field_id::text FROM satellite_captures WHERE id=:cid"), {"cid": capture_id}).scalar()
        if not field_id:
            return "NOT_FOUND"
        lock_key = f"satellite-field-{field_id}"
        locked = guard.execute(text("SELECT pg_try_advisory_lock(hashtextextended(:key,0))"), {"key": lock_key}).scalar()
        guard.commit()
        if not locked:
            # A sibling capture of this field holds the lock. Dispatch has just leased this outbox row for 15 minutes
            # (crash recovery); shorten it so the beat redispatches soon after the sibling finishes. The UPDATE waits
            # for dispatch's row lock, so it always lands after the lease write.
            with transaction() as c:
                repo.defer_outbox(c, capture_id, ALREADY_RUNNING_RETRY_SECONDS)
            return "ALREADY_RUNNING"
        try:
            with transaction() as c:
                capture = repo.get(c, user_id, capture_id)
                if capture is None:
                    repo.update(c, capture_id, "FAILED", {"failureCode": "FIELD_ACCESS_REVOKED"})
                    repo.complete_outbox(c, capture_id)
                    return "ACCESS_REVOKED"
                if capture["processingStatus"] in TERMINAL:
                    return capture["processingStatus"]
                raw = (
                    c.execute(text("SELECT requested_from,requested_to,raw_metadata FROM satellite_captures WHERE id=:cid"), {"cid": capture_id})
                    .mappings()
                    .one()
                )
                used = set(
                    c.execute(
                        text(
                            "SELECT provider_scene_id FROM satellite_captures WHERE field_id=:fid AND provider=:provider "
                            "AND processing_status='COMPLETED' AND raw_metadata->>'geometryHash'=:geometry "
                            "AND raw_metadata->>'processingVersion'=:version"
                        ),
                        {
                            "fid": capture["fieldId"],
                            "provider": repo.PROVIDER,
                            "geometry": raw["raw_metadata"]["geometryHash"],
                            "version": raw["raw_metadata"]["processingVersion"],
                        },
                    ).scalars()
                )
                repo.update(c, capture_id, "SEARCHING_SCENE")
            polygon = raw["raw_metadata"]["boundarySnapshot"]
            scenes = provider.search(polygon, raw["requested_from"], raw["requested_to"], raw["raw_metadata"]["maxCloudCoverage"])
            scene = next((item for item in scenes if item["id"] not in used), None)
            if scene is None:
                with transaction() as c:
                    repo.update(c, capture_id, "NO_VALID_SCENE", {"reason": "NO_NEW_ELIGIBLE_ACQUISITION" if scenes else "NO_ELIGIBLE_ACQUISITION"})
                    repo.complete_outbox(c, capture_id)
                return "NO_VALID_SCENE"
            with transaction() as c:
                repo.update(c, capture_id, "PROCESSING")
            result = raster.process(scene, polygon)
            keys = {}
            for name, (body, content_type) in result["outputs"].items():
                suffix = "png" if content_type == "image/png" else "tif"
                key = f"satellite/{capture['fieldId']}/{capture_id}/{name.lower()}.{suffix}"
                raster.write_private(key, body)
                keys[name] = key
            with transaction() as c:
                if repo.get(c, user_id, capture_id) is None:
                    raise ValueError("FIELD_ACCESS_REVOKED")
                repo.publish(c, capture_id, user_id, scene, result, keys)
            log.info("satellite_capture_processed", capture_id=capture_id, scene_id=scene["id"], valid_pixels=result["statistics"]["NDVI"]["validPixelCount"])
            return "PROCESSED"
        except Exception as exc:  # noqa: BLE001
            retryable = not isinstance(exc, ValueError | KeyError)
            code = str(exc) if isinstance(exc, provider.ProviderError | ValueError) else "PROCESSING_UNAVAILABLE"
            # Never store provider URLs, request authorization or traceback in farmer-visible metadata.
            if code not in {
                "CATALOG_UNAVAILABLE",
                "CATALOG_TOO_LARGE",
                "INVALID_STAC_ITEM",
                "UNSUPPORTED_STAC_PAGINATION",
                "CATALOG_LIMIT_EXCEEDED",
                "UNSAFE_ASSET_URL",
                "UNSUPPORTED_ASSET",
                "MISSING_RADIOMETRY",
                "AMBIGUOUS_RADIOMETRY",
                "FIELD_ACCESS_REVOKED",
                "FIELD_RASTER_TOO_LARGE",
                "SOURCE_WINDOW_TOO_LARGE",
                "UNSUPPORTED_RASTER_CRS",
                "FIELD_SMALLER_THAN_PIXEL",
            }:
                code = "PROCESSING_UNAVAILABLE"
            log.warning("satellite_processing_failed", capture_id=capture_id, error_code=code, retry=self.request.retries)
            if retryable and self.request.retries < self.max_retries:
                with transaction() as c:
                    repo.update(c, capture_id, "QUEUED", {"failureCode": code, "retrying": True})
                raise self.retry(countdown=30 * 2**self.request.retries, exc=RuntimeError(code)) from None
            with transaction() as c:
                repo.update(c, capture_id, "FAILED", {"failureCode": code, "retrying": False})
                repo.complete_outbox(c, capture_id)
            return "FAILED"
        finally:
            guard.execute(text("SELECT pg_advisory_unlock(hashtextextended(:key,0))"), {"key": lock_key})
            guard.commit()


@celery_app.task(name="satellite.schedule")
def schedule():
    if not get_settings().satellite_scheduler_enabled:
        return 0
    scheduled = 0
    with transaction() as c:
        rows = (
            c.execute(
                text("""SELECT fi.id::text,fp.user_id::text,ST_AsGeoJSON(fi.boundary)::json AS boundary FROM fields fi JOIN farms f ON f.id=fi.farm_id
JOIN farmer_profiles fp ON fp.id=f.farmer_id JOIN users u ON u.id=fp.user_id WHERE fi.status='active' AND fi.deleted_at IS NULL
AND f.deleted_at IS NULL AND u.status='active' AND u.deleted_at IS NULL AND fi.next_satellite_check_at<=now() AND COALESCE(
(SELECT (sp.limits->>'satelliteMonitoring')::boolean FROM subscriptions s JOIN subscription_plans sp ON sp.code=s.plan_code WHERE
s.user_id=fp.user_id AND s.status IN ('TRIAL','ACTIVE') ORDER BY s.created_at DESC LIMIT 1), (SELECT
(sp.limits->>'satelliteMonitoring')::boolean FROM pilot_users pu JOIN subscriptions s ON s.organization_id=pu.organization_id JOIN
subscription_plans sp ON sp.code=s.plan_code WHERE pu.user_id=fp.user_id AND s.status IN ('TRIAL','ACTIVE') ORDER BY s.created_at
DESC LIMIT 1),false) AND NOT EXISTS(SELECT 1 FROM satellite_captures sc WHERE sc.field_id=fi.id AND sc.provider=:provider AND
sc.processing_status IN ('QUEUED','SEARCHING_SCENE','PROCESSING','ANALYSING')) ORDER BY fi.next_satellite_check_at FOR UPDATE OF
fi SKIP LOCKED LIMIT 20"""),
                {"provider": repo.PROVIDER},
            )
            .mappings()
            .all()
        )
        now = datetime.now(UTC)
        for row in rows:
            try:
                raster.geometry(row["boundary"])
            except ValueError:
                log.warning("satellite_invalid_scheduled_field", field_id=row["id"])
                c.execute(text("UPDATE fields SET next_satellite_check_at=now()+interval '1 day' WHERE id=:fid"), {"fid": row["id"]})
                continue
            repo.create(c, row["user_id"], row["id"], row["boundary"], now - timedelta(days=30), now, 30)
            c.execute(text("UPDATE fields SET next_satellite_check_at=now()+interval '1 day',updated_at=now() WHERE id=:fid"), {"fid": row["id"]})
            scheduled += 1
    return scheduled

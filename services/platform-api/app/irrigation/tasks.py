"""Durable F03 jobs; inputs are immutable, publication is idempotent."""

from datetime import date

from sqlalchemy import text

from app.config import get_settings
from app.db import engine, transaction
from app.errors import ApiError
from app.irrigation import repository as repo
from app.irrigation import science, weather
from app.logging import log
from app.worker import celery_app

TERMINAL = {"COMPLETED", "FAILED", "BLOCKED_EXTERNAL"}


@celery_app.task(name="irrigation.dispatch")
def dispatch():
    count = 0
    with transaction() as c:
        rows = (
            c.execute(
                text("""SELECT r.id::text,r.owner_id::text,r.kind FROM irrigation_task_outbox o
        JOIN irrigation_runs r ON r.id=o.run_id WHERE o.completed_at IS NULL AND o.next_dispatch_at<=now()
        AND r.status IN ('QUEUED','PROCESSING') ORDER BY o.next_dispatch_at FOR UPDATE OF o SKIP LOCKED LIMIT 10""")
            )
            .mappings()
            .all()
        )
        for row in rows:
            if row["kind"] == "WATER_PRODUCTIVITY" and not get_settings().wapor_enabled:
                repo.finish(c, row["id"], "BLOCKED_EXTERNAL", code="WAPOR_NOT_CONFIGURED")
                continue
            task = productivity if row["kind"] == "WATER_PRODUCTIVITY" else process
            queue = "wapor" if row["kind"] == "WATER_PRODUCTIVITY" else "irrigation"
            try:
                task.apply_async(args=[row["id"], row["owner_id"]], queue=queue, task_id=f"water-{row['id']}")
            except Exception as exc:  # noqa: BLE001
                log.warning("irrigation_dispatch_failed", run_id=row["id"], error_type=type(exc).__name__)
                continue
            c.execute(
                text("UPDATE irrigation_task_outbox SET dispatch_count=dispatch_count+1,next_dispatch_at=now()+interval '35 minutes' WHERE run_id=:id"),
                {"id": row["id"]},
            )
            count += 1
    return count


def execute(task, run_id, uid, satellite=False):
    with engine().connect() as guard:
        key = f"irrigation-run:{run_id}"
        if not guard.execute(text("SELECT pg_try_advisory_lock(hashtextextended(:key,0))"), {"key": key}).scalar():
            return "ALREADY_PROCESSING"
        guard.commit()
        try:
            with transaction() as c:
                row = repo.owned_run(c, uid, run_id)
                if row["status"] in TERMINAL:
                    return row["status"]
                attempts = c.execute(
                    text("UPDATE irrigation_runs SET attempt_count=attempt_count+1 WHERE id=:id RETURNING attempt_count"), {"id": run_id}
                ).scalar_one()
                if attempts > 3:
                    repo.finish(c, run_id, "FAILED", code="WORKER_ATTEMPTS_EXHAUSTED")
                    return "FAILED"
                if (row["kind"] == "WATER_PRODUCTIVITY") != satellite:
                    raise ValueError("JOB_KIND_MISMATCH")
                repo.finish(c, run_id, "PROCESSING")
            snapshot = row["inputs"]
            if satellite:
                from app.irrigation.wapor import compute

                result = compute(run_id, snapshot)
            else:
                body = snapshot["request"]["body"]
                if body["weatherSource"] == "MANUAL":
                    days, provenance = body["manualWeather"], {"provider": "FARMER_SUPPLIED", "source": body["source"], "verifiedByPlatform": False}
                else:
                    days, provenance = weather.archive(
                        snapshot["context"]["latitude"],
                        snapshot["context"]["longitude"],
                        date.fromisoformat(snapshot["profile"]["initialDate"]),
                        date.fromisoformat(body["endDate"]),
                    )
                result = science.calculate(snapshot["profile"], days, snapshot["events"], snapshot["areaHa"])
                result.update(
                    {
                        "weatherProvenance": provenance,
                        "weatherInputs": days,
                        "profileVersion": snapshot["profileVersion"],
                        "snapshotHash": repo.digest(snapshot),
                        "profileSource": snapshot["profile"]["source"],
                    }
                )
            with transaction() as c:
                repo.owned_run(c, uid, run_id)  # revocation/field transfer before publication
                repo.finish(c, run_id, "COMPLETED", result=result)
            log.info("irrigation_run_completed", run_id=run_id, kind=row["kind"])
            return "COMPLETED"
        except Exception as exc:  # noqa: BLE001
            from app.irrigation.wapor import WaporBlocked

            if isinstance(exc, WaporBlocked):
                code, status = exc.code, "BLOCKED_EXTERNAL"
            elif isinstance(exc, ApiError):
                code, status = "FIELD_ACCESS_REVOKED", "FAILED"
            elif isinstance(exc, weather.WeatherUnavailable):
                code, status = str(exc), "FAILED"
            elif isinstance(exc, ValueError | KeyError):
                code, status = "INVALID_CALCULATION_INPUT_OR_OUTPUT", "FAILED"
            else:
                code, status = "PROCESSING_UNAVAILABLE", "FAILED"
            log.warning("irrigation_processing_failed", run_id=run_id, failure_code=code, error_type=type(exc).__name__)
            retryable = not isinstance(exc, WaporBlocked | ApiError | ValueError | KeyError) and code != "WEATHER_COMMERCIAL_ACCESS_REQUIRED"
            if retryable and task.request.retries < task.max_retries:
                with transaction() as c:
                    repo.finish(c, run_id, "QUEUED", code=code)
                raise task.retry(exc=RuntimeError(code), countdown=30 * 2**task.request.retries) from None
            with transaction() as c:
                repo.finish(c, run_id, status, code=code)
            return status
        finally:
            guard.execute(text("SELECT pg_advisory_unlock(hashtextextended(:key,0))"), {"key": key})
            guard.commit()


@celery_app.task(name="irrigation.process", bind=True, max_retries=2, soft_time_limit=150, time_limit=180)
def process(self, run_id, uid):
    return execute(self, run_id, uid)


@celery_app.task(name="irrigation.productivity", bind=True, max_retries=1, soft_time_limit=1740, time_limit=1800)
def productivity(self, run_id, uid):
    return execute(self, run_id, uid, satellite=True)

"""Crop-scan screening task (port of services/api crop-scan.processor.ts with F01 fixes)."""

import time
from datetime import UTC, datetime

from app.config import get_settings
from app.crop_scans import handoff, policy, quality
from app.crop_scans import repository as repo
from app.crop_scans.storage import MediaUnavailable, read_private_object, to_clean_jpeg
from app.crop_scans.vision import RoboflowClient, VisionError, select_model
from app.db import transaction
from app.logging import log
from app.worker import celery_app

MAX_ATTEMPTS = 3


def _fail(scan_id: str, owner: str, code: str, started: datetime, farm_id=None, crop_cycle_id=None) -> dict:
    with transaction() as c:
        repo.set_status(c, scan_id, repo.NEEDS_FOLLOW_UP, failure_code=code)
        repo.record_ai_run(
            c,
            user_id=owner,
            farm_id=farm_id,
            crop_season_id=None,
            status="FAILED",
            started_at=started,
            completed_at=datetime.now(UTC),
            error_code=code,
            source_id=scan_id,
        )
    log.info("crop_scan_failed", scan_id=scan_id, failure_code=code)
    return {"scanId": scan_id, "status": repo.NEEDS_FOLLOW_UP, "failureCode": code}


@celery_app.task(bind=True, name="crop_scans.analyse", max_retries=MAX_ATTEMPTS - 1, acks_late=True)
def analyse(self, scan_id: str, owner_id: str) -> dict:
    s = get_settings()
    started = datetime.now(UTC)
    with transaction() as c:
        scan = repo.lock(c, owner_id, scan_id)
        if scan is None:
            log.warning("crop_scan_missing", scan_id=scan_id)
            return {"scanId": scan_id, "status": "MISSING"}
        if scan["status"] not in (repo.IMAGE_VALIDATION, repo.ANALYSING):
            log.info("crop_scan_skip_state", scan_id=scan_id, status=scan["status"])
            return {"scanId": scan_id, "status": scan["status"], "skipped": True}
        rows = repo.scan_images_for_analysis(c, owner_id, scan_id)

    farm_id = rows[0]["farmId"] if rows else None
    if not rows:
        return _fail(scan_id, owner_id, "SCAN_IMAGE_REQUIRED", started)
    try:
        model = select_model(s, [r["cropName"] for r in rows])
    except VisionError as e:
        return _fail(scan_id, owner_id, e.code, started, farm_id)

    images, issue_codes, quality_failed = [], set(), False
    try:
        with transaction() as c:
            for r in rows:
                if int(r["sizeBytes"] or 0) > quality.MAX_IMAGE_BYTES:
                    raise quality.ImageRejected("IMAGE_TOO_LARGE")
                img = quality.decode(read_private_object(r["objectKey"]))
                repo.update_dimensions(c, r["id"], img.width, img.height)
                q = quality.assess(img)
                repo.save_quality(c, r["id"], q.acceptable, q.issues, q.metadata)
                quality_failed |= not q.acceptable
                issue_codes.update(i["code"] for i in q.issues)
                images.append(to_clean_jpeg(img))
    except quality.ImageRejected as e:
        return _fail(scan_id, owner_id, e.code, started, farm_id)
    except MediaUnavailable as e:
        return _fail(scan_id, owner_id, str(e), started, farm_id)

    if quality_failed:
        code = ",".join(sorted(issue_codes)) or "IMAGE_QUALITY_REJECTED"
        with transaction() as c:
            repo.set_status(c, scan_id, repo.NEEDS_FOLLOW_UP, failure_code=code)
        log.info("crop_scan_quality_rejected", scan_id=scan_id, issues=sorted(issue_codes))
        return {"scanId": scan_id, "status": repo.NEEDS_FOLLOW_UP, "failureCode": code}

    with transaction() as c:
        repo.set_status(c, scan_id, repo.ANALYSING)
    t0 = time.monotonic()
    try:
        pred = RoboflowClient(s).predict(model, images)
    except VisionError as e:
        if e.retryable and self.request.retries < self.max_retries:
            log.warning("crop_scan_provider_retry", scan_id=scan_id, code=e.code, attempt=self.request.retries + 1)
            raise self.retry(countdown=2 ** (self.request.retries + 1), exc=e) from e
        return _fail(scan_id, owner_id, e.code, started, farm_id)

    with transaction() as c:
        pol = repo.policy_of(c, scan_id)
        disp = policy.disposition(pred.predicted_condition, pred.confidence, float(pol["minimumConfidence"]), float(pol["expertReviewBelow"]))
        status = policy.status_for(disp)
        repo.save_result(c, scan_id, pred, disp, policy.DISCLAIMER)
        repo.set_status(c, scan_id, status, clear_failure=True)
        repo.record_ai_run(
            c,
            user_id=owner_id,
            farm_id=farm_id,
            status="COMPLETED",
            started_at=started,
            completed_at=datetime.now(UTC),
            latency_ms=int((time.monotonic() - t0) * 1000),
            model=pred.model_id,
            confidence=pred.confidence,
            human_review_status="REQUIRED" if disp == "EXPERT_REVIEW_RECOMMENDED" else "NOT_REQUIRED",
            source_id=scan_id,
        )
    log.info(
        "crop_scan_screened",
        scan_id=scan_id,
        model=pred.model_id,
        version=pred.model_version,
        disposition=disp,
        confidence=pred.confidence,
        latency_ms=pred.latency_ms,
        images=len(images),
    )
    if status == repo.DIAGNOSED:
        handoff.emit("SCREENING_COMPLETED", scan_id)
    return {"scanId": scan_id, "status": status, "disposition": disp}

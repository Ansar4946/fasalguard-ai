"""Best-effort hand-off of side effects that NestJS still owns (field-risk queue, lifecycle email).

NestJS re-reads the scan by id; we send no user data. Failures are logged and never affect
the scan result (same contract as the legacy processor's best-effort side effects).
"""

import httpx

from app.config import get_settings
from app.logging import log


def emit(event: str, scan_id: str) -> bool:
    s = get_settings()
    if not s.internal_service_token:
        log.warning("crop_scan_handoff_skipped", handoff_event=event, scan_id=scan_id, reason="INTERNAL_SERVICE_TOKEN unset")
        return False
    try:
        r = httpx.post(
            f"{s.core_api_internal_url.rstrip('/')}/internal/crop-scan-events",
            json={"event": event, "scanId": scan_id},
            headers={"x-internal-token": s.internal_service_token},
            timeout=5.0,
        )
        ok = r.status_code == 202
        log.info("crop_scan_handoff", handoff_event=event, scan_id=scan_id, status=r.status_code, ok=ok)
        return ok
    except httpx.HTTPError as exc:
        log.warning("crop_scan_handoff_failed", handoff_event=event, scan_id=scan_id, error_type=type(exc).__name__)
        return False

# Independent F04 review

Reviewer: separate Codex agent `/root/f02_review`, read-only; user-required independent review.
Date: 2026-10-14 (Asia/Karachi).

Initial findings: hero bypassed rule approval/freshness; open browser tab did not expire
guidance; parallel cold-cache endpoint calls could fail the page while a sibling refreshed.

Fixes independently reviewed: hero uses productionAssessment and eligible matches; browser
expiry invalidates guidance and revalidates on timer/focus/visibility; forecast supplies
current data, and bounded PostgreSQL advisory-lock coordination covers shared header requests.
Redis reuse checks current time after waiting. Owner-scoped access, stale fallback and
legacy email approval gate were reviewed. No remaining blocking source issue was found.

Reviewer independently inspected the then-current logs: Python 161 passed / 6 native skips,
9 F04 integration tests passed, API 202 tests passed, web build succeeded, migration 39 reapplied.
Subsequent timestamp/minimum-maximum validation coverage increased Python passes to 163.
Frontend compatibility/display refinements and final browser evidence require the addendum below.

## Final addendum

Reviewer independently inspected final source refinements, `browser-live.json`,
`database-live.json` and `browser-live.png`. Both evidence files match the same synthetic field
and retrieval timestamp `2026-10-14T03:20:39.180931Z`, with 168 hourly points and seven daily
forecasts. The screenshot shows Karachi dates/times, native daily rain totals and preserved
humidity, attribution and appropriately withheld agronomic guidance. Mock outage/expiry checks
are explicitly distinguished from genuine provider data. Latest Python regression log records
163 passed, 6 native skips, 23 integration deselections, exit 0.

Final reviewer decision: **approved RUN_PASS for the tested F04 slice**. No concrete remaining
source blocker was found. Commercial credentials and local expert rule approval remain
BLOCKED_EXTERNAL; no PRODUCTION_VERIFIED endorsement. Minor nonblocking UI follow-up: label
the hero's daily probability as today's rain chance to distinguish it from current precipitation.

External production blockers: commercial Open-Meteo authentication/subscription verification,
locally approved and validated crop-weather rules. This is not PRODUCTION_VERIFIED.

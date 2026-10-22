# Feature matrix — planning draft

Date: 2026-10-13. This file was missing at F01 inspection. It records the current F01 plan, not a completed Phase C architecture or validated status of existing features. Latest user instruction specifies Next.js, FastAPI, PostgreSQL/PostGIS and Celery for F01; older NestJS target text is not the F01 target.

| Feature | Integration status | Scope/evidence |
|---|---|---|
| F01 image screening + future risk | IN_PROGRESS: planning only | Existing Next/Nest/BullMQ flow and Python inference inspected. Incremental Python/Celery slice proposed; real inference/security/runtime evidence pending. See ../features/F01.md |
| F02 satellite | NOT_STARTED for this integration | Existing functionality must be preserved; not recertified here |
| F03 irrigation | NOT_STARTED | pyfao56/pywapor candidates; audit validation remains required |
| F04 weather | BLOCKED_EXTERNAL for production signoff | RUN_PASS tested slice: opt-in FastAPI daily/hourly forecasts, freshness, warning approval gating and real UI/API/provider/PostGIS evidence. Commercial credentials and local expert rules remain blocked. See ../features/F04.md |
| F05 field mapping | RUN_PASS tested slice; BLOCKED_EXTERNAL production signoff | Shared PostGIS geometry, bounded GeoJSON import/export, GPS provenance, holes/area, cross-service version locks; 38 feature tests and 8 browser checks passed with DB proof and independent review. See ../features/F05.md |
| F06 offline mobile inference | BLOCKED_EXTERNAL | Disabled native/storage/sync foundation; host unit/static checks pass. Missing cleared weights, verified sign-in, native/device and real DB evidence; no genuine inference claim. See ../features/F06.md |
| F07 market | RUN_PASS observational slice; forecasting/deployment BLOCKED_EXTERNAL | 48 tests, genuine provider/database/browser workflow and production build pass; independent review approved. See ../features/F07.md |
| F08 voice | RUN_PASS consent-gated application slice; real model validation BLOCKED_EXTERNAL | Browser recording/private media/authenticated API/consent grant and revocation/audio validation implemented; 19 focused tests plus production builds pass. Real Urdu/Hindi/English STT accuracy and TTS listening remain blocked on credentials and a consented labelled corpus. See ../features/F08.md |
| F09 voice/USSD finance | RUN_PASS expense-only application slice; live gateway BLOCKED_EXTERNAL | Signed test-adapter callback, Argon2id PIN/lockout, owned farm/crop-season selection, atomic append-only PKR ledger and replay-safe receipts pass unit and PostgreSQL integration tests. Production rejects the test adapter. Payments/income remain NOT_STARTED. See ../features/F09.md |
| F10 agricultural assistant | IMPLEMENTED; TESTED_PASS on a disposable stack with a contract-stub provider; real model run BLOCKED (no valid provider key) | Grounded multilingual read-only Q&A slice: approved-knowledge retrieval, enforced citations, abstention, idempotent send, BFF routes and chat UI. Not marked complete: no real-model evidence, no real corpus, independent review pending. See ../features/F10.md |
| F11 feature-phone harvest/sales | NOT_STARTED | Gateway and ledger design pending |
| F12 notifications | IMPLEMENTED; TESTED_PASS on a disposable stack (36 API unit + 21 PostgreSQL integration + 21 web + 21 mobile + 17-check browser E2E, twice); real push to a phone and SMS BLOCKED; mobile push registration wired and logic-tested, unverified on a device (only a Firebase web key was supplied; a service account and `google-services.json` are needed) | Real web inbox and bell replace hardcoded alerts; unread count, mark read, preferences, enforced quiet hours; mobile inbox. Community Reports tab still shows sample data. Independent review pending. See ../features/F12.md |
| F13 yield | NOT_STARTED | Regional validation/license gaps |
| F14 profitability/credit readiness | NOT_STARTED | No synthetic credit claims |

Status refers to this integration task, not to absence of features in the active project. F01 slice 1 completion cannot certify future-risk prediction or the complete F01 feature.



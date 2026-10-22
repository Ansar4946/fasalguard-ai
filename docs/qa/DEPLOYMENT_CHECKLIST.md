# Deployment checklist

Date: 2026-10-16. Status: **ready for a limited staging deploy; not ready for production.**
This file summarises the QA reports in `docs/qa/` and what is still open. It is not a certification.

## 1. Verified by command output (this round)

| Check | Result |
|---|---|
| API typecheck, lint, `nest build` | clean |
| API unit tests | 64 suites, 345 passed, 2 skipped |
| Web typecheck | clean |
| Web lint | 0 errors, 41 warnings (QA scripts and a few app files) |
| Web production build | passes |
| Web release tests | 15 of 15 |
| Mobile lint, typecheck, node tests | 30 of 30 |
| Platform API (by the QA agent, in a python:3.12 container) | 219 passed, 6 skipped, ruff clean |
| PostgreSQL integration specs (by QA agents, disposable databases) | all targeted specs pass; see `QA_AUTH_CSP_VERIFICATION.md` for 111 of 114 before later fixes |
| Migrations | all 44 apply from an empty PostGIS database and re-run cleanly |

## 2. Fixed since the QA reports

- Login now requires and verifies the password (it previously issued tokens for an email alone).
- A database outage returns 503 and no longer signs users out; `/auth/me` is exempt from the per-user limit.
- Rate limits are per authenticated user; `TRUST_PROXY` controls trusted client IPs.
- Web security headers and CSP; `STORAGE_UPLOAD_ORIGINS` allows presigned-upload hosts.
- Production configuration guards (database SSL, `rediss://`, HTTPS public URLs, internal token, Stripe completeness).
- Real scans no longer fail with `sharp is not a function`; stuck scans recover; image cap; upload overwrite blocked; Redis outage returns 503.
- Internal route `/internal/crop-scan-events` exists with constant-time token check.
- Voice consent, tie abstention, empty market sync, NUL and whitespace assistant input, USSD concurrent confirms, notification limits.
- Mobile Android patch persisted with patch-package; mobile CI job; compose hardening for worker and beat.

## 3. Owner actions before any deployment

1. **Rotate the credentials that were committed to git** (SMTP app password and a Gemini key in `services/api/.env.example`, six commits on the GitHub remote). Then purge history or make the repository private.
2. Set these production values: `INTERNAL_SERVICE_TOKEN` (32+ characters), `DATABASE_SSL=true`, a `rediss://` `REDIS_URL`, HTTPS `WEB_APP_URL` and `API_PUBLIC_URL`, `STORAGE_UPLOAD_ORIGINS`, and `TRUST_PROXY` set to the real number of proxy hops. Production start-up refuses unsafe values.
3. Make a legal decision on `react-leaflet` (Hippocratic-2.1). See `docs/LICENSE_MATRIX.md`.
4. Supply a valid LLM key, a Firebase service account plus a test device, and SMS and USSD gateway credentials. Without them these remain BLOCKED.

## 4. Not verified (do not claim as working)

- Real LLM answers (the Gemini key is invalid); the assistant was tested with a contract stub.
- Push delivery to a phone; mobile UI on a device; the Android emulator test never finished.
- SMS, a live USSD gateway, Urdu and Hindi speech accuracy, offline model inference (no cleared weights).
- F01 model quality: a real leaf photo was scored `HealthyLeaf` at 0.9994 by the wheat model; no labelled image set exists.
- F04 production sign-off (commercial weather key, expert-approved rules).
- Compose hardening at runtime (read-only filesystem, memory limits).
- PostGIS satellite integration tests (deselected by default), live QA scripts against the latest fixes, and a real Redis outage.
- Production HTTPS origin handling of the web app (QA ran it with `NODE_ENV=development`).

## 5. Open product work

- F11 (feature-phone harvest and sales): not started.
- F13 (yield): reference-statistics backend written and tested, not wired into the web app; no prediction by design.
- F14: dropped by the owner.
- Independent Codex review of F09, F10 and F12 is pending.
- Community Reports tab still shows unlabelled sample data.

## 6. Known remaining risks

- CSP allows inline scripts and styles because Next.js needs them.
- Rate-limit counters are in memory per API process (not shared across replicas).
- Mobile build tooling has unpatched advisories (`braces`, `node-forge`); none ships in the app (`docs/qa/MOBILE_DEPENDENCY_TRIAGE.md`).
- Stuck-scan recovery uses a coarse lease with no write fencing.
- Defects D8, D9, D11, D14, D16 and D17 from `QA_F01-F05.md` are not addressed.

## 7. Staging smoke test (run after deploy)

1. Register, then sign in with the password; confirm a wrong password is refused.
2. Create a farm and a field; run a scan; confirm the result or an honest follow-up state.
3. Open satellite, weather, irrigation and market pages; confirm real data or explicit empty states.
4. Record and transcribe a voice note; confirm the upload is not blocked by the CSP.
5. Ask the assistant a question with approved knowledge; confirm citations or abstention.
6. Create a notification; confirm the inbox, the bell and quiet hours.
7. Stop the database briefly; confirm a signed-in user stays signed in and recovers.

## 8. Free single-VM option (Oracle Cloud Always Free, arm64)

A prepared, unrun deployment kit lives in `deploy/oracle-free/`; the owner guide is
`docs/operations/FREE_DEPLOY_ORACLE.md`. It runs the backend in "pilot mode" (`NODE_ENV=development`) because
the production guards forbid local-disk uploads and require TLS Postgres and `rediss://`. It is not the audited
production configuration.

Remaining owner actions for this option:

1. Rotate the credentials committed to git (section 3, item 1) before filling `.env`.
2. Create the Oracle account and A1.Flex VM, reserve the IP, open 80/443 in the VCN, point the domain's A record.
3. Run `bootstrap-vm.sh`, `gen-secrets.sh`, edit `.env` (valid Gemini key, SMTP, optional Firebase, speech, weather keys), `deploy.sh`, `smoke-test.sh`.
4. Decide on Pay As You Go (avoids idle reclamation, free resources stay free) and set a budget alert.
5. Set up off-box backups and an uptime monitor; test one restore.
6. Verify on arm64 (not yet done): image builds, `rasterio` 1.4.4 with the platform and vision code, PostGIS on the `imresamu/postgis` image, the `read_only` worker and beat.

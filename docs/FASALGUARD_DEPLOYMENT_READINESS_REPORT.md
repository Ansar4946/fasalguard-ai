# Fasal Guard Deployment Readiness Report

Audit date: 4 September 2026 (Asia/Karachi)

## A. Current status

**Production: NOT READY**

**Controlled local hackathon demo: READY WITH CONDITIONS**

The application builds and the local backend stack is healthy. Production must remain blocked until previously exposed credentials are rotated, real production secrets and managed dependencies are provisioned, dependency advisory checks complete successfully, and the manual browser demo checklist below passes using a real test account.

## B. Completed and verified features

- Next.js production build completed successfully: 96 routes generated.
- Frontend ESLint completed successfully.
- NestJS build, TypeScript check, and ESLint completed successfully.
- API unit suite completed: 49 suites and 175 tests passed.
- API `/health` returned HTTP 200.
- API `/ready` returned HTTP 200 with database, PostGIS, Redis, object storage, and AI service reported up.
- PostgreSQL has PostGIS 3.5.7, 35 applied TypeORM migrations, and 240 public indexes.
- Redis returned `PONG`; BullMQ market and satellite queue keys exist.
- Existing API and worker containers are running; API and geospatial service health checks are healthy.
- Python service source parsed successfully inside the production container.
- AMIS data is current for the audit date: 54 observations dated 2026-09-04; duplicate key groups: 0.
- AMIS scheduling uses one persistent BullMQ scheduler at 08:00 Asia/Karachi and startup catch-up logic.
- Crop scan uploads use the real private media path and the worker persists model versions, predictions, alternatives, confidence, and a non-diagnostic disclaimer.
- Cotton, wheat, and rice Roboflow endpoints returned HTTP 200 with prediction payloads. Crop-aware routing prevents a rice or wheat field from silently using another crop's model.
- Authentication uses server-only HttpOnly cookies, rotating backend sessions, ownership checks, same-origin mutation protection, and role-aware route redirects.
- Production compose keeps API, worker, AI service, and migration responsibilities separate. The frontend is intentionally deployed on a Next.js-native host.

## C. Critical issues

1. **Credential rotation is still required.** Historical audit evidence records SMTP and Gemini credentials committed in an earlier revision. Current tracked files contain placeholders, but deleting values from the latest tree does not revoke exposed credentials or remove them from history. Rotate affected credentials and review repository visibility/history before production.
2. **Production secrets and managed services are not provisioned.** RDS/PostGIS, Redis/Tair, private object storage, SMTP, Firebase, satellite, Gemini/Qwen, monitoring, and public origins must be supplied through the deployment secret manager. Placeholder environment files are intentionally insufficient.
3. **Current dependency advisories are unverified.** Both frontend and API `npm audit --omit=dev` attempts timed out against the npm advisory endpoint. CI must complete the configured high-severity audit before release.
4. **No independent agronomic model evaluation is recorded.** Roboflow connectivity is proven, but accuracy is not. Do not present training-set accuracy or HTTP success as field accuracy. Validate held-out Pakistani field images and retain a confusion matrix before production recommendations.
5. **Manual browser acceptance is outstanding.** A complete authenticated browser run with real credentials and representative images has not been executed during this audit. Production and live-stage claims remain conditional on the checklist below.

## D. Medium issues

- Market price alerts still use the illustrative fixture service even though the main market dashboard uses live AMIS data. The UI labels illustrative data, but alerts should be backend-persisted before production.
- Government/impact visualizations include explicitly labeled demo aggregates and illustrative chart data. Keep them labeled and exclude them from claimed impact metrics.
- Some weather rules are seeded as `DEMO_UNVERIFIED`; they must not be described as expert-approved recommendations.
- The worker has no Docker health check. Queue processing is observable through Redis/logs, but production orchestration would benefit from a worker liveness/readiness probe.
- The local compose file exposes PostgreSQL and Redis host ports with development credentials. This is acceptable only for local development; production uses the separate managed-service compose topology.
- The production AI-service environment mapping for AMIS must be confirmed on the target platform; local Compose provides it, while production deployment relies on platform-injected service configuration.
- Refresh-cookie lifetime remains separately configured in frontend proxy/session code and backend environment settings, creating a future drift risk.

## E. Nice-to-have improvements

- Add Playwright smoke tests for login, farm creation, crop scan, market dashboard, and mobile navigation.
- Persist price alerts through the API and add delivery/audit records.
- Add a small, versioned independent image evaluation set and automated per-class regression thresholds.
- Add bundle analysis budgets and Web Vitals collection.
- Replace remaining illustrative governance charts when verified warehouse data becomes available.
- Add explicit worker heartbeat and queue-lag dashboards.

## F. Security status

**Status: strong application controls, release blocked by credential history.**

- No secret-like assignments were found in currently tracked non-documentation files.
- `.env` files are ignored; `.env.example` remains tracked with placeholders.
- Production validation rejects weak JWT material, wildcard CORS, production Swagger, missing metrics authentication, development OTP, mock storage, fake Farm Brain, insecure provider origins, and missing selected-provider credentials.
- Media uploads are private and ownership-checked; scan images are not stored as public frontend assets.
- API tests include security hardening, privacy, ownership, and media-policy coverage.
- Required before release: rotate historically exposed credentials, use HTTPS, inject secrets at runtime, restrict database/Redis networking, use a least-privileged migration identity, and complete dependency/container scans.

## G. Performance status

**Status: acceptable for a controlled demo; production load capacity unproven.**

- Redis caching, BullMQ background processing, database indexes, pagination/limits, and bounded provider timeouts are present.
- Crop inference is performed by the worker rather than blocking browser requests.
- Frontend production compilation and static generation succeed.
- Build-time Google Font downloads were removed, making builds deterministic in restricted/offline CI environments.
- No load, soak, Web Vitals, bundle-budget, or provider quota test was performed. Establish p95 targets before public scale.

## H. Deployment checklist

- [ ] Rotate historically exposed SMTP and Gemini credentials; rotate Roboflow if it appeared in shared logs/screenshots.
- [ ] Confirm repository visibility and secret-history remediation.
- [ ] Provision managed PostgreSQL with PostGIS and verify `SELECT PostGIS_Version()`.
- [ ] Provision private Redis/Tair, object storage, and restricted network access.
- [ ] Store all environment values in the platform secret manager; never copy local `.env` to production.
- [ ] Configure production frontend `FASALGUARD_API_URL` and backend `WEB_APP_URL`, `API_PUBLIC_URL`, and exact CORS origin.
- [ ] Configure crop-specific model IDs/versions and verify provider quotas.
- [ ] Configure the production AMIS scraper permission, AI-service variables, and 08:00 Asia/Karachi schedule.
- [ ] Run frontend lint/build and API lint/typecheck/tests/build in CI.
- [ ] Complete npm, pip, and container vulnerability scans with no unreviewed high/critical findings.
- [ ] Build immutable image tags and record image digests.
- [ ] Back up the target database; run the one-shot migration job with the migration identity.
- [ ] Deploy AI service, worker, API, then separately deploy the Next.js frontend.
- [ ] Verify `/api/v1/health`, `/api/v1/ready`, worker queue consumption, migrations, object upload, and logs.
- [ ] Run the browser acceptance checklist and record evidence.
- [ ] Prepare rollback to previous image digests; prefer forward-fix database migrations.

## I. Hackathon demo checklist

- [ ] Start Docker services and verify API/AI health before judges arrive.
- [ ] Start the production-built frontend with the correct backend URL.
- [ ] Use a dedicated test account; never show secret files, Roboflow keys, or admin credentials.
- [ ] Log in and confirm the intended return route is preserved.
- [ ] Show dashboard values and clearly distinguish real records from demo fixtures.
- [ ] Create or open a farm and field with a valid boundary and active crop cycle.
- [ ] Show satellite monitoring; disclose unavailable provider data rather than substituting a fabricated result.
- [ ] Upload a representative crop image and show asynchronous processing, confidence, alternatives, and the safety disclaimer.
- [ ] Show current weather observations and source/timestamp.
- [ ] Show Market Intelligence with AMIS source, price date, 40 kg normalization, and market comparisons.
- [ ] Ask the AI assistant a prepared agriculture question; have a safe fallback ready for provider outage.
- [ ] Show only database-derived impact/viability metrics and identify all test accounts/fixtures.
- [ ] Keep an offline screenshot/video fallback, but label it as recorded evidence rather than live processing.

## Applied fixes during this audit

1. Removed the build-time dependency on Google Fonts and retained build-safe system font stacks.
2. Applied formatter-only corrections that were blocking API lint/CI.
3. Preserved and verified the existing crop-aware Roboflow routing and AMIS persistent scheduling changes.

## Deployment commands

Local demo backend:

```powershell
docker compose up -d --build
docker compose ps
npm.cmd run build
npm.cmd run start
```

Production migration and services (after secrets, immutable images, backup, and approval):

```bash
docker compose --env-file /secure/production-runtime.env \
  -f deploy/compose.production.yml --profile migration run --rm migrate
docker compose --env-file /secure/production-runtime.env \
  -f deploy/compose.production.yml up -d api worker ai-service
```

Deploy the Next.js application separately to the selected Next.js-native host with server-only `FASALGUARD_API_URL`.

# QA: Cross-cutting quality and deployment readiness

Date: 2026-10-16. Assessor: SQA/release engineer (read-only on application code).
Scope: web (root), services/api, services/platform-api, services/geospatial-ai, mobile, deploy/CI/docs.
Note: the repository IS a git repository (13 commits, remote `origin` on GitHub), contrary to the brief.

## Verdict: NO-GO for production as of this snapshot

Two blockers (API build fails; secrets remain in git history) plus several majors.

## Gate results

| Check | Result |
|---|---|
| web `npm run typecheck` | PASS |
| web `npm run build` (Next 16.4.0) | PASS |
| web `npm run lint` | FAIL: 77 errors, 6 warnings. All 77 errors are `no-require-imports` in `.cjs` tests/scripts (tests/*, scripts/*.cjs). Zero errors in app/components/lib source. Warnings: 1 hook-deps, 4 `window.location` internal nav, 1 unused var |
| web `npm run test:release` | PASS 15/15 |
| services/api `npm run build` | FAIL (TS2558, TS7053) |
| services/api `npm run typecheck` | FAIL, same 2 errors, `src/domain/yield/yield-import.service.ts:43,48` (`runner.query<T>()` generic not accepted by installed typeorm 0.3.31, which matches the lockfile) |
| services/api `npm run lint` | FAIL: 19 errors, 2 warnings (14 prettier auto-fixable; remainder are the unsafe-any cascade from the type error; `test/yield.integration-spec.ts` mostly) |
| services/api `npm test` | 58/60 suites pass, 295/299 tests. Failures: `test/security-hardening.spec.ts` (positive production fixture rejected by Joi, stale fixture, gate itself is working), `test/yield-csv.spec.ts` (expects 2965.157, gets 2965.159: rounding/conversion-factor mismatch in F13 yield normalisation) |
| mobile lint / typecheck / `npm test` | PASS (30/30). No production build run (Expo native build not performed; android/ is generated and git-ignored) |
| services/platform-api lint/test | NOT RUN: no Python venv; host is Python 3.14, images target 3.12; ruff/pytest not installed. CI job covers these. `pip-audit` on requirements: clean |
| services/geospatial-ai | `pip-audit`: clean. Tests not run |
| npm audit --omit=dev | web 0, api 0, mobile 22 (7 moderate, 15 high) |
| Migrations, empty DB (qa4-pg, postgis 17-3.5) | PASS: all 44 migrations applied; second run "No migrations are pending" (re-runnable). Container removed |

## Blockers

B1. services/api does not compile (`src/domain/yield/yield-import.service.ts:43,48`). `nest build` fails, so the API Docker image (`services/api/Dockerfile` runs `npm run build`), the worker image and the PR `api` CI job (lint, typecheck) cannot succeed. A stale `dist/` exists from an earlier build and masks this locally; do not ship it. Fix: drop the generic and cast the result (`(await runner.query(...)) as Array<{y:string}>`). Also fix the F13 rounding test and run `eslint --fix`.

B2. Credentials committed in git history and pushed to `origin` (github.com/Ansar4946/fasalguard-ai). `services/api/.env.example` contained a filled-in SMTP app password and a Gemini API key; they are still retrievable in 6 commits (e.g. 5a819738, deac9cb7, bafe04a4, fd945c4c, 70a8aa8c, 0a08095d; `SMTP_PASSWORD` in 5a819738, `GEMINI_API_KEY` in all six). The current tree is clean (the working-tree file no longer holds them), but history is not. Required: confirm both credentials are revoked/rotated (docs/AUTH_SECURITY_AUDIT.md P0 asked for this; there is no evidence it was done), then purge history (git filter-repo/BFG) or treat as burned and make the remote private. Values deliberately not reproduced here.

## Major

M1. No security headers on the web app. `next.config.ts` defines none and `proxy.ts` sets none: no CSP, HSTS, X-Frame-Options, X-Content-Type-Options, Referrer-Policy, Permissions-Policy. The API sets a strict set (`services/api/src/common/middleware/security.middleware.ts`), so only the user-facing surface is exposed. Add `headers()` in next.config or in proxy.

M2. Rate limiting is in-process memory. `ThrottlerModule` (app.module.ts:91) uses default storage, no Redis store; only 22 `@Throttle` uses. With more than one API replica, or restarts, limits are per-instance. Also no `trust proxy` setting found in `services/api/src` or `configure-app.ts`, so behind a load balancer all clients may share the proxy IP (lockout/DoS of login, OTP, PIN throttles) or X-Forwarded-For is not honoured. Verify and set `app.set('trust proxy', ...)` plus Redis storage.

M3. CI does not enforce what it claims. PR `web` job lints only a hand-picked file list (pull-request.yml:107) because full lint fails; no mobile job at all (lint/typecheck/test/audit); API job will fail on B1. Fix the 77 lint errors (add `.cjs` override for `no-require-imports` in eslint.config.mjs) and run full lint plus a mobile job. `npm audit` gates exist for web/api (high/moderate) but not mobile.

M4. Mobile dependency audit: 15 high in `expo`, `react-native`, metro, `@expo/cli`, `node-forge`, `braces`, `micromatch`. npm's suggested "fixes" are nonsensical downgrades (expo 44), so these are probably tooling/advisory-range artefacts, not runtime-reachable, but nobody has triaged them. `THIRD_PARTY_NOTICES.md` already states native release is blocked pending dependency remediation. Triage and record accepted risk, or bump when patched Expo SDK lands.

M5. Licence matrix incomplete. Shipped web deps `react-leaflet` and `@react-leaflet/core` are Hippocratic-2.1 (ethical-source licence with use restrictions, not OSI-approved; needs legal sign-off for a commercial product or replacement). `sharp`/libvips (LGPL-3.0-or-later component, api image) and `caniuse-lite` (CC-BY-4.0, build-time) are not in `THIRD_PARTY_NOTICES.md`; the file also lacks Leaflet/OSM tile attribution, Python dependency licences (rasterio, shapely, pandas, matplotlib, Pillow, onnxruntime, pyfao56, pyWaPOR) and mobile notices (explicitly pending). Web runtime image also copies full `node_modules` including dev dependencies (Dockerfile.web), which enlarges shipped licence and vulnerability surface; prune with `npm prune --omit=dev` in the runtime stage.

M6. Environment documentation incomplete. `docs/ENVIRONMENT_VARIABLES.md` is an audit narrative (dated 2026-08-17, still describes the secret leak and a failing test as current) and omits about 58 of the 114 Joi-schema variables, including all STRIPE_*, OSS_* , SMTP_PORT/USER/PASSWORD/FROM, USSD_*, AMIS_*, OPEN_METEO_API_KEY, OPENWEATHERMAP_*, ROBOFLOW_* (except some), AZURE_SPEECH_*, WEATHER_PROVIDER, MEDIA_LOCAL_DIR, API_PUBLIC_URL. Also undocumented: `SATELLITE_PLATFORM_ENABLED` (read directly, not in Joi schema), web `PLATFORM_API_URL`, `GEOAPIFY_API_KEY`, `GOOGLE_MAPS_API_KEY`, geospatial-ai `VISION_MODEL_PATH`/`VISION_MODEL_MANIFEST_PATH`/`AMIS_SCRAPER_ENABLED`. `services/api/.env.example` is missing 22 schema vars (RATE_LIMIT_PER_MINUTE, ASSISTANT_*, SPEECH_STT_PROVIDER, ASSEMBLYAI_API_KEY, WEATHER_PROVIDER, OPEN_METEO_API_KEY, ...). Platform-api documents itself in `docs/platform/ENVIRONMENT.md`; not cross-checked line by line.

M7. Production guard gaps (Joi `.custom` in `services/api/src/config/environment.ts`). Good: rejects Swagger, wildcard CORS, short/placeholder JWT, dev OTP, fake assistant/speech/farm-brain, `PUSH_PROVIDER=development`, non-OSS storage, missing SMTP, non-HTTPS provider URLs, `contract-test` USSD, unauthenticated metrics. Missing: `DATABASE_SSL` is not forced true in production (platform-api does enforce `sslmode=verify-full`, the API does not); `REDIS_URL` need not be `rediss://`; Stripe keys/webhook secret not required when billing routes are live (empty defaults mean billing silently misbehaves); `API_PUBLIC_URL` and `WEB_APP_URL` may stay `localhost` defaults in production (affects emailed password-setup links and signed URLs); `INTERNAL_SERVICE_TOKEN` (platform-api hand-off) defaults to empty; `ENFORCE_FIELD_WITHIN_FARM` can be disabled. Also the positive-path production fixture in `security-hardening.spec.ts` is failing, so there is currently no passing test that proves a valid production config boots.

M8. Container hardening inconsistent (`deploy/compose.production.yml`): `api`, `worker`, `ai-service`, `migrate` lack `cap_drop: [ALL]`/`no-new-privileges` (web and platform have them); `worker` and `platform-beat` have no healthcheck; `services/api/Dockerfile` has no HEALTHCHECK/read-only FS; image tags are `${RELEASE_VERSION}`, not digest-pinned (docs say rollback by digest). The development `docker-compose.yml` hard-codes dev passwords and `JWT_ACCESS_SECRET` (acceptable for local, but `OTP_PROVIDER: development`, `FARM_BRAIN_PROVIDER` fake; confirm it is never used for a deployed environment).

## Minor

m1. Web `/api/health` is liveness only; readiness relies on a release smoke test. API has `/api/v1/health` (liveness) and `/api/v1/ready` (DB, PostGIS, Redis, object storage) and `ready` returns dependency details publicly on 503; consider not exposing internal topology to unauthenticated callers.

m2. Migration numbering gap: 1755000034-36 do not exist in `services/api` (index lists 44). Confirm they were intentionally skipped or belong to platform-api; a gap can confuse ordering on other branches. `migration:revert` only reverts the last migration; down paths were not exercised here.

m3. Cookie flags: access/refresh cookies are `httpOnly`, `sameSite=lax`, `secure` only when `NODE_ENV=production` (lib/auth/server-session.ts, proxy.ts); refresh maxAge hard-coded 30 days (known, AUTH_SECURITY_AUDIT P1). `landing-view` cookie has no `secure` flag at all (app/api/growth/landing-view/route.ts:14-15); minor but fix. Repo-root `.next/`, `tsconfig.tsbuildinfo`, three `verify-geocode-*.png` at repo root are stray artefacts (png staged in git; `.dockerignore` excludes them).

m4. Logging: API pino redaction covers authorization, cookie, set-cookie, x-api-key, password/pin/phoneNumber/refreshToken/token/apiKey and `*.secret|privateKey|apiKey`. Gaps: `req.body.otp`/`code`, `req.body.accessToken`, email addresses, `x-internal-service-token` header, FIREBASE/SMTP values in error objects. `res.body.*` paths do nothing in pino-http (no response body logged). Platform-api uses structlog; redaction not verified. `LOG_LEVEL=debug` in production is not blocked.

m5. Lint warnings: `components/fields/boundary-workspace.tsx:50`, `components/onboarding/farm-setup.tsx:126`, `components/pricing/pricing-page.tsx:67,71,74`, `tests/e2e/assistant-live.cjs:34`. Unused eslint-disable directives in `services/api/test/yield.integration-spec.ts:4`.

m6. `services/api/package.json` licence is `UNLICENSED` (fine, private); `pause-stream` has no licence field (transitive, upstream is MIT/Apache dual), `nodemailer` MIT-0.

m7. pip-audit run with `--no-deps` (transitive Python deps not audited; pins in requirements lack hashes). Re-run inside the built images.

m8. Backup and rollback: documented well in `docs/operations/deployment.md` (pre-release RDS backup, PITR, restore drill, image-digest rollback, no automatic `migration:revert`). Gaps: no documented backup/restore for the `media_data`/`platform_media` volumes (local-disk), Redis (BullMQ/Celery job loss), or the OSS bucket versioning; no RPO/RTO figures; no per-migration down-safety notes.

## Verified positives

- `.env`, `mobile/google-services.json`, `mobile/android/` and Firebase/service-account patterns are git-ignored (`.gitignore:35`, `*firebase-adminsdk*.json`, `*service-account*.json`, mobile `.gitignore`); `git ls-files` contains no `.env` (only `*.env.example`), no keys/keystores; `.dockerignore` excludes `.env*`, `.git`, services, mobile. Working-tree scan of 1,106 tracked files found no live-format secrets (AIza/sk_/whsec_/PEM/AKIA/ghp_); the only credential-shaped assignment is a CI test constant (`.github/workflows/pull-request.yml:45` JWT test value, test-only). `deploy/environments/production.env.example` uses `replace-with` placeholders (line 55 is a placeholder).
- Production guards listed in M7 work and are the strongest part of the config; platform-api additionally enforces `verify-full` DB TLS, `rediss://` with cert verification, distinct broker namespaces, JWT >= 48 chars, and blocks offline sync in production.
- CORS is an explicit allowlist with credentials; JSON/URL-encoded body limits configured; global `ValidationPipe` with whitelist/forbidNonWhitelisted; Swagger off by default; metrics need token.
- Migrations: clean from empty DB, idempotent re-run, `typeorm_migrations` tracking, prod migrate service uses separately scoped env file.
- Dependency audits: web and api have zero known production vulnerabilities; Python requirements are exactly pinned and clean.

## Go / no-go checklist

Mark each before deploying. Current state in brackets.

- [ ] API compiles: `nest build`, typecheck, lint, all unit tests green (B1) [FAIL]
- [ ] Leaked SMTP and Gemini credentials revoked and history purged or repo kept private (B2) [OPEN]
- [ ] Web lint clean or `.cjs` rule override added; CI runs full lint plus a mobile job (M3) [FAIL]
- [ ] Web security headers (CSP, HSTS, XFO, nosniff, referrer, permissions) added and checked on the deployed host (M1) [OPEN]
- [ ] Trust-proxy configured and Redis-backed throttler storage in place; login/OTP throttling verified behind the real load balancer (M2) [OPEN]
- [ ] `security-hardening.spec.ts` positive production fixture passes, proving a valid production env boots (M7) [FAIL]
- [ ] Production env file validated: `NODE_ENV=production`, every provider real (no fake/dev), `DATABASE_SSL=true`, `rediss://`, Stripe keys, public URLs not localhost, `INTERNAL_SERVICE_TOKEN` set [UNVERIFIED]
- [ ] Mobile audit triaged and accepted or remediated; mobile native release still blocked per docs (M4) [OPEN]
- [ ] Licence matrix signed off: react-leaflet Hippocratic-2.1 decision, LGPL (libvips), Python and mobile notices added (M5) [OPEN]
- [ ] `docs/ENVIRONMENT_VARIABLES.md` and `services/api/.env.example` updated to match the Joi schema (M6) [OPEN]
- [ ] Container hardening parity (cap_drop, healthchecks, digest pinning) (M8) [OPEN]
- [ ] Python services: ruff + pytest run in the 3.12 image and pip-audit on resolved transitive deps (m7) [NOT RUN]
- [ ] Fresh pre-release RDS backup taken and restore drill within last quarter; media volume and Redis backup/restore plan written (m8) [OPEN]
- [ ] Migrations applied via `migrate` profile on a staging copy of production data; rollback = previous image digests, no automatic revert [empty-DB run PASS]
- [ ] Post-deploy smoke: web `/api/health`, API `/api/v1/ready` 200, platform `/api/v1/ready`, metrics unreachable without token, Swagger 404 [pending]
- [ ] Log sampling in staging confirms no tokens, OTPs, phone numbers or emails in output (m4) [OPEN]

Evidence artefacts: pre-existing audit logs in `docs/releases/production-readiness/`. QA temporary resources (container `qa4-pg`, venv under system temp) were removed or are outside the repo; no application code was modified.

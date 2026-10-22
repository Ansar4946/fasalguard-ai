> Imported historical audit. See [WORKSPACE_REVALIDATION.md](WORKSPACE_REVALIDATION.md) for current paths, verification limits, and corrections.

# Legacy Fasal Guard Project — Read-Only Inventory (Phase B)

| | |
|---|---|
| Date | 2026-10-13 |
| Method | Read-only: `ls`/`find`, `git log`, `git status`, `git diff --stat`, `grep`, `docker inspect`, `docker volume inspect`. **Nothing was started, stopped, removed, renamed, pruned, migrated, or written.** No legacy code or tests were executed. No database contents were read (that would require starting the container). |
| Secrets | `.env` files: **none exist** in either folder. Only `.env.example` templates are present; variable **names** are recorded below. Container environment was read with names extracted and values discarded in the same pipeline, so no value was printed. |
| Import status | Nothing has been imported. Integration requires a separate decision. |

## 1. Locations

| Path | State | Notes |
|---|---|---|
| `C:\Users\Penta Squad\Desktop\AI learning\fasalguard-ai` | **Empty**: 8 directories, **0 files** (last modified 2026-09-30 17:10) | This is the Compose `working_dir` recorded on the legacy containers. Remaining dirs: `services/api/docker/postgres/init`, `services/geospatial-ai/models`. |
| `C:\Users\Penta Squad\Desktop\AI learning\fasalguard-ai-restored` | Full git working copy, 17 MB excluding `.git`/`node_modules` (`.git` 14 MB); `services/api/node_modules` present | Created 2026-09-30 17:22. Appears to be the restored source of the above. |

**Consequence:** the stopped legacy containers bind-mount from the *empty* folder (Postgres init scripts → `/docker-entrypoint-initdb.d`; geospatial-ai models → `/models`). Restarting them as-is would run without those files.

## 2. Git

| Item | Value |
|---|---|
| Remote | `https://github.com/Ansar4946/fasalguard-ai.git` |
| Branch / HEAD | `master` @ `1b7c889dd10fa9e45dc20c626640964d18e86b6c` (2026-09-07, "live amis market rate data into our site") |
| Other branch | `origin/fasalgurard-v1` @ `c5b9ff0` (2026-08-17) |
| Commits | 13 (2026-08-01 → 2026-09-07), single author |
| Working tree | **11 uncommitted changes** (7 modified, 4 untracked): SMS notification work — `notification.{module,processor,service}.ts`, `config/{configuration,environment}.ts`, `migrations/index.ts`, `services/api/.env.example`; new `providers/{development,twilio,sms-notification}-sms.provider.ts`. Diff: 7 files, +58/−12. **Preserved untouched.** |

Commit history (oldest to newest): `e304343` Create Next App → `859573b` responsive frontend and onboarding → `c5b9ff0` "production-ready platform foundation" → `5a81973` "currently add featucres" → `deac9cb` satellite monitoring and location mapping → `fd945c4` "BUILD ERROR" → `0a08095` Stripe and satellite fixes → `70a8aa8`/`bafe04a` live location → `e0ec680` mandi market intelligence → `8a2d16e` data model → `a7ea4a7`/`1b7c889` AMIS ingestion.

## 3. Architecture (from source)

| Layer | Technology | Evidence |
|---|---|---|
| Web | Next.js **16.2.12**, React 19.2, Tailwind 4, Leaflet, zod | `package.json`; `AGENTS.md` warns "This is NOT the Next.js you know" |
| Web BFF | 67 Route Handlers under `app/api/**`; httpOnly cookies `fg_access`/`fg_refresh`; `proxy.ts` (Next 16 middleware) role-gates 19 path prefixes | `lib/auth/server-session.ts`, `proxy.ts` |
| API | **NestJS 11** + TypeORM 0.3 + BullMQ/ioredis + nestjs-pino + throttler + swagger; Prisma used only for `db pull`/studio | `services/api/package.json` |
| DB | PostgreSQL 17 + PostGIS 3.5 (`postgis/postgis:17-3.5-alpine`); **36 TypeORM migrations** | `infrastructure/database/migrations/` |
| Python service | `services/geospatial-ai` (FastAPI): AMIS HTML scraper, image-quality metrics, ONNX vision inference | `app/main.py`, `app/amis_scraper.py` |
| Deployment | `docker-compose.yml` (postgres, redis, media-init, api, worker, geospatial-ai, migrate); `deploy/compose.production.yml` (api, worker, ai-service, migrate); GitHub workflows `pull-request.yml`, `production-artifacts.yml` | |
| Tests | API: **50 unit + 12 integration** spec files; geospatial-ai: 2 pytest files | `services/api/test/`, `services/geospatial-ai/tests/` (not executed in this audit) |

API domain modules (25): ai-ops, assistant, auth, billing, crop-scans, crops, digital-twin, expert-review, farm-brain, farms, follow-up, geospatial, growth, identity, impact, knowledge, market, media, notifications, outbreaks, reports, risk, satellite, severity, sync, weather. Web: 54 pages incl. farmer, expert, government, admin, auth/onboarding route groups.

**This is a different stack from the Phase C target** (FastAPI backend). Any integration needs an explicit decision.

## 4. Feature implementation (static reading only; nothing executed)

| Area | Implementation found | Real vs fake | Notes |
|---|---|---|---|
| Auth | Email/phone identifier login → JWT access (15 min) + rotating refresh with reuse detection; argon2id hashing at registration; device and session tables; RBAC roles | **Login performs no secret verification.** `LoginDto` = `{identifier, device}`; `AuthService.login()` never calls `argon2.verify` (removed in `5a81973`, present in `c5b9ff0`). The credential email says "*Sign in anytime with your email or phone number … No password is needed.*" | **Critical**: anyone who knows a farmer's phone or email can sign in as them. OTP providers exist (development = fixed `000000`; production provider exists) but are not wired into login. Production config rejects `OTP_PROVIDER=development`. |
| Crop disease (F01) | `crop-scans` with Roboflow serverless (`wheat-disease-detection-zsn0p` v1) and self-hosted ONNX via geospatial-ai | Real external API call (Roboflow); self-hosted path real code but **no model files** (`models/` holds only README) | Vision min-confidence and expert-review thresholds are configurable. |
| Satellite (F02) | Sentinel Hub Process API evalscripts (EVI, NDVI, NDMI-like B08/B11, SCL layer), automatic monitoring processor | Real provider; requires `SENTINEL_HUB_CLIENT_ID/SECRET` | Fetches SCL. Sentinel Hub returns reflectance, which avoids OpenFarm's DN issue. Not numerically verified here. |
| Weather (F04) | Open-Meteo (default) / OpenWeatherMap providers; weather-rules engine; weather-alert service with min interval | Real providers | Has weather alert rules, which OpenFarm lacks. |
| Market (F07) | AMIS (Pakistan, amis.pk) HTML scraper in Python plus NestJS provider/parser; market scheduler | Real scraping; **disabled by default** (`AMIS_SYNC_ENABLED=false`, "*Confirm source permission and terms before enabling*") | The only Pakistani mandi source found anywhere in this audit. Legal and terms review required. |
| Assistant / speech (F08/F10) | Qwen (Alibaba DashScope) assistant, STT and TTS; **`fake` providers are the defaults** | Fake replies labelled `provider: 'FAKE'`, `modelId: 'fake-assistant'` | Production validator does **not** reject `ASSISTANT_PROVIDER=fake` or `SPEECH_PROVIDER=fake` (it does reject fake farm-brain). |
| Farm brain | Gemini (google-ai or Vertex) / fake | Production requires Gemini | |
| Notifications (F12) | FCM push and dev push; SMS (Twilio and dev) in **uncommitted WIP** | Real FCM code; Twilio is new work | |
| Billing | Stripe (`PAYMENT_NOT_CONFIGURED` 503 when unset, "never a faked success") | Real | |
| Storage | `mock` (default) / `local-disk` / Alibaba OSS | Production requires private Alibaba OSS | |
| Offline sync | `sync` module with integration tests | — | |

## 5. Docker resources (inspected, untouched)

All labelled `com.docker.compose.project=fasalguard`, compose v5.5.1, created 2026-09-14 ~12:58Z.

| Container | Image | State (finished at) | Host ports | Mounts | Env var names (values not read) |
|---|---|---|---|---|---|
| fasalguard-api-1 | fasalguard-api (504 MB) | exited 143 (2026-10-01 07:20Z) | **0.0.0.0:4000** | vol `fasalguard_media_data` → `/data/media` | ACCESS_TOKEN_TTL_SECONDS, AMIS_*, API_PUBLIC_URL, CORS_ORIGINS, DATABASE_SSL, DATABASE_URL, ENABLE_SWAGGER, ENFORCE_FIELD_WITHIN_FARM, FARM_BRAIN_PROVIDER, GEMINI_API_KEY, GEMINI_MODEL, GEMINI_TRANSPORT, GEOSPATIAL_AI_URL, JWT_ACCESS_SECRET, JWT_AUDIENCE, JWT_ISSUER, LOG_LEVEL, MARKET_CACHE_TTL_SECONDS, MEDIA_LOCAL_DIR, NODE_ENV, OBJECT_STORAGE_PROVIDER, OPENWEATHERMAP_API_KEY, OPENWEATHERMAP_BASE_URL, OPEN_METEO_BASE_URL, OTP_PROVIDER, PASSWORD_SETUP_TTL_MINUTES, PORT, PROCESS_ROLE, QWEN_API_KEY, QWEN_BASE_URL, QWEN_MODEL, REDIS_URL, REFRESH_TOKEN_TTL_DAYS, ROBOFLOW_* (API_KEY, BASE_URL, MODEL_*, RICE_*, WHEAT_*), SATELLITE_*, SELF_HOSTED_VISION_URL, SENTINEL_HUB_AUTH_URL, SENTINEL_HUB_BASE_URL, SENTINEL_HUB_CLIENT_ID, SENTINEL_HUB_CLIENT_SECRET, SMTP_FROM, SMTP_HOST, SMTP_PASSWORD, SMTP_PORT, SMTP_USER, STRIPE_PUBLISHABLE_KEY, STRIPE_SECRET_KEY, STRIPE_WEBHOOK_SECRET, VISION_*, WEATHER_ALERT_MIN_INTERVAL_HOURS, WEATHER_CACHE_TTL_SECONDS, WEATHER_PROVIDER, WEB_APP_URL |
| fasalguard-worker-1 | fasalguard-worker (504 MB) | exited 143 (2026-10-01 07:20Z) | — | vol `fasalguard_media_data` | same set as api |
| fasalguard-migrate-1 | fasalguard-migrate (504 MB) | exited 0 (2026-09-30 12:11Z) | — | — | DATABASE_SSL, DATABASE_URL, NODE_ENV, PROCESS_ROLE |
| fasalguard-geospatial-ai-1 | fasalguard-geospatial-ai (660 MB) | exited 0 (2026-10-01 07:20Z) | **0.0.0.0:8000** | **bind** `…\fasalguard-ai\services\geospatial-ai\models` (now empty) → `/models` | AMIS_BASE_URL, AMIS_REQUEST_DELAY_SECONDS, AMIS_SCRAPER_ENABLED, AMIS_TIMEOUT_SECONDS, VISION_MODEL_MANIFEST_PATH, VISION_MODEL_PATH |
| fasalguard-postgres-1 | postgis/postgis:17-3.5-alpine (729 MB) | exited 0 (2026-10-01 07:20Z) | **0.0.0.0:5432** | vol `fasalguard_postgres_data`; **bind** `…\fasalguard-ai\services\api\docker\postgres\init` (now empty) | POSTGRES_DB, POSTGRES_PASSWORD, POSTGRES_USER |
| fasalguard-redis-1 | redis:7.4-alpine | exited 0 | **0.0.0.0:6379** | vol `fasalguard_redis_data` | — |
| fasalguard-media-init-1 | node:22-alpine | exited 0 (2026-09-30 12:10Z) | — | vol `fasalguard_media_data` | — |

| Volume | Created | Size | Note |
|---|---|---|---|
| `fasalguard_postgres_data` | 2026-09-14 12:58Z | **77.77 MB** | **May contain real user PII** (emails, phones, farm boundaries). Not read. Treat as sensitive; back up before any decision. |
| `fasalguard_redis_data` | same | 202.6 kB | |
| `fasalguard_media_data` | same | 0 B | |
| Network `fasalguard_default` | — | — | |

**Conflict risk:** if the legacy stack is restarted while `fasalguard-phaseb` is running, host ports **5432, 6379 and 8000** collide. Phase B binds them on 127.0.0.1; the legacy stack binds 0.0.0.0. Port 4000 doesn't collide.

## 6. Configuration variable names (from `.env.example`, no values)

- **Root (web):** FASALGUARD_API_URL, WEB_APP_URL, GOOGLE_MAPS_API_KEY, GEOAPIFY_API_KEY, PASSWORD_SETUP_TTL_MINUTES, SMTP_HOST, SMTP_PORT, SMTP_USER, SMTP_PASSWORD, SMTP_FROM, AMIS_SYNC_ENABLED, VISION_PROVIDER, ROBOFLOW_BASE_URL, ROBOFLOW_API_KEY, ROBOFLOW_WHEAT_MODEL_{ID,VERSION,TASK}, ROBOFLOW_RICE_MODEL_{ID,VERSION,TASK}
- **`services/api`:** NODE_ENV, PROCESS_ROLE, PORT, DATABASE_URL, DATABASE_SSL, REDIS_URL, LOG_LEVEL, METRICS_ENABLED, METRICS_TOKEN, SENTRY_DSN, SENTRY_ENVIRONMENT, ENABLE_SWAGGER, CORS_ORIGINS, MAX_REQUEST_BODY_BYTES, SIGNED_URL_TTL_SECONDS, ENFORCE_FIELD_WITHIN_FARM, JWT_ACCESS_SECRET, JWT_ISSUER, JWT_AUDIENCE, ACCESS_TOKEN_TTL_SECONDS, REFRESH_TOKEN_TTL_DAYS, OTP_PROVIDER, WEB_APP_URL, PASSWORD_SETUP_TTL_MINUTES, SMTP_*, OBJECT_STORAGE_PROVIDER, OSS_REGION, OSS_BUCKET, OSS_ACCESS_KEY_ID, OSS_ACCESS_KEY_SECRET, STRIPE_SECRET_KEY, STRIPE_WEBHOOK_SECRET, STRIPE_PUBLISHABLE_KEY, SENTINEL_HUB_CLIENT_ID, SENTINEL_HUB_CLIENT_SECRET, SENTINEL_HUB_BASE_URL, OPEN_METEO_BASE_URL, WEATHER_CACHE_TTL_SECONDS, WEATHER_ALERT_MIN_INTERVAL_HOURS, VISION_PROVIDER, SELF_HOSTED_VISION_URL, ROBOFLOW_*, VISION_MINIMUM_CONFIDENCE, VISION_EXPERT_REVIEW_BELOW, QWEN_BASE_URL, QWEN_API_KEY, QWEN_MODEL, PUSH_PROVIDER, FIREBASE_SERVICE_ACCOUNT_BASE64, PUSH_TOKEN_STALE_DAYS, SMS_ENABLED, SMS_PROVIDER, SMS_ACCOUNT_SID, SMS_AUTH_TOKEN, SMS_FROM, ASSISTANT_PROVIDER, SPEECH_PROVIDER, QWEN_STT_MODEL, QWEN_TTS_MODEL, FARM_BRAIN_PROVIDER, GEMINI_TRANSPORT, GEMINI_API_KEY, GEMINI_MODEL, GEMINI_TIMEOUT_MS, GOOGLE_CLOUD_PROJECT, GOOGLE_CLOUD_LOCATION, GOOGLE_ACCESS_TOKEN, SATELLITE_MAX_CLOUD_COVERAGE, SATELLITE_MIN_VALID_PIXEL_PERCENTAGE, GEOSPATIAL_AI_URL, AMIS_SYNC_ENABLED, AMIS_SCRAPE_TIMEOUT_MS, MARKET_CACHE_TTL_SECONDS, AMIS_SCRAPER_ENABLED, AMIS_BASE_URL, AMIS_TIMEOUT_SECONDS, AMIS_REQUEST_DELAY_SECONDS, SATELLITE_MONITORING_INTERVAL_HOURS, SATELLITE_PROVIDER_REQUESTS_PER_MINUTE

## 7. Findings that matter for the integration decision

| # | Severity | Finding |
|---|---|---|
| L1 | **Critical** | Identifier-only login (no password, no OTP) since `5a81973`. A product decision per the email copy, but an authentication bypass. Must be closed before any real farmer data is used. |
| L2 | High | The 77.8 MB Postgres volume may hold real personal data, and the restart path depends on an empty folder. Back up the volume (owner action) before any cleanup decision. |
| L3 | High | `fake` assistant/speech providers are allowed in production config. |
| L4 | Medium | Legacy containers publish DB/Redis/API on all interfaces (`0.0.0.0`). |
| L5 | Medium | 11 uncommitted files (SMS/Twilio). Risk of loss if the folder is replaced; commit or back up. |
| L6 | Positive | Contains the only Pakistani mandi source (AMIS), weather alert rules, a refresh-token rotation design with reuse detection, Sentinel Hub with SCL, a substantial test suite (62 specs), and Urdu-relevant product scope. |
| L7 | Decision needed | Stack (NestJS + Next 16) differs from the Phase C target (FastAPI + Next 14, OpenFarm base). Choosing which base to carry forward is the key Phase C decision; see `PHASE_B_BLOCKERS.md`. |

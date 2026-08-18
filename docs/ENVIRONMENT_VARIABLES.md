# Environment Variables Audit

Audited: 2026-08-17. Sources read: root `.env.example`, `services/api/.env.example`, `deploy/environments/{development,staging,production}.env.example`, `services/api/src/config/configuration.ts`, `services/api/src/config/environment.ts`.

## Critical finding first

**`services/api/.env.example` contains real-looking, non-placeholder secrets** (a Gmail SMTP app password and a Gemini API key), already committed and pushed to the GitHub remote. Full detail and remediation steps in `docs/AUTH_SECURITY_AUDIT.md` (Finding P0) — rotate both credentials before anything else in this list matters.

**No `NEXT_PUBLIC_` secret leak found.** Repo-wide search for `NEXT_PUBLIC_` only matches a warning comment in `.env.example` and guidance text in `SECURITY.md` — no actual `NEXT_PUBLIC_` variable exists in code. The Next.js app only reads server-side `FASALGUARD_API_URL` and `NODE_ENV` (`lib/auth/server-session.ts`, `proxy.ts`), both explicitly commented "Do not prefix with NEXT_PUBLIC".

## Validation approach

- `services/api/src/config/environment.ts` defines a **Joi schema** validating every backend env var with type/format/range constraints and defaults for optional ones. `DATABASE_URL`, `REDIS_URL`, and `JWT_ACCESS_SECRET` (min 32 chars) are `Joi.required()` — **the app fails to boot without them**, no silent default.
- A `.custom()` validator adds **production-only hardening** that rejects unsafe config at startup: Swagger must be off, `METRICS_TOKEN` required if metrics enabled, Sentry DSN must be authenticated HTTPS, CORS must be an explicit allowlist (no `*`), JWT secret must be ≥48 chars and not contain `replace-with`, provider base URLs must be credential-free HTTPS, Alibaba OSS must be fully configured, `OTP_PROVIDER` must be `production`, SMTP host/from required, and the selected AI/push/vision providers must have credentials present. This is a genuinely strong fail-fast gate — verified in this pass that the one failing backend test (`security-hardening.spec.ts`) fails because its fixture is *missing* required SMTP fields, i.e. the gate is working correctly, the test fixture is stale.
- `services/api/src/config/configuration.ts` maps `process.env` → typed config, with `?? ''`/default fallbacks that are safe only because Joi validates upstream first.
- **The root Next.js app has no equivalent validation** — `FASALGUARD_API_URL`/`WEB_APP_URL` are read directly with an inline `?? 'http://localhost:4000/api/v1'` fallback and no fail-fast if misconfigured. Low risk today since the only var involved is a base URL, not a secret, but worth adding if the frontend ever gains more server-side config.

## Variable classification

| Variable | Classification | Required? | Where used |
|---|---|---|---|
| `NODE_ENV` | SERVER_ONLY / BUILD_TIME | Optional (default `development`) | `environment.ts`, Dockerfile |
| `PORT` | SERVER_ONLY / RUNTIME | Optional (default 4000) | `environment.ts`, docker-compose |
| `PROCESS_ROLE` | SERVER_ONLY / RUNTIME | Optional (default `all`) | `environment.ts`, `execution-role.ts` — gates worker/scheduler wiring |
| `DATABASE_URL` | SERVER_ONLY / RUNTIME (secret) | **Required** | Joi required; `configuration.ts` |
| `DATABASE_SSL` | SERVER_ONLY / RUNTIME | Optional (default false) | `environment.ts` |
| `REDIS_URL` | SERVER_ONLY / RUNTIME (secret) | **Required** | Joi required; cache, BullMQ, rate limiter |
| `LOG_LEVEL` | SERVER_ONLY / RUNTIME | Optional (default info) | Pino logger |
| `METRICS_ENABLED` | SERVER_ONLY / RUNTIME | Optional (default true) | Requires `METRICS_TOKEN` in prod if true |
| `METRICS_TOKEN` | SERVER_ONLY / RUNTIME (secret) | **Required in prod if metrics enabled** | Bearer auth on `/metrics` |
| `SENTRY_DSN` | SERVER_ONLY / RUNTIME (secret) | Optional; must be authenticated HTTPS in prod | Error tracking |
| `SENTRY_ENVIRONMENT` | SERVER_ONLY / RUNTIME | Optional | |
| `ENABLE_SWAGGER` | SERVER_ONLY / RUNTIME | Optional; **must be false in prod** | |
| `CORS_ORIGINS` | SERVER_ONLY / RUNTIME | Optional; **must be explicit, no `*`, in prod** | |
| `MAX_REQUEST_BODY_BYTES` | SERVER_ONLY / RUNTIME | Optional (default 262144) | |
| `SIGNED_URL_TTL_SECONDS` | SERVER_ONLY / RUNTIME | Optional (default 300) | |
| `ENFORCE_FIELD_WITHIN_FARM` | SERVER_ONLY / RUNTIME | Optional (default true) | PostGIS containment check |
| `JWT_ACCESS_SECRET` | SERVER_ONLY / RUNTIME (secret) | **Required**, ≥32 chars (≥48 + non-default in prod) | |
| `JWT_ISSUER` / `JWT_AUDIENCE` | SERVER_ONLY / RUNTIME | Optional | |
| `ACCESS_TOKEN_TTL_SECONDS` / `REFRESH_TOKEN_TTL_DAYS` | SERVER_ONLY / RUNTIME | Optional | See `docs/AUTH_SECURITY_AUDIT.md` P1 re: frontend hardcoding |
| `OTP_PROVIDER` | SERVER_ONLY / RUNTIME | Optional; **must be `production` in prod** | No endpoint currently exposes OTP |
| `WEB_APP_URL` | SERVER_ONLY / RUNTIME | Optional | Duplicated between root and API `.env.example` — keep in sync manually |
| `PASSWORD_SETUP_TTL_MINUTES` | SERVER_ONLY / RUNTIME | Optional | |
| `SMTP_HOST` / `PORT` / `USER` / `PASSWORD` / `FROM` | SERVER_ONLY / RUNTIME (secret) | Optional in schema, **required in prod** | **Leaked real values in `services/api/.env.example` — rotate** |
| `OBJECT_STORAGE_PROVIDER` | SERVER_ONLY / RUNTIME | Optional (default `mock`); must be `alibaba` + fully configured in prod | Blocked from prod use by `media.module.ts` if left as mock |
| `OSS_REGION` / `BUCKET` / `ACCESS_KEY_ID` / `ACCESS_KEY_SECRET` | SERVER_ONLY / RUNTIME (secret) | Required in prod if `OBJECT_STORAGE_PROVIDER=alibaba` | **Blank everywhere — TODO before staging/prod** |
| `SENTINEL_HUB_CLIENT_ID` / `SECRET` | SERVER_ONLY / RUNTIME (secret) | Optional (blank everywhere) | **TODO before staging/prod** — satellite provider |
| `SENTINEL_HUB_BASE_URL` | SERVER_ONLY / RUNTIME | Optional; must be credential-free HTTPS in prod | |
| `SATELLITE_MAX_CLOUD_COVERAGE` / `MIN_VALID_PIXEL_PERCENTAGE` / `MONITORING_INTERVAL_HOURS` / `PROVIDER_REQUESTS_PER_MINUTE` | SERVER_ONLY / RUNTIME | Optional | |
| `GEOSPATIAL_AI_URL` | SERVER_ONLY / RUNTIME | Optional (default localhost:8000) | Checked as an optional dependency in `/ready` |
| `OPEN_METEO_BASE_URL` / `WEATHER_CACHE_TTL_SECONDS` | SERVER_ONLY / RUNTIME | Optional | Open-Meteo is free/keyless — no key var needed, correctly |
| `VISION_PROVIDER`, `ROBOFLOW_API_KEY` | SERVER_ONLY / RUNTIME (secret for key) | Key required in prod only if `VISION_PROVIDER=roboflow` | **Blank everywhere — TODO** |
| `SELF_HOSTED_VISION_URL` | SERVER_ONLY / RUNTIME | Optional | Possibly reused/conflated with `GEOSPATIAL_AI_URL` in some env examples — worth double-checking they're the intended same/different service |
| `VISION_MINIMUM_CONFIDENCE` / `EXPERT_REVIEW_BELOW` | SERVER_ONLY / RUNTIME | Optional | Crop-scan domain thresholds |
| `QWEN_BASE_URL` / `API_KEY` / `MODEL`, `QWEN_STT_MODEL`, `QWEN_TTS_MODEL` | SERVER_ONLY / RUNTIME (secret for key) | Key required in prod if assistant/speech provider = qwen | **Blank everywhere — TODO** |
| `PUSH_PROVIDER`, `FIREBASE_SERVICE_ACCOUNT_BASE64` | SERVER_ONLY / RUNTIME (secret) | Required in prod if `PUSH_PROVIDER=firebase` | **Blank everywhere — TODO**; comment explicitly warns never to expose to clients |
| `PUSH_TOKEN_STALE_DAYS` | SERVER_ONLY / RUNTIME | Optional | |
| `ASSISTANT_PROVIDER` / `SPEECH_PROVIDER` | SERVER_ONLY / RUNTIME | Optional, **defaults to `'fake'`** | See `docs/MOCK_DATA_AUDIT.md` finding #14 — no production guard against staying on `'fake'` |
| `FARM_BRAIN_PROVIDER`, `GEMINI_TRANSPORT`, `GEMINI_API_KEY`, `GEMINI_MODEL`, `GEMINI_TIMEOUT_MS` | SERVER_ONLY / RUNTIME (secret for key) | Prod must use `gemini`; key required if transport=`google-ai`, `GOOGLE_CLOUD_PROJECT` required if `vertex` | **`GEMINI_API_KEY` is the other leaked real-looking secret — rotate** |
| `GOOGLE_CLOUD_PROJECT` / `GOOGLE_CLOUD_LOCATION` | SERVER_ONLY / RUNTIME | Required in prod for vertex transport | Blank in dev/staging examples |
| `GOOGLE_ACCESS_TOKEN` | SERVER_ONLY / RUNTIME (secret) | Optional | Comment: short-lived token for non-GCP staging only; prefer workload identity on Vertex |
| `FASALGUARD_API_URL` (root `.env.example`) | SERVER_ONLY / RUNTIME | Optional (default localhost:4000) | `proxy.ts`, `lib/auth/server-session.ts` — explicitly commented not to prefix with `NEXT_PUBLIC_` |

## Coverage of the categories AGENTS.md calls out specifically

| Category | Status |
|---|---|
| `DATABASE_URL` | Present, required, Joi-validated |
| `REDIS_URL` | Present, required, Joi-validated |
| `SESSION_SECRET`/`JWT_SECRET` | `JWT_ACCESS_SECRET` present, required, strength-checked in prod. No separate refresh-token secret — refresh tokens are random values, SHA-256-hashed at rest, not JWTs |
| `GEMINI_API_KEY`/Google credentials | Present, but the example value is a **leaked-looking real key** — rotate |
| Weather API key | Not needed — Open-Meteo is free/keyless, correctly implemented with no key var |
| Satellite credentials | Present (`SENTINEL_HUB_CLIENT_ID`/`SECRET`), blank everywhere — TODO before staging/prod |
| Email credentials | Present, but example values are **real leaked Gmail credentials** and `SMTP_HOST` is misconfigured (holds an email address, not a hostname) — rotate and fix |
| Storage credentials | Present (`OSS_*`), blank everywhere — TODO; production Joi rule enforces all four before startup |
| Payment credentials | **None found anywhere** — no Stripe/PayPal/gateway vars, config, or code. The platform currently has no payment integration despite `subscriptions`/`subscription_payments` DB tables existing (schema only, unused) |

## Duplication note

`WEB_APP_URL`, `PASSWORD_SETUP_TTL_MINUTES`, and `SMTP_*` are independently defined in both the root `.env.example` (Next.js) and `services/api/.env.example` (NestJS) — two copies that must be kept in sync manually. Consider single-sourcing if this becomes error-prone.

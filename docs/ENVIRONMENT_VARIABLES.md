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
| `SPEECH_PROVIDER` | SERVER_ONLY / RUNTIME | Optional, **defaults to `'fake'`** | See `docs/MOCK_DATA_AUDIT.md` finding #14 — no production guard against staying on `'fake'` |
| `ASSISTANT_PROVIDER` | SERVER_ONLY / RUNTIME | `fake` (default), `qwen` or `gemini`. **Production rejects `fake`** and requires `QWEN_API_KEY` or `GEMINI_API_KEY` for the selected provider (F10). | Gemini keys come from Google AI Studio and are sent in a request header, never in a URL. |
| `SPEECH_STT_PROVIDER` | SERVER_ONLY / RUNTIME | Optional: empty (follow `SPEECH_PROVIDER`) or `assemblyai`. Selects speech-to-text independently; text-to-speech still follows `SPEECH_PROVIDER`. Production requires `ASSEMBLYAI_API_KEY` when set to `assemblyai`. | Voice |
| `ASSEMBLYAI_API_KEY` | SERVER_ONLY / SECRET | Required when `SPEECH_STT_PROVIDER=assemblyai`. Sent only in an `authorization` header; never logged or returned. | Voice |
| `EXPO_GOOGLE_SERVICES_FILE` | BUILD_TIME (mobile) | Optional path to the Firebase `google-services.json` for the Android app (`pk.fasalguard.mobile`). Without it the app builds and reports that push is not configured. | F12 |
| `RATE_LIMIT_PER_MINUTE` | SERVER_ONLY / RUNTIME | Optional, default `120` (30–10000). Global per-IP request limit. Raise it only for isolated test stacks or after considering shared carrier IPs. | F12 |
| `PUSH_PROVIDER` | SERVER_ONLY / RUNTIME | `development` (default) or `firebase`. **Production rejects `development`**, which reports unsent messages as `SENT`, and requires `FIREBASE_SERVICE_ACCOUNT_BASE64` for `firebase`. | F12 |
| `ASSISTANT_TIMEOUT_MS` | SERVER_ONLY / RUNTIME | Optional, default `20000` (2000–60000). Total deadline per assistant provider call, including its single transient retry. | F10 |
| `ASSISTANT_MAX_CONTEXT_MESSAGES` | SERVER_ONLY / RUNTIME | Optional, default `10` (0–20). Prior messages sent to the provider. | F10 |
| `ASSISTANT_RETRIEVAL_LIMIT` | SERVER_ONLY / RUNTIME | Optional, default `4` (1–8). Approved knowledge articles retrieved per question. | F10 |
| `DAWAI_CHECK_ENABLED` | SERVER_ONLY / RUNTIME | Optional, default `false`. When not `true` the `/v1/pesticide-checks*` and `/v1/pesticide-products` routes do not exist (404) and the app boots as before. Requires migration `1755000047000` and `npm run seed:pesticide` before enabling. | Dawai Check |
| `LABEL_READER_PROVIDER` | SERVER_ONLY / RUNTIME | `tesseract` (default, local OCR, bundled `assets/tessdata/eng.traineddata`, nothing downloaded at runtime), `openai-compatible` (hosted vision; falls back to tesseract on any failure), `fake` (tests only; refused in production). | Dawai Check |
| `LABEL_OCR_LANGS` | SERVER_ONLY / RUNTIME | Optional, default `eng`. `eng+urd` is used only if `urd.traineddata` exists in `assets/tessdata`; otherwise it silently stays `eng`. | Dawai Check |
| `LABEL_VISION_BASE_URL`, `LABEL_VISION_API_KEY`, `LABEL_VISION_MODEL` | SERVER_ONLY / RUNTIME (secret for key) | Only for `LABEL_READER_PROVIDER=openai-compatible`. Base URL ends before `/chat/completions` (e.g. `https://host/v1`). In production all three are required when Dawai Check is enabled with that provider. The label photo is sent to that service; leave blank to keep photos on our server. | Dawai Check |
| `NEXT_PUBLIC_DAWAI_CHECK_ENABLED` | BUILD_TIME (web) | `true` shows the Dawai Check entry in the web app. Inlined at `next build`; a change needs a rebuild. Documentation here only; read by the web app. Set together with `DAWAI_CHECK_ENABLED` on the API. | Dawai Check |
| `NEXT_PUBLIC_VOICE_ASSISTANT_ENABLED` | BUILD_TIME (web) | `true` shows the voice-assistant controls in the web app. Inlined at `next build`; a change needs a rebuild. Documentation here only; read by the web app. | Voice assistant |
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

## Complete Joi-schema coverage (added by the cross-cutting hardening pass)

Generated by diffing every key in `services/api/src/config/environment.ts` against this document. Variables below were previously undocumented by exact name (some were only covered in grouped rows above). No real values are given here or in `services/api/.env.example`; the earlier leaked credentials must stay rotated and are not reproduced.

| Variable | Default | Production rule / notes |
|---|---|---|
| `ALLOW_PLAINTEXT_DATABASE` | `false` | Documented override. Production otherwise requires `DATABASE_SSL=true`. Only for private-network databases that cannot terminate TLS. |
| `TRUST_PROXY` | `false` | `false`, or the number of reverse-proxy hops in front of the API (Express `trust proxy`). Only when set is `X-Forwarded-For` used for `req.ip`. `true` (trust every hop) is accepted outside production only because it lets a client spoof its IP. |
| `INTERNAL_SERVICE_TOKEN` | empty | Service-to-service secret. Production requires 32+ characters. Consumed by platform-api; the core API validates its presence. |
| `RATE_LIMIT_PER_MINUTE` | `120` (30-10000) | Global bucket per authenticated user id, or per client IP when anonymous. See rate limiting below. |
| `SMTP_PORT` / `SMTP_USER` / `SMTP_PASSWORD` / `SMTP_FROM` | 587 / empty | `SMTP_HOST` and `SMTP_FROM` required in production. `SMTP_PASSWORD` is a secret. |
| `OSS_BUCKET` / `OSS_ACCESS_KEY_ID` / `OSS_ACCESS_KEY_SECRET` | empty | Required in production (with `OSS_REGION`). Access key secret is a secret. |
| `MEDIA_LOCAL_DIR` | `/data/media` | Used by `OBJECT_STORAGE_PROVIDER=local-disk`. |
| `API_PUBLIC_URL` | `http://localhost:4000/api/v1` | Production: public `https` URL, not localhost. |
| `WEB_APP_URL` | `http://localhost:3000` | Production: public `https` URL, not localhost/127.0.0.1. Also validated for `CORS_ORIGINS`, which must not contain localhost. |
| `STRIPE_SECRET_KEY` / `STRIPE_WEBHOOK_SECRET` / `STRIPE_PUBLISHABLE_KEY` | empty | Secrets. Billing is treated as enabled when any is set; production then requires all three. Note: the earlier statement that no payment integration exists is out of date; `domain/billing/stripe.service.ts` uses these. |
| `SENTINEL_HUB_CLIENT_SECRET` / `SENTINEL_HUB_AUTH_URL` | empty / Sentinel Hub token URL | Secret / OAuth token endpoint. |
| `SATELLITE_MIN_VALID_PIXEL_PERCENTAGE` | 20 (1-100) | |
| `SATELLITE_MONITORING_INTERVAL_HOURS` | 8 (6-12) | |
| `SATELLITE_PROVIDER_REQUESTS_PER_MINUTE` | 30 (1-300) | |
| `AMIS_SYNC_ENABLED` | `false` | Enable only with permission to automate AMIS access. |
| `AMIS_SCRAPE_TIMEOUT_MS` / `AMIS_TIMEOUT_SECONDS` / `AMIS_REQUEST_DELAY_SECONDS` / `AMIS_BASE_URL` | 120000 / 30 / 1 / `http://www.amis.pk` | |
| `MARKET_CACHE_TTL_SECONDS` / `MARKET_MAX_AGE_DAYS` | 3600 / 1 | |
| `WEATHER_PROVIDER` | `open-meteo` | `open-meteo` or `openweathermap`. |
| `OPEN_METEO_API_KEY` | empty | Secret. Production Open-Meteo requires this key and the `customer-api.open-meteo.com` endpoint (the earlier "keyless, no key var" note applies to development only). |
| `OPENWEATHERMAP_BASE_URL` / `OPENWEATHERMAP_API_KEY` | OWM URL / empty | Key (secret) required in production when `WEATHER_PROVIDER=openweathermap`. |
| `WEATHER_ALERT_MIN_INTERVAL_HOURS` | 12 (1-72) | |
| `ROBOFLOW_BASE_URL`, `ROBOFLOW_MODEL_ID`, `ROBOFLOW_MODEL_VERSION`, `ROBOFLOW_MODEL_TASK` | Roboflow URL / empty / empty / `classification` | |
| `ROBOFLOW_WHEAT_MODEL_ID` / `_VERSION` / `_TASK`, `ROBOFLOW_RICE_MODEL_ID` / `_VERSION` / `_TASK` | empty / empty / `classification` | Per-crop model overrides. |
| `VISION_EXPERT_REVIEW_BELOW` | 0.85 | |
| `QWEN_MODEL` | `qwen-plus` | |
| `AZURE_SPEECH_KEY` / `AZURE_SPEECH_REGION` | empty | Key is a secret; both required in production when `SPEECH_PROVIDER=azure`. |
| `SPEECH_PROVIDER_TIMEOUT_MS` | 20000 (5000-30000) | |
| `GEMINI_INPUT_PRICE_PER_MILLION_TOKENS` / `GEMINI_OUTPUT_PRICE_PER_MILLION_TOKENS` | unset | Optional; cost estimation is off unless both are configured. |
| `USSD_ENABLED` / `USSD_DEMO_ENABLED` / `USSD_GATEWAY` | `false` / `false` / `contract-test` | Production rejects `contract-test` when USSD is enabled. |
| `USSD_CALLBACK_SECRET` | empty | Secret; 32+ characters required in production when USSD is enabled. |
| `USSD_SESSION_TTL_SECONDS` / `USSD_PIN_MAX_ATTEMPTS` / `USSD_PIN_LOCK_SECONDS` / `USSD_MAX_AMOUNT_MINOR` | 300 / 5 / 900 / 100000000 | |

### Production guards added in `environment.ts`

Production startup now also rejects: `DATABASE_SSL` not `true` (unless `ALLOW_PLAINTEXT_DATABASE=true`), a `REDIS_URL` that is not `rediss://`, missing or short (<32) `INTERNAL_SERVICE_TOKEN`, partial Stripe configuration, `WEB_APP_URL` / `API_PUBLIC_URL` that are localhost, 127.0.0.1, 0.0.0.0, `[::1]` or not `https`, localhost entries in `CORS_ORIGINS`, and `TRUST_PROXY=true`. Covered by `test/security-hardening.spec.ts`.

### Rate limiting and client IP

The Nest `ThrottlerGuard` is replaced by `ClientThrottlerGuard` (`src/common/guards/client-throttler.guard.ts`). Bucket key: authenticated user id when the bearer token verifies (signature, issuer, audience, `type=access`; no DB lookup, this guard runs before `JwtAuthGuard`), otherwise `req.ip`. `req.ip` honours `X-Forwarded-For` only when `TRUST_PROXY` is set; leave it `false` if the API is reachable directly. Set it to the exact number of trusted proxy hops, never `true` in production.

Limitation: throttler storage is the default in-memory store. Limits are per API process, reset on restart, and are not shared across replicas (effective limit is roughly replicas x limit). A Redis-backed store (for example `@nest-lab/throttler-storage-redis`) is not installed and would be needed for a shared global limit.

Web change needed (not made here): the Next BFF (`lib/auth/server-session.ts`, `backendJson`) calls the API with no forwarding headers, so every anonymous request (login, register, password reset) shares the Next server's IP bucket. Authenticated traffic is now bucketed by user id and is unaffected. To rate-limit anonymous farmers individually, `backendJson` should send `x-forwarded-for` set to the end-user IP from `headers()` (as resolved by the platform edge, not a raw client-supplied value) and the API should run with `TRUST_PROXY=<hops>`. Until then keep `TRUST_PROXY=false`; per-route limits on auth endpoints then apply to the shared BFF bucket.

### Log redaction

pino redacts `authorization`/cookie headers and, in request bodies, `password`, `newPassword`, `confirmPassword`, `otp`, `code`, `email`, `phone`, `phoneNumber`, `pin`, tokens and API keys, plus the same fields (`otp`, `email`, `phone`, `phoneNumber`, passwords, tokens) one level deep in any logged object. `code` is not wildcard-redacted because `err.code` is a needed diagnostic.

### Web: object-storage upload origins (CSP)

| `STORAGE_UPLOAD_ORIGINS` | BUILD_TIME (web; headers are fixed at `next build`) | Comma-separated list of exact `https://` origins (no path, no wildcard) that browsers upload to via presigned URLs, for example `https://my-bucket.oss-ap-southeast-1.aliyuncs.com`. Added to the `connect-src` directive of the Content-Security-Policy. Without it voice-note and scan-image uploads are blocked by the browser in production. | Deployment |

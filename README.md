# FasalGuard AI

FasalGuard AI is an agritech platform for farm and field management, crop-health screening,
weather and satellite intelligence, expert review, and regional outbreak awareness.

The repository contains the Next.js frontend at the root and the NestJS modular-monolith
API in `services/api`. The development stack provides PostgreSQL 17 with PostGIS, Redis, and API.

## Requirements

- Node.js 22+
- npm 10+
- Docker Desktop with Docker Compose

## Start the backend

From the repository root:

```bash
docker compose up --build
```

Wait for PostgreSQL and Redis to become healthy, the one-shot `migrate` service to exit
successfully, and the API to become healthy. Then open:

- liveness: http://localhost:4000/api/v1/health
- readiness: http://localhost:4000/api/v1/ready
- metrics: http://localhost:4000/api/v1/metrics (requires `METRICS_TOKEN` when configured)
- Swagger UI: http://localhost:4000/api/docs
- OpenAPI JSON: http://localhost:4000/api/docs-json

Stop without removing data using `docker compose down`. To intentionally delete local database
and Redis data, use `docker compose down --volumes`.

## Run API source locally

Start its dependencies from the repository root:

```bash
docker compose up -d postgres redis
cd services/api
copy .env.example .env
npm install
npm run start:dev
```

The example environment file has development placeholders only. Never commit `.env` or real
secrets. External provider credentials must remain server-side and are not part of Phase 1.

## Backend verification

Run from `services/api`:

```bash
npm run lint
npm run typecheck
npm test
npm run build
```

### Inspect development records with Prisma Studio

Prisma is installed only as a development database viewer. TypeORM remains the application ORM and the only migration authority. After starting PostgreSQL and applying TypeORM migrations:

```bash
docker compose up -d postgres
cd services/api
# Set DATABASE_URL in services/api/.env or in your shell first.
npm run db:inspect
npm run db:studio
```

Open the local URL printed by Prisma Studio. Run `npm run db:inspect` after schema migrations so the inspection schema reflects the database. Never run `prisma migrate`, and never use Prisma-generated models from production application code.

The API uses strict TypeScript, ConfigModule environment validation, global DTO validation,
TypeORM with schema synchronization disabled, URI versioning, standardized API errors,
correlation IDs, structured JSON logs, Swagger, and graceful shutdown hooks.

`GET /api/v1/health` checks process liveness. `GET /api/v1/ready` verifies PostgreSQL, the
PostGIS extension, and Redis. Future database changes must use reviewed TypeORM migrations.
Phase 1 deliberately contains no fake business modules or provider adapters.

Production observability covers structured logs, correlation IDs, request/provider/queue timings,
worker and provider failure metrics, dependency probes, and privacy-safe Sentry-compatible error
reporting. Configuration, scrape guidance, alert suggestions, and incident handling are documented
in [the observability operations runbook](docs/operations/observability.md).

CI/CD builds and validates separate API, BullMQ worker, and FastAPI images. Artifact publication is
manual and never performs a deployment. Environment promotion, migrations, Alibaba service wiring,
rollback, and RDS backup/restore procedures are documented in the
[deployment runbook](docs/operations/deployment.md).

## Phase 2 database and geospatial foundation

The initial TypeORM migrations create users, farmer/expert profiles, consent history, devices,
reference crops and varieties, farms, fields, and crop cycles. UUID keys, UTC `timestamptz`
auditing, optimistic versions, and recoverable soft deletion are used consistently.

Farm and field boundaries are PostGIS `geometry(Polygon,4326)` values. Their centroids are
`geometry(Point,4326)`, and every spatial column has a GiST index. Database constraints and the
geospatial service validate polygons and coordinate ranges, calculate geodesic hectares, derive
centroids and bounding boxes, and optionally require fields to be covered by their parent farm.

Docker Compose runs the one-shot `migrate` service before starting the API. For a locally running
API, apply or inspect migrations from `services/api` after configuring `DATABASE_URL`:

```bash
npm run migration:run
npm run migration:show
```

Run the live PostGIS integration suite with PostgreSQL available:

```bash
npm run test:integration
```

The only seeded reference records are Cotton, Wheat, Rice, Maize, and Sugarcane. No agronomic
thresholds, pesticide guidance, dosages, or treatment rules are seeded.

## Phase 3 authentication, authorization, sessions, and consent

Authentication is available under `/api/v1/auth`:

- `POST /register` creates a farmer account, profile, versioned consent records, device, and session.
- `POST /login`, `POST /refresh`, and `POST /logout` manage access and rotating refresh tokens.
- `GET /me` returns the authenticated user.
- `GET /sessions`, `DELETE /sessions/:id`, and `DELETE /sessions` inspect or revoke sessions.

Passwords use Argon2id. Refresh tokens are random opaque credentials; only SHA-256 digests are
stored. Every refresh rotates the credential, and reuse revokes the entire token family. Access
tokens are short-lived JWTs, but protected requests also validate the live database session and
current user role, so revocation and role changes take effect immediately. Authentication routes
have endpoint-specific rate limits and errors use the shared API error envelope.

Supported roles are `FARMER`, `AGRICULTURE_EXPERT`, `FIELD_WORKER`, `NGO_VIEWER`,
`GOVERNMENT_VIEWER`, `ADMIN`, and `SUPER_ADMIN`. Public registration intentionally creates only
`FARMER`; privileged role assignment belongs to a future audited administration workflow.

Consent input supports `LOCATION_PROCESSING`, `ANONYMOUS_COMMUNITY_REPORTING`,
`AI_IMAGE_ANALYSIS`, `NOTIFICATIONS`, and `RESEARCH_DATA_USE`. Each record stores its policy
version, decision, and recording timestamp rather than overwriting consent history.

The password-reset service depends on an OTP provider interface. `OTP_PROVIDER=development`
selects the test-only in-memory adapter and fixed code `000000`. It is deliberately development
only and must never be deployed as an SMS implementation. `OTP_PROVIDER=production` selects a
fail-closed placeholder until a real provider is implemented and configured.

For local live integration tests, start PostgreSQL and Redis, apply migrations, export the values
from `.env.example` (using a test-only JWT secret), and run:

```bash
npm run migration:run
npm run test:integration
```

The integration suite covers registration and consent persistence, login and current-user access,
denied and allowed RBAC paths, refresh rotation and replay-family revocation, session listing,
single-session revocation, and all-session revocation.

## Phase 4 farmer, farm, and field management

Authenticated farmers can create, list, inspect, update, and soft-delete their own farms through
`/api/v1/farms`. Fields are created through `/api/v1/farms/:farmId/fields` and managed through
`/api/v1/fields/:id`. Field summaries are available at `/api/v1/fields/:id/summary`.

Farm and field boundaries must be valid GeoJSON polygons. The API validates coordinate ranges and
PostGIS geometry validity, derives centroids and geodesic hectares server-side, and—when
`ENFORCE_FIELD_WITHIN_FARM=true`—requires every field to be covered by its parent farm. Client
acreage is rejected by DTO validation and is never persisted. Shrinking a farm boundary is also
rejected if it would exclude an existing field.

Exact boundaries are private. The owner-only GeoJSON routes are:

- `GET /api/v1/farms/:id/geojson`
- `GET /api/v1/fields/:id/geojson`

All farm and field queries join through the authenticated farmer profile. A non-owner receives the
same 404 response as an unknown identifier, preventing cross-farmer discovery. A separate
community presenter exposes only coarse province/district and area bands; it deliberately omits
names, owner IDs, boundaries, centroids, and exact acreage. Future outbreak/community modules must
use this sanitized projection rather than the owner-facing entities.

Fields optionally accept a current crop cycle with crop, variety, sowing date, expected harvest
date, growth stage, and status. Crop references and variety ownership are verified in the database,
date order is validated, and replacement happens transactionally. Farm deletion soft-deletes its
fields and crop cycles in the same transaction.

## Phase 5 private media uploads

Media is private by default and is uploaded directly to object storage rather than streamed
through the API. Authenticated clients use this sequence:

1. `POST /api/v1/uploads/presign` with `filename`, `contentType`, `sizeBytes`, `purpose`, optional
   SHA-256 `checksum`, and small scalar `metadata`.
2. Upload the bytes to the returned short-lived `upload.url` with the returned HTTP method and
   headers. Do not add a public-read ACL.
3. `POST /api/v1/uploads/complete` with the returned `media.id`. The API checks the stored object's
   type, size, and checksum before changing its state from `PENDING` to `READY`.
4. Request a five-minute private download URL from `GET /api/v1/media/:id/access-url` when needed.

Supported purposes are `crop-scan`, `field-inspection`, `expert-review`, `voice-note`, `satellite`,
and `report`. Each purpose has an explicit MIME allowlist and size limit. Filenames are normalized
server-side, metadata is bounded, ownership is checked on completion and access, and API media
responses never expose a permanent public OSS URL.

Development and integration tests use `OBJECT_STORAGE_PROVIDER=mock`. This adapter is rejected
when `NODE_ENV=production`. For Alibaba OSS, configure only the API environment:

```dotenv
OBJECT_STORAGE_PROVIDER=alibaba
OSS_REGION=oss-ap-southeast-1
OSS_BUCKET=your-private-bucket
OSS_ACCESS_KEY_ID=
OSS_ACCESS_KEY_SECRET=
```

The OSS bucket must remain private and its CORS policy must allow the application origins, `PUT`,
and the signed request headers (`Content-Type` and `x-oss-meta-sha256` when checksums are used).
Production deployment still requires a least-privilege RAM role or short-lived STS credentials;
never place OSS credentials in browser/mobile configuration or commit them to an environment file.

## Phase 6 Sentinel Hub Catalog integration

Satellite scans are asynchronous. `POST /api/v1/fields/:fieldId/satellite-scans` verifies field
ownership, creates a `QUEUED` capture, enqueues an idempotently keyed BullMQ job, and returns HTTP 202. The worker submits the owner's private PostGIS polygon to Sentinel Hub Catalog, selects a
recent Sentinel-2 L2A scene within the configured cloud threshold, and stores normalized scene
metadata. Poll with `GET /api/v1/satellite-scans/:id` or list field scans with
`GET /api/v1/fields/:fieldId/satellite-scans`.

Configure credentials only on the API/worker environment:

```dotenv
SENTINEL_HUB_CLIENT_ID=
SENTINEL_HUB_CLIENT_SECRET=
SENTINEL_HUB_BASE_URL=https://services.sentinel-hub.com
OPEN_METEO_BASE_URL=https://api.open-meteo.com
WEATHER_CACHE_TTL_SECONDS=900
SATELLITE_MAX_CLOUD_COVERAGE=30
```

OAuth tokens are cached in server memory and never returned to clients. Provider calls have
timeouts, retry with exponential backoff and jitter, normalize errors, handle HTTP 429, and record
request duration, status, request ID, and reported processing units in `integration_usage`.
Recorded Catalog fixtures test the adapter without credentials. A real Catalog proof requires a
valid Sentinel Hub OAuth client; after configuring it, create a scan for a real field polygon and
observe the capture transition from `QUEUED` to `SEARCHING_SCENE` and then `COMPLETED` or
`NO_VALID_SCENE`.

Phase 6 creates storage foundations for layers, statistics, stress zones, and field health scores,
but intentionally stops at Catalog scene discovery. Process/Statistical API provider methods are
available for the next processing phase; no vegetation score or exact disease is fabricated from
Catalog metadata.

## Phase 7 satellite processing pipeline

After Catalog discovery, BullMQ advances each capture through durable jobs named
`satellite:discover`, `satellite:process`, `satellite:statistics`,
`satellite:stress-analysis`, and `satellite:finalize`. Deterministic job IDs, database uniqueness
constraints, persisted stage outputs, advisory locking around field/scene deduplication, retries,
and progress metadata make the chain safe to resume after a worker restart.

The Process API renders private GeoTIFF layers for true colour, NDVI, NDMI, and a Sentinel-2 L2A
SCL/data-quality mask. Workers write these directly to private OSS objects; clients only receive
five-minute signed access URLs. The Statistical API—not display colours—supplies mean, minimum,
maximum, percentiles, histogram, valid-pixel percentage, and masked/cloud percentage.

The FastAPI service in `services/geospatial-ai` reads a temporary signed analysis raster, applies
field-history-relative anomaly detection, extracts contiguous regions, filters small areas, and
returns valid GeoJSON stress polygons. It intentionally returns no stress zones when there is no
previous valid field baseline; it does not apply one crop-independent NDVI threshold and never
labels an exact disease from satellite imagery.

Additional owner-only routes are:

- `GET /api/v1/satellite-scans/:id/layers`
- `GET /api/v1/satellite-scans/:id/statistics`
- `GET /api/v1/satellite-scans/:id/stress-zones`
- `GET /api/v1/fields/:id/satellite-comparison`

Run the complete local stack with `docker compose up --build`. The geospatial service health check
is available internally and at `http://localhost:8000/health` in development. Live end-to-end
Sentinel processing additionally requires Sentinel Hub credentials and Alibaba OSS credentials;
neither may be exposed to the frontend.

## Phase 8 automatic field monitoring

Active fields are claimed every ten minutes when their persisted `nextSatelliteCheckAt` is due.
The configured monitoring cadence is constrained to 6–12 hours. Monitoring queries Sentinel Hub
Catalog first and compares returned provider scene IDs with existing captures; it creates and
processes a capture only for the newest unseen scene that passes the cloud threshold. No Process
or Statistical API request is made when there is no new usable acquisition.

Field monitoring tracks `lastSatelliteCheckAt`, `lastSuccessfulCaptureAt`,
`nextSatelliteCheckAt`, and a provider-failure count. Provider failures use capped exponential
backoff. Authentication failures receive a longer delay, while zero results and cloud-covered
results complete normally without creating a capture. Provider failures never create farmer
alerts.

```dotenv
SATELLITE_MONITORING_INTERVAL_HOURS=8
SATELLITE_PROVIDER_REQUESTS_PER_MINUTE=30
```

BullMQ constrains monitoring-worker throughput and a Redis provider budget protects all Sentinel
Hub calls across workers. Each external request records provider, operation, request count,
processing units when reported, latency, HTTP status, success/error state, and timestamp.
Administrators and super administrators can inspect aggregate and recent usage through
`GET /api/v1/admin/integrations/usage`, optionally filtered by `?provider=`.

## Phase 9 crop-aware weather intelligence

Authenticated farmers can request current weather, a seven-day hourly forecast, deterministic
crop-weather risks, and suitability for an owned field through `/api/v1/fields/:id/weather/current`,
`forecast`, `risks`, and `suitability`. A single Open-Meteo request retrieves temperature,
humidity, rain probability/amount, wind/gusts, solar radiation, ET0, soil moisture, and soil
temperature. Redis caches that normalized bundle by rounded private field centroid, so separate UI
widgets do not trigger separate provider calls. Snapshots and forecast time buckets are persisted.

Weather rules are database configuration with a required source and validation status. The seed
contains only clearly labelled `DEMO_UNVERIFIED` cotton examples. These can produce a demo
assessment, but the API returns `productionAssessment: null` and `recommendationAllowed: false`
unless a matching `EXPERT_APPROVED` rule exists. A database constraint requires an approving expert
and approval timestamp before that status can be stored. No seeded threshold is represented as
agronomist-approved guidance.

```dotenv
OPEN_METEO_BASE_URL=https://api.open-meteo.com
WEATHER_CACHE_TTL_SECONDS=900
```

Apply the schema with `npm run migration:run` from `services/api` before starting the API.

## Phase 10 crop image screening

The farmer crop-screening flow reuses private `crop-scan` media uploads and processes images in a
BullMQ worker. Create a scan with `POST /api/v1/crop-scans`, attach completed owned media with
`POST /api/v1/crop-scans/:id/images`, enqueue screening with `POST /api/v1/crop-scans/:id/analyse`,
and poll `GET /api/v1/crop-scans/:id`.

Images are decoded server-side with Sharp to reject corrupt files and enforce minimum dimensions;
the existing media policy enforces supported JPEG/PNG/WebP types and a 15 MB limit. Provider quality
results support blurry, dark, overexposed, crop-not-visible, and too-distant signals. Roboflow is the
hackathon adapter; the self-hosted adapter targets production FastAPI inference. Provider secrets
remain API-side and raw responses remain in private prediction audit records.

Every prediction stores model ID, version, confidence, alternatives, and inference time. Results
are always phrased as screening. Low confidence requests better images, intermediate confidence
requests expert review, and even high-confidence top-1 output remains unverified. The database
forbids `is_firm_diagnosis=true`.

```dotenv
VISION_PROVIDER=self-hosted
SELF_HOSTED_VISION_URL=http://localhost:8000
VISION_MINIMUM_CONFIDENCE=0.65
VISION_EXPERT_REVIEW_BELOW=0.85
# Demo only when explicitly selected:
ROBOFLOW_API_KEY=
ROBOFLOW_MODEL_ID=
ROBOFLOW_MODEL_VERSION=
```

## Phase 11 intelligent follow-up and AI explanation

Qwen is isolated behind `LlmProvider`. It may select up to five IDs from the server-owned question
library, summarize supplied answers, explain the existing vision screening in plain language,
translate approved text, and answer only from approved context. Farmer content is serialized as
`farmer_data`; it is never concatenated into the system prompt. Prompts remain server-side and each
interaction records provider, model, prompt version, structured inputs/outputs, and private raw data.

Strict JSON validators reject unknown question IDs, missing/extra keys, oversized values, malformed
JSON, dosage statements, chemical-combination instructions, and false laboratory confirmation.
Qwen cannot change the stored vision prediction or remove its uncertainty.

- `POST /api/v1/crop-scans/:id/follow-up/questions`
- `GET /api/v1/crop-scans/:id/follow-up/questions`
- `POST /api/v1/crop-scans/:id/follow-up/answers`
- `POST /api/v1/crop-scans/:id/explanation`

```dotenv
QWEN_BASE_URL=https://dashscope-intl.aliyuncs.com
QWEN_API_KEY=
QWEN_MODEL=qwen-plus
```

## Phase 12 deterministic severity

Severity is calculated without an LLM through a versioned weighted-evidence engine. The engine can
use image confidence, visual extent, farmer-reported field percentage and spread, scan history,
satellite decline, nearby reports, and weather risk. Missing evidence is recorded as uncertainty and
is excluded from weight normalization rather than treated as zero risk.

The only seeded configuration is `DEMO_RULESET` / `demo-severity-v1.0.0`, marked
`DEMO_UNVERIFIED` with an explicit non-production disclaimer. Its illustrative weights and cutoffs
are not represented as universal or agronomist-approved. Each result persists score, severity,
factors, weights, evidence record references, engine version, explanation and generation time.
Critical severity, low image confidence, rapid spread, and unknown conditions independently trigger
expert escalation.

- `POST /api/v1/crop-scans/:id/severity`
- `GET /api/v1/crop-scans/:id/severity`

## Phase 13 expert-controlled knowledge and action plans

Phase 13 adds versioned treatment guidelines, cited sources, knowledge articles, immutable approval
history, and farmer action plans. Expert/admin knowledge-management routes are under
`/api/v1/knowledge`; farmers generate a plan with
`POST /api/v1/crop-scans/:id/action-plan` and retrieve it with
`GET /api/v1/action-plans/:id`.

Only current `APPROVED` guidelines can populate action plans. Every generated step records its
source guideline, version, and source field; instructions are copied without allowing an LLM to add
agronomic advice. Chemical steps are omitted unless the guideline is approved and chemical guidance
has received a separate explicit approval. Guideline authors cannot approve their own work, and an
agriculture expert must have a verified expert profile to approve. Admin and super-admin roles may
also review guidance. Database triggers make approval audit events immutable.

The development seed contains only safe generic Cotton actions: inspect nearby plants, photograph
the affected area, monitor spread, maintain field hygiene, and request expert review. It contains no
pesticide, dosage, chemical mixture, or unverified agronomic threshold. Replace it with sourced,
agronomist-approved regional guidance before production use.

Apply the migration with `npm run migration:run`. The integration suite verifies the safe seed and
immutable audit history; the unit suite verifies that unapproved guidance cannot generate a farmer
plan and that unapproved chemical guidance never becomes an action-plan step.

## Phase 14 agriculture expert review and consultation

Phase 14 adds assignment-controlled expert cases, expert decisions, recommendations, consultations,
messages, and immutable case-status history. Expert routes are under `/api/v1/expert/cases`; farmer,
assigned-expert, and administrator consultation routes are under `/api/v1/consultations`.

The expert case detail composes farmer, farm/field, active crop cycle, private scan images and quality
results, versioned model predictions, follow-up answers, deterministic severity, latest satellite and
weather context, previous diagnoses, and the current approved-guideline action plan. Regular experts
must be verified and assigned to view or change a case; admins can manage assignments. Decisions and
recommendations are transactional and append an immutable status-history event.

Expert corrections are stored in `expert_reviews`. Original `model_predictions` and `diagnoses` are
never updated, preserving paired AI and human outcomes for audit and future model evaluation.
Consultations support text, completed private image assets, and completed private voice-note assets;
attachment ownership and MIME category are verified server-side.

Apply migration `ExpertReviewConsultation1755000013000` with `npm run migration:run` before starting
the API.

## Phase 15 privacy-safe community outbreaks

Phase 15 adds consent-gated community reports, one-vote-per-farmer verification, deterministic
PostGIS clustering, privacy-safe outbreak map projections, cluster membership, configurable outbreak
settings, and regional advisories. Reports can originate from an owned crop scan, a farmer's manual
field report, or an expert-confirmed case.

Exact field-derived report points and cluster centroids remain private database columns used only for
authorized spatial computation. Public endpoints return a server-derived regional grid polygon and
anonymous aggregate counts; they never return reporter identity, exact coordinates, farm boundaries,
field boundaries, or private geometry. Available read routes are `GET /api/v1/outbreaks`,
`GET /api/v1/outbreaks/:id`, and `GET /api/v1/outbreaks/map`.

Reports are submitted through `POST /api/v1/community/reports`. Farmers answer “Have you observed
similar symptoms?” through `POST /api/v1/community/reports/:id/verify` with `YES`, `NO`, `NOT_SURE`,
or `PHOTO_SUBMITTED`. Verification is rate-limited, unique per farmer/report, cannot target one's own
report, and validates ownership and MIME type of submitted private photos. Reporting also has request
and daily database limits plus recent duplicate detection.

The active `outbreak_settings` row controls distance radius, time window, minimum report count,
expert-confirmation requirement, and public grid size. The seeded values are explicitly marked
`DEMO_CONFIGURABLE`; they are not permanent agronomic thresholds and should be reviewed before
production use. Matching uses `ST_DWithin(...::geography)` for metric distance.

Apply migration `CommunityOutbreaks1755000014000` with `npm run migration:run`.

## Phase 16 explainable early-warning risk

Phase 16 adds a deterministic field inspection-priority engine at
`GET /api/v1/fields/:id/risk-assessment`. It combines the active crop and growth stage with the most
recent deterministic weather assessment, nearby anonymous community reports, expert-confirmed
outbreaks, satellite field-health change, and recent field scan/severity history. Results use
`VERY_LOW`, `LOW`, `MODERATE`, `HIGH`, or `CRITICAL` and include the numeric score, evidence,
weighted factors, ruleset version, uncertainty, explanation, and `validUntil`.

This is not a black-box forecast and does not claim to predict disease. The seeded
`EXPLAINABLE_DEMO_V1` ruleset is explicitly `DEMO_UNVERIFIED`; weights, level thresholds, and result
validity are stored in `field_risk_rulesets`, not embedded as permanent agronomic truth. Missing
inputs are disclosed and excluded from the weight denominator rather than treated as safe or risky.

BullMQ reassessment jobs are automatically queued after a new weather bundle is persisted, a usable
satellite capture is finalized, a farmer submits a crop scan for analysis, or a nearby community
report changes outbreak evidence. Jobs use retry/backoff and time-bucketed deduplication. A failed
reassessment never creates a farmer warning and does not invalidate the source workflow.

Apply migration `FieldRiskEngine1755000015000` with `npm run migration:run`.

## Phase 19 offline and low-connectivity synchronization

Mobile clients can queue metadata mutations and replay them through `POST /api/v1/sync/mutations`. Every item requires a UUID `clientMutationId`, an authenticated owned `deviceId`, a mutation `type`, and its metadata payload. Supported types are field inspection, follow-up answers, crop-scan metadata, task completion, voice-note metadata, and community report.

Mutation receipts are uniquely keyed by user, device, and client mutation ID. Identical retries return the stored result and cannot create another resource. Reusing an ID with different payload data is rejected. Failed receipts can be retried, and batch items fail independently.

Editable tasks and field inspections require `expectedVersion`. A stale mutation returns `VERSION_CONFLICT` with the expected version, current server version, and current server representation; it never silently overwrites the newer resource.

Use `GET /api/v1/sync/changes?cursor=...` for opaque-cursor incremental changes. PostgreSQL triggers capture online and offline changes for syncable resources. Community change records contain regional/privacy labels only and exclude coordinates. Satellite raster binaries and media bodies are never accepted by the sync API; upload them through the private object-storage flow and synchronize only resulting media IDs.

## Gemini Investigation Mode

Gemini Investigation Mode is documented in [`docs/GEMINI_FARM_BRAIN.md`](docs/GEMINI_FARM_BRAIN.md). It consumes the owner-authorized Farm Digital Twin, persists an evidence ledger before inference, validates Gemini's structured result, and stores allowlisted function calls as proposals. A satellite anomaly without ground imagery must request farmer photos rather than claim a disease or create an incident. State-changing proposals require explicit authenticated confirmation and execute through application-owned policies rather than granting Gemini direct database or API access.

## Business evidence

Verified viability metrics are documented in [`docs/BUSINESS_EVIDENCE.md`](docs/BUSINESS_EVIDENCE.md). `GET /api/v1/analytics/viability` derives conservative operational and commercial totals from persisted records, excludes demo/test organizations, requires external verification for paid revenue, and returns zero rather than fabricated fallback values.

Major capabilities are evaluated using the release gate in [`docs/FEATURE_SCORING_FRAMEWORK.md`](docs/FEATURE_SCORING_FRAMEWORK.md): real evidence, an explicit Gemini role where applicable, a measurable action, an audit record, clear farmer value, and a reproducible live-demo path.

Satellite observations remain non-diagnostic: a disease hypothesis cannot be grounded only in Sentinel/NDVI evidence. Configure Google AI for server-side demos or Vertex AI workload identity for production; no Google credential is exposed to the frontend.

## Phase 18 voice and AI agriculture assistant

The authenticated farmer assistant is available under `/api/v1/assistant`:

- `POST /conversations`
- `GET /conversations`
- `GET /conversations/:id`
- `POST /conversations/:id/messages`
- `POST /speech/transcribe`
- `POST /speech/synthesize`

Conversation context is assembled server-side and is limited to the farmer-owned selected farm/field, crop cycle, latest satellite result, weather assessment, latest crop scan, pending tasks, and nearby outbreak summaries with approximate distance only. Exact boundaries and coordinates are never sent to the model.

The assistant cannot call database or external tools. Its only possible outputs are inert proposals from the server allowlist: `CREATE_TASK`, `START_SCAN`, `REQUEST_EXPERT`, and `VIEW_OUTBREAK`. The client must explicitly confirm and call the appropriate mutation endpoint separately.

Set `ASSISTANT_PROVIDER=qwen` and/or `SPEECH_PROVIDER=qwen` to enable configured Qwen-compatible adapters. Development defaults to deterministic fake providers. Every assistant response stores provider, model, model version, prompt version, token usage, and latency; application logs do not include farmer message contents or exact locations.

## Phase 17 tasks, notifications and farmer alerts

The API now provides owner-scoped farmer tasks, an in-app notification inbox and private push-token registration:

- `POST /api/v1/devices/push-token`
- `DELETE /api/v1/devices/push-token/:id`
- `GET /api/v1/notifications`
- `PATCH /api/v1/notifications/:id/read`
- `GET /api/v1/tasks`
- `POST /api/v1/tasks`
- `PATCH /api/v1/tasks/:id`
- `POST /api/v1/tasks/:id/complete`

Push delivery is durable and asynchronous through BullMQ. Notification and per-device delivery records are deduplicated in PostgreSQL, failed deliveries use exponential retries, and invalid Firebase tokens are deactivated. The latest `NOTIFICATIONS` consent and per-category push preference are checked before delivery scheduling. Unconfirmed or low-confidence AI results cannot use emergency wording.

Development defaults to `PUSH_PROVIDER=development`, which never contacts Firebase. For production set `PUSH_PROVIDER=firebase` and provide `FIREBASE_SERVICE_ACCOUNT_BASE64` containing base64-encoded Firebase service-account JSON. Credentials remain server-side and must never be included in frontend environment variables.

Run migration `1755000016000-tasks-notifications` before starting the updated API.

## Phase 20 reports and impact analytics

Authenticated users can request asynchronous reports with `POST /api/v1/reports`, list their own report records with `GET /api/v1/reports`, and inspect one with `GET /api/v1/reports/:id`. Generation runs on the `report-generation` BullMQ queue with retry and job deduplication. Supported types are `SATELLITE_HEALTH`, `DIAGNOSIS`, `EXPERT_REVIEW`, `FIELD_HEALTH`, `WEATHER_SUITABILITY`, `WEEKLY_ACTION_PLAN`, and `OUTBREAK_SUMMARY`.

PDFs are written through the existing object-storage abstraction under the private `report/` prefix. A completed report response contains a download authorization valid for five minutes; permanent OSS URLs and object keys are never exposed. Use `idempotencyKey` when retrying a create request. Farmer resource reports are ownership checked before being queued, while regional outbreak reports require an expert, NGO, government, or administrator role.

`GET /api/v1/analytics/impact` is restricted to NGO, government, and administrator roles. It returns aggregate metrics only and no farmer identity, farm boundary, exact coordinate, email, or telephone data. Notification generation and successful delivery are copied into the separate immutable-style `analytics_events` fact table by database triggers, allowing operational records to retain their own lifecycle.

Apply migration `1755000019000-reports-impact-analytics` and ensure PostgreSQL, Redis, and private object storage are configured before starting workers. In development, the in-memory storage adapter remains available; production configuration rejects that adapter and requires Alibaba OSS.

## Frontend

From the repository root:

```bash
npm install
npm run dev
```

Open http://localhost:3000. Frontend/backend endpoint integration remains a separate phase.

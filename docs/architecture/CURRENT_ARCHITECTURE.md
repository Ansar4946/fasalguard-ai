# Current Architecture Audit

Audit date: 2026-08-17. This document records source-verified behavior; it does not treat roadmap text as implementation evidence.

## System shape

FasalGuard is a monorepo with three deployable processes:

- The root is a Next.js 16 App Router application using React 19, TypeScript, Tailwind CSS 4 and Lucide icons.
- `services/api` is a NestJS 11 modular monolith. The HTTP API and BullMQ worker share modules but start through separate entry points (`main.ts` and `worker.ts`) and `PROCESS_ROLE` controls processor registration.
- `services/geospatial-ai` is a FastAPI service used for raster anomaly analysis and crop-image inference integration paths.

PostgreSQL 17/PostGIS is the system of record, Redis supports queues, caching and distributed provider limits, and private media/report/satellite objects are abstracted behind object storage. TypeORM schema synchronization is disabled; 20 numbered domain migrations plus the migration index are present.

## Frontend

Route groups provide farmer, expert, government, authentication and onboarding workspaces. Shared shells live under `components/layout`; feature-oriented UI is split across `components` and `features`.

The frontend is visually extensive but is not yet an API client for the backend. Repository searches found no `/api/v1` calls in application UI. Diagnosis uses `mockDiagnosisRepository`; onboarding and scan sessions use browser `localStorage`; dashboard, farm, outbreak, expert, learning and governance content is supplied by typed fixture files. Authentication is therefore not connected end-to-end.

## API foundation and security

`AppModule` wires ConfigModule validation, Pino JSON logging, PostgreSQL, Redis, health, observability and the domain modules. The API uses URI versioning under `/api/v1`, global DTO validation, a standardized exception filter, correlation IDs, CORS configuration, request-size controls, Swagger, throttling, JWT authentication and role guards.

Authentication uses Argon2id passwords, short-lived JWT access tokens and hashed opaque rotating refresh tokens. Live session lookup makes revocation effective immediately. Roles are farmer, agriculture expert, field worker, NGO viewer, government viewer, admin and super admin. Consent is versioned. The production OTP adapter intentionally fails closed because no real SMS provider exists.

## Domain modules

- `auth`, `identity`: users, profiles, devices, consent and sessions.
- `farms`, `crops`, `geospatial`: owner-scoped farms, fields, crop cycles and PostGIS validation.
- `media`: private direct uploads through Alibaba OSS or a development/test mock.
- `satellite`: Sentinel Hub Catalog/Process/Statistical integration, scheduled discovery, layers, statistics, stress analysis and health scores.
- `weather`: Open-Meteo retrieval, Redis caching and deterministic, approval-aware rules.
- `crop-scans`: private image checks, Roboflow/self-hosted inference abstraction and normalized predictions.
- `follow-up`: Qwen question selection, summarization, explanation and translation with structured-output validation.
- `severity`, `risk`: deterministic versioned demo rulesets; neither delegates final risk/severity to an LLM.
- `knowledge`: expert-controlled guidelines, approvals and action plans.
- `expert-review`: assignments, decisions, consultations, messages and immutable status history.
- `outbreaks`: consent-gated reports, PostGIS clustering, anonymized map projections and verification.
- `notifications`: tasks, preferences, device tokens and queued FCM delivery.
- `assistant`: contextual Qwen/fake assistant and speech providers; produces inert proposals only.
- `sync`: idempotent offline mutations and cursor-based changes.
- `reports`: queued PDF generation, private storage and aggregate impact analytics.

## Queues and scheduled work

BullMQ handles satellite discovery/processing/statistics/stress/finalization, automatic satellite monitoring, crop scans, risk reassessment, notification delivery and report generation. Deterministic job IDs and database uniqueness constraints provide deduplication. Redis also caches weather and provider tokens/budgets.

## External providers

| Provider | Purpose | Current state |
|---|---|---|
| Copernicus Sentinel Hub | Sentinel-2 scene search, rendering and statistics | Real adapter; credentials required |
| Open-Meteo | Weather observations and forecast | Real adapter |
| Alibaba OSS | Private media, layers and reports | Real adapter; mock selected in development |
| Roboflow | Demo crop-image classifier | Real hosted adapter; optional |
| Self-hosted FastAPI | Vision/geospatial processing path | Implemented service path; production model assets still required |
| Alibaba Qwen | Follow-up, explanation, assistant, STT/TTS | Real adapters; assistant/speech default to fake |
| Firebase Cloud Messaging | Push notifications | Real adapter; development provider is default |
| Sentry-compatible endpoint | Sanitized error reporting | Configuration adapter present |
| Gemini / Vertex AI | Central reasoning/orchestration | Not implemented and not configured |

No OpenAI or Hugging Face runtime integration was found. The Google Cloud reference in the API lockfile is only an optional transitive peer reference, not an application integration.

## Testing and deployment

The API contains unit, security, provider and PostGIS integration tests. The FastAPI service has a focused analysis test. GitHub Actions run lint, typecheck, unit/integration tests, builds, migration checks and security scans. Docker artifacts exist for API, worker and FastAPI; deployment templates target Alibaba RDS PostGIS, Tair Redis and OSS. Production publishing is manual and no deployment is performed by repository code.

## Verified constraints

- Exact farm geometry is owner-only; community maps use sanitized geometry.
- Satellite anomalies are not represented as exact disease diagnoses.
- Predictions preserve model/version/confidence and expert corrections do not overwrite AI output.
- Only approved knowledge can populate production action plans.
- Provider secrets are server-side and sensitive log fields are redacted.


# FasalGuard AI — Codebase Handover

Audited: 2026-08-17 (first-run, read-only audit; no functional code was changed to produce this document).

## Architecture at a glance

```
Browser
  │
  ▼
Next.js 16 frontend (root: app/, components/, features/, lib/, proxy.ts)
  │  proxy.ts (middleware-equivalent): reads fg_access/fg_refresh httpOnly cookies,
  │  calls backend /auth/me, refreshes if needed, redirects unauthenticated /
  │  wrong-role requests
  ▼
app/api/auth/* route handlers (same-origin BFF; only these + auth-provider talk to the backend)
  │  lib/auth/server-session.ts — server-only fetch wrapper, cookie management
  ▼
NestJS backend (services/api) — FASALGUARD_API_URL, default http://localhost:4000/api/v1
  │  Global guards (all routes protected by default): ThrottlerGuard → JwtAuthGuard → RolesGuard
  │  20 domain modules (see below)
  ├──▶ PostgreSQL + PostGIS (TypeORM, 25 migrations, synchronize:false)
  ├──▶ Redis (cache: weather; queues: BullMQ; rate-limiting: satellite provider)
  ├──▶ services/geospatial-ai (Python/FastAPI) — NDVI stress-zone analysis, rasterio-based
  ├──▶ Sentinel Hub (satellite imagery) / Open-Meteo (weather, keyless)
  ├──▶ Gemini (farm-brain, "Investigation Mode") / Qwen (assistant, follow-up)
  ├──▶ Alibaba OSS (object storage) / SMTP (nodemailer, password-setup email)
  └──▶ Firebase Cloud Messaging (push notifications)

Background worker (services/api, PROCESS_ROLE=worker, dist/worker.js)
  └──▶ Consumes BullMQ queues: satellite, satellite-monitoring, farm-brain, field-risk,
       report, crop-scan, notification
```

**The single most important fact about this codebase**: the backend is broad and largely complete across 20 domains (auth, farms, satellite, weather, crop-scans, follow-up, severity, knowledge, expert-review, outbreaks, risk, notifications, assistant, sync, reports, digital-twin, farm-brain, media, geospatial, plus entity-only `identity`/`crops`). The **frontend is wired to the backend only for authentication/session** (login, logout, register, /me, refresh). Every other screen — farms, dashboard, satellite, weather, diagnosis, expert, governance, outbreaks, learning, conversations, analytics — currently renders static fixture data from `features/*/data.ts` or `features/diagnosis/mock-repository.ts` and never calls the live API, even though the corresponding backend endpoints exist and work. See `docs/FEATURE_STATUS.md` and `docs/MOCK_DATA_AUDIT.md` for the full breakdown.

## Repository layout

Monorepo, single Next.js app at root + NestJS API + Python geospatial service under `services/`.

```
app/                          Next.js 16 App Router (React 19, TS, Tailwind 4)
  (auth)/                     login, onboarding wizard (personal/farm/setup/complete), set-password
  (farmer)/                   dashboard, farms, fields, scan (upload/symptoms/analysis/results),
                               satellite, weather, radar, alerts, tasks, consultations, assistant,
                               learning, analytics — has the only route-group-level layout.tsx
  (expert)/expert/            case queue, case detail, consultations, outbreaks, reports
  (government)/government/    advisories, districts, impact, reports
  api/auth/                   login, logout, me, onboarding, password/setup — the ONLY real
                               backend-calling routes in the frontend
components/                   UI mirrors features/ by domain (alerts, analytics, auth, dashboard,
                               expert, farms, fields, governance, intelligence, layout, learning,
                               onboarding, outbreaks, scan, tasks, ui, ...)
features/                     Per-domain state/data: auth/auth-provider.tsx (real),
                               onboarding/onboarding-provider.tsx (localStorage only),
                               diagnosis/scan-session-provider.tsx + mock-repository.ts (fake),
                               farms/, expert/, governance/, intelligence/, learning/,
                               outbreaks/, conversations/ — all *.data.ts files are static fixtures
lib/auth/server-session.ts    The only file under lib/ — server-only cookie/session bridge to backend
proxy.ts                      Next.js 16 middleware-equivalent: route protection + role gating

services/api/                 NestJS 11 backend
  src/app.module.ts            Wires Config(Joi)→Observability→Logger(Pino)→Database→Redis→Health→
                                Geospatial→Throttler, then 18 domain Nest modules in dependency order
  src/domain/                  20 domain folders (see CODEBASE handover feature table for detail):
                                assistant, auth, crop-scans, crops*, digital-twin, expert-review,
                                farm-brain, farms, follow-up, geospatial, identity*, knowledge, media,
                                notifications, outbreaks, reports, risk, satellite, severity, sync,
                                weather   (*crops, identity are entity-only, no dedicated Nest module)
  src/infrastructure/database/  TypeORM data-source, migrations/ (25 files), entities/index.ts
                                (aggregates all domain entities for TypeOrmModule)
  src/config/                   configuration.ts (env→typed config), environment.ts (Joi validation
                                 schema + production-only hardening rules)
  src/health/                   /health (liveness), /ready (readiness: DB+PostGIS, Redis, storage,
                                 AI service as optional)
  src/worker.ts                 Nest application-context bootstrap for PROCESS_ROLE=worker (BullMQ
                                 consumers only, no HTTP listener)
  prisma/schema.prisma           Generated INSPECTION-ONLY snapshot (prisma db pull) — NOT the
                                 source of truth; can drift (confirmed stale by 1 table this pass)

services/geospatial-ai/        Python 3.12 / FastAPI — GET /health, POST /v1/stress-analysis
                                (rasterio-based NDVI baseline + zone detection, non-diagnostic
                                allowlisted labels only)

docs/                          Pre-existing docs (see "Existing documentation" below) + this audit's
                                new docs (this file + FEATURE_STATUS, MOCK_DATA_AUDIT,
                                DATABASE_ARCHITECTURE, AUTH_SECURITY_AUDIT, ENVIRONMENT_VARIABLES,
                                DEPLOYMENT_RECOMMENDATION, PRODUCTION_BLOCKERS)
docker-compose.yml              postgres (PostGIS), redis, api, geospatial-ai, migrate (one-shot)
deploy/environments/            development/staging/production .env.example profiles
```

## Build system

- **Package manager: npm** everywhere (root `package-lock.json`; `services/api` uses `npm ci`). No pnpm/yarn/bun files found — do not introduce another package manager.
- Root scripts (`package.json`): `dev` (`next dev`), `build` (`next build`), `start` (`next start`), `lint` (`eslint`). No root `test`/`typecheck` script — `tsc --noEmit -p tsconfig.json` and `eslint` both run clean when invoked directly (verified this pass).
- `services/api/package.json` scripts: `build` (`nest build`), `start`/`start:worker`, `start:dev`, `lint`, `typecheck` (`tsc --noEmit`), `test` / `test:integration` / `test:cov` (Jest), `migration:run` / `migration:run:prod` / `migration:revert` / `migration:show` (TypeORM CLI), `db:inspect` (`prisma db pull`, inspection only), `db:studio`.
- Node 22 targeted (Docker), Next.js 16.2.12, React 19.2.4, NestJS 11.

## Existing documentation (pre-dates this audit, verified accurate this pass)

`docs/` already contained a substantial, code-grounded documentation set from prior work, dated 2026-08-17: `API_INTEGRATION_MAP.md`, `AUTH_ARCHITECTURE.md`, `BUSINESS_EVIDENCE.md`, `FARM_DIGITAL_TWIN.md`, `FEATURE_SCORING_FRAMEWORK.md`, `FRONTEND_BACKEND_INTEGRATION.md`, `GEMINI_FARM_BRAIN.md`, `INTEGRATION_AUDIT.md`, `MOCK_DATA_REPORT.md`, `PRODUCTION_READINESS.md`, `SATELLITE_INGESTION.md`, `SECURITY_REVIEW.md`, plus `docs/architecture/*.md` (`CURRENT_ARCHITECTURE.md`, `DATABASE_GAPS.md`, `GEMINI_MIGRATION_PLAN.md`, `IMPLEMENTATION_ORDER.md`, `TARGET_ARCHITECTURE.md`, `XPRIZE_GAP_ANALYSIS.md`) and `docs/operations/*.md` (`deployment.md`, `observability.md`).

Every claim spot-checked against real code in this audit was accurate, **with one exception**: `docs/architecture/DATABASE_GAPS.md` proposes `incidents`/`ai_runs` tables as future work — those already exist under the names `farm_incidents` / `farm_brain_runs` / `farm_brain_run_evidence` / `farm_brain_tool_calls`. That doc should be reconciled, not treated as current-state. Everything else — auth architecture, satellite methodology, digital-twin shape, business-evidence entities, Gemini farm-brain design, TypeORM-not-Prisma clarification — checked out. Treat this existing set as reliable background reading; this audit's new docs (listed above) are meant to sit alongside it, not replace it, with the new docs focused on the specific FIRST RUN deliverables (feature status matrix, mock data, database, auth/security, env vars, deployment target, blocker list).

## What already works (verified by direct build/test/lint run this pass)

- Frontend: `npm run lint` clean, `tsc --noEmit` clean, `npm run build` succeeds (54 routes, Turbopack, ~45s).
- Backend: `npm run typecheck` clean, `npm run lint` clean, `npm test` — 29/30 suites pass, 84/85 tests pass (1 failing test is a stale fixture in `security-hardening.spec.ts`, not a real defect — see `docs/PRODUCTION_BLOCKERS.md`).
- Authentication end-to-end: register → login → session persistence (JWT + rotating hashed refresh token with reuse detection) → logout, all backed by real Argon2id hashing, transactional Postgres writes, and a route-protection middleware that re-validates against the DB on every request (not just JWT signature).
- PostGIS is genuinely used (real `geometry` columns, GiST indexes, `ST_IsValid`/containment checks), not simulated.
- Migration discipline is sound: `synchronize:false` everywhere, linear timestamped migrations, migrations decoupled from app boot via a dedicated one-shot `migrate` compose service.

## What's next

See `docs/FEATURE_STATUS.md` for the full per-feature matrix, `docs/MOCK_DATA_AUDIT.md` for every production-reachable mock, and `docs/PRODUCTION_BLOCKERS.md` for the prioritized P0/P1 list. Do not begin fixing these until the user reviews this audit and directs which phase to start.

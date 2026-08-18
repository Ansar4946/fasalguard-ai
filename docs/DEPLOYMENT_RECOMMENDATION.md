# Deployment Target Recommendation

Audited: 2026-08-17. This reflects the architecture as it exists today, not a redesign.

## What the current architecture already assumes

The pre-existing `docs/operations/deployment.md` and `docker-compose.yml` already encode a specific, coherent production target, and this audit confirms the code matches that plan:

- **NestJS API** — deployable as `PROCESS_ROLE=api` (or `all` for a single-process dev/staging setup), stateless HTTP, health-checked via `/api/v1/ready`.
- **BullMQ worker** — same Docker image, `PROCESS_ROLE=worker`, no HTTP listener (`worker.ts` is a bare Nest application-context bootstrap), consumes 7 queues (satellite, satellite-monitoring, farm-brain, field-risk, report, crop-scan, notification).
- **Python geospatial-ai (FastAPI)** — separate container, called synchronously by the satellite pipeline for NDVI stress-zone analysis.
- **PostgreSQL + PostGIS** — `postgis/postgis:17-3.5-alpine` locally; `deploy/environments/production.env.example` targets Alibaba Cloud RDS PostgreSQL with PostGIS.
- **Redis** — used for weather cache, BullMQ queue backend, and satellite provider rate limiting (three independent connections, not required to share a client). Locally `redis:7.4-alpine`; production targets Alibaba Tair (Redis-compatible).
- **Object storage** — Alibaba OSS in production (required, validated by Joi in prod), a mock provider in dev (explicitly forbidden in prod by `media.module.ts`).
- **Migrations** — a dedicated one-shot `migrate` service/step (`npm run migration:run:prod`), decoupled from app boot — the API container never runs migrations itself.
- **Next.js frontend** — not present in `docker-compose.yml` at all; runs separately (`npm run build && npm run start`, or a platform-native Next.js host).

## Recommendation: keep the Alibaba-Cloud-targeted, 4-deployable architecture already encoded in the repo

**Do not split this into a different topology merely for hackathon branding.** The existing design — 3 backend deployables (API, worker, geospatial-ai) sharing managed Postgres+PostGIS and Redis, plus a separately-hosted Next.js frontend — is sound, already has working multi-stage Dockerfiles, a compose file that models it correctly, and a deployment runbook that matches real npm scripts. Reproducing it on a different platform would mean re-deriving all of this for no functional gain.

**For each component:**

| Component | Recommended host | Why |
|---|---|---|
| Next.js frontend | Vercel, or any Next.js-native host | It's a standard App Router app with server route handlers and middleware (`proxy.ts`) — no custom server, no WebSockets, no long-running frontend process. Needs only `FASALGUARD_API_URL` pointed at the deployed API's public URL. |
| NestJS API | Google Cloud Run (or Alibaba ECS/ACK per the existing prod env example) | Stateless HTTP container, already has a production Dockerfile stage, already health-checks via `/api/v1/ready`. Cloud Run is a good fit if the hackathon wants Google Cloud branding — it doesn't conflict with the existing Alibaba-targeted config, since all the Alibaba-specific bits (OSS, RDS, Tair) are just env vars, not code-level lock-in. |
| BullMQ worker | Same platform as API, second service from the same image, `PROCESS_ROLE=worker`, no public ingress | Already isolated as its own Dockerfile stage/entrypoint. Needs to always be running (not request-triggered), so a request-scaled serverless platform is wrong for this piece specifically — use a min-instances=1 Cloud Run service, or a small always-on VM/container service. |
| geospatial-ai | Cloud Run (or same host as API) | Stateless FastAPI service, single-stage Dockerfile, no state of its own — a natural Cloud Run fit. |
| PostgreSQL+PostGIS | A managed Postgres with PostGIS available — Cloud SQL for Postgres (has PostGIS), or keep Alibaba RDS if staying on that cloud | Must confirm the PostGIS extension is installable/available before committing to a specific managed provider — run `SELECT PostGIS_Version();` against a real instance before finalizing. |
| Redis | A managed Redis — Cloud Memorystore, or Alibaba Tair if staying on that cloud | Required at startup (not optional) — do not deploy without a real managed instance. |
| Object storage | Alibaba OSS (as already coded), or add a second provider adapter (e.g. GCS) if moving fully to Google Cloud | The storage adapter interface already exists (`media/storage/`); adding a GCS adapter alongside the existing Alibaba one is a contained change if the hackathon wants full Google Cloud alignment, but is not required to ship. |

## If the hackathon specifically wants a Google-Cloud-only story

The cleanest non-disruptive path: keep the app/worker/geospatial-ai containers exactly as built, deploy all three to **Cloud Run**, point `DATABASE_URL` at **Cloud SQL** (Postgres 17 + PostGIS enabled) and `REDIS_URL` at **Memorystore**, and either keep Alibaba OSS (it's just a network call, no regional restriction preventing it from working alongside GCP) or add a GCS storage adapter. This satisfies "Google Cloud infrastructure may be strategically useful" (AGENTS.md Phase 27) without discarding any of the working architecture — it's a redeploy-target change, not a rebuild.

## What NOT to do

- Do not move off NestJS/TypeORM to fit a specific platform's preferred stack — nothing about the current stack is platform-locked.
- Do not merge the API and worker back into one always-on process purely for deployment convenience — the `PROCESS_ROLE` split exists specifically so cron dispatch (API role) and queue consumption (worker role) don't double-fire across replicas; collapsing them changes that guarantee.
- Do not skip the one-shot `migrate` step in favor of `migrationsRun: true` on the API's own boot — multiple API replicas booting simultaneously would race to apply migrations.

## Open item to resolve before finalizing a target

`GEOSPATIAL_AI_URL` and `SELF_HOSTED_VISION_URL` appear to reference the same physical service in some env examples but are separate config keys — confirm whether crop-scan vision inference and satellite stress-analysis are meant to be the same deployed service or two, before finalizing how many geospatial-ai instances/services to provision.

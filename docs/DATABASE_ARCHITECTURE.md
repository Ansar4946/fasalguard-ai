# Database Architecture Audit

Audited: 2026-08-17. Scope: `services/api` (NestJS backend).

## ORM: TypeORM is the runtime/migration authority — Prisma is inspection-only

This is the single most important correction to internalize before touching the database layer:

- `services/api/prisma.config.ts:4-5` states explicitly: *"Prisma is intentionally inspection-only. TypeORM remains the runtime ORM and the sole migration authority for FasalGuard."*
- `services/api/prisma/schema.prisma` (1628 lines) is a **generated introspection snapshot** produced by `npm run db:inspect` (`prisma db pull`). It is convenient for browsing the whole schema in one file and for `npm run db:studio` (Prisma Studio as a DB browser), but it is not source of truth and can drift — confirmed stale in this pass: it is missing the `password_setup_tokens` table added by migration `1755000024000-password-setup-tokens.ts`, meaning it was pulled before that migration ran. **Re-run `prisma db pull` before relying on the schema.prisma snapshot for anything.**
- The real schema source of truth is:
  - TypeORM entity classes: 28 files under `services/api/src/domain/**/*.entity(ies).ts` (DDD-style — entities live inside each domain module, not in a central `infrastructure/database/entities` folder; that folder only holds `base.entity.ts` and an `index.ts` aggregator that imports every domain's entities into one array for `TypeOrmModule`).
  - Hand-written SQL migrations: `services/api/src/infrastructure/database/migrations/`, 25 files, timestamp-prefixed `1755000000000` → `1755000024000`, applied via a dedicated `typeorm_migrations` tracking table (custom name, set in `data-source.ts` and `database.module.ts`).

## Migration discipline — sound, no drift risk found

- Both TypeORM entry points explicitly set `synchronize: false` (`data-source.ts:16`, `database.module.ts:16`), and `database.module.ts` also sets `migrationsRun: false` — migrations are never auto-applied on app boot, avoiding a race between multiple replicas. No evidence anywhere of `synchronize: true` or ad-hoc `db push` usage.
- 25 linear migrations, clean sequential timestamps, no gaps or edits to already-applied migrations found.
- One seed migration only: `1755000001000-seed-reference-crops.ts` — idempotently seeds 5 reference crops (cotton, wheat, rice, maize, sugarcane) via `INSERT ... ON CONFLICT DO NOTHING`, with a matching reversible `down()`. No fake users/farms/test data seeded anywhere.
- Migration commands (verified they exist in `services/api/package.json`): `migration:run` / `migration:run:prod` / `migration:revert` / `migration:show`, all via the TypeORM CLI against `src/infrastructure/database/data-source.ts` (dev) or the compiled `dist/` equivalent (prod). `docker-compose.yml` runs migrations via a dedicated one-shot `migrate` service (`restart: "no"`), decoupled from app startup — the `api` service only starts after `migrate` completes successfully.

## PostGIS — genuinely used, not simulated

- `CREATE EXTENSION IF NOT EXISTS postgis` is the first statement of the first migration.
- Real `geometry` columns (not JSON blobs standing in for geometry):
  - `farms.boundary geometry(Polygon,4326)`, `farms.centroid geometry(Point,4326)` — both `NOT NULL`, with GiST indexes (`idx_farms_boundary_gist`, `idx_farms_centroid_gist`) and CHECK constraints (`ST_IsValid`, lon/lat range checks).
  - `fields.boundary` / `fields.centroid` — same pattern, plus a partial unique index on active field names.
  - `community_reports.private_location` / `public_area`, `outbreak_clusters.private_centroid` / `public_area`, `satellite_stress_zones.geometry` — all real PostGIS geometry with GiST indexes.
- App-level containment enforcement backed by real DB queries: `ENFORCE_FIELD_WITHIN_FARM` (env-configurable) drives `ST_CoveredBy` checks in `farm-management.service.ts` (`assertFieldContainedByFarm`, called before every field create/update, and before a farm boundary update that would orphan an existing field).
- `docker-compose.yml`'s Postgres healthcheck explicitly verifies the `postgis` extension is installed before reporting healthy (`postgis/postgis:17-3.5-alpine` image).
- Verify in any new environment with `SELECT PostGIS_Version();` before first deploy, per AGENTS.md Phase 19.

## Full model inventory (~65 tables, grouped by domain)

**Identity/access**: `users`, `farmer_profiles`, `expert_profiles`, `consents`, `devices`, `auth_sessions`, `device_tokens`, `notification_preferences`, `password_setup_tokens`.

**Farm digital foundation**: `crops`, `crop_varieties`, `farms`, `fields`, `crop_cycles`.

**Observations/intelligence**: `satellite_captures`, `satellite_layers`, `satellite_statistics`, `satellite_stress_zones`, `satellite_anomaly_assessments`, `field_health_scores`, `weather_snapshots`, `weather_forecasts`, `crop_weather_rules`, `weather_risk_assessments`, `field_inspections`, `crop_scans`, `scan_images`, `image_quality_results`, `model_versions`, `model_predictions`, `diagnoses`, `diagnosis_alternatives`, `follow_up_questions`, `follow_up_answers`, `ai_interactions`, `severity_rulesets`, `severity_assessments`, `field_risk_rulesets`, `field_risk_assessments`.

**Decisions/action/review**: `knowledge_articles`, `guideline_sources`, `treatment_guidelines`, `guideline_approvals`, `action_plans`, `action_plan_steps`, `farmer_tasks`, `expert_reviews`, `expert_assignments`, `consultations`, `consultation_messages`, `case_status_history`.

**Community/delivery/ops**: `outbreak_settings`, `community_reports`, `community_verifications`, `outbreak_clusters`, `outbreak_members`, `regional_advisories`, `notifications`, `notification_deliveries`, `assistant_conversations`, `assistant_messages`, `voice_note_metadata`, `mutation_receipts`, `sync_changes`, `media_assets`, `generated_reports`, `analytics_events`, `integration_usage`.

**Farm-brain / digital-twin (AI intelligence layer)**: `farm_incidents`, `farm_interventions`, `farm_verifications`, `farm_brain_runs`, `farm_brain_run_evidence`, `farm_brain_tool_calls`. *(Note: `docs/architecture/DATABASE_GAPS.md` proposes "incidents"/"ai_runs" tables as future work — those already exist under these names. That doc is stale on this point and should be reconciled, not treated as current-state.)*

**Commerce/org (B2B/pilot layer)**: `organizations`, `pilot_users`, `subscriptions`, `subscription_payments`, `user_feedback`.

**Reference/system**: `spatial_ref_sys` (PostGIS system table), `typeorm_migrations`.

## Conventions

- `created_at` / `updated_at` (`timestamptz DEFAULT now()`) on virtually every table.
- Optimistic concurrency: `version int DEFAULT 1` on almost every table, incremented on every write (`updated_at=now(), version=version+1`), consistently in service-layer SQL.
- Soft delete (`deleted_at`) on top-level entities: `users`, `farms`, `fields`, `crop_cycles`, `devices`, `device_tokens`, `farmer_tasks`. Child/evidence tables (scans, diagnoses, satellite data, etc.) are treated as immutable audit records and rely on cascade from a soft-deletable parent rather than their own soft delete.

## Ownership / tenancy model

- No org-wide multi-tenant scoping on the core farm data path. Ownership is strictly user-scoped: `farmer_profiles.user_id` → `farms.farmer_id` → `fields.farm_id`. Every user-owned table carries `user_id`/`owner_id` or joins back through this chain (`crop_scans.owner_id`, `farmer_tasks.user_id`, `media_assets.owner_id`, `field_inspections.user_id`, `assistant_conversations.user_id`, `mutation_receipts.user_id`, `sync_changes.user_id`, `generated_reports.owner_id`).
- `organizations` / `pilot_users` / `subscriptions` form a separate, loosely-joined B2B/pilot layer — not enforced as a tenant boundary anywhere in the farm/scan/diagnosis path.

## Cascade rules — worth knowing before writing an account-deletion flow

- `users` → cascades into most owned child data (`farmer_profiles`, `devices`, `auth_sessions`, `assistant_conversations`, etc.).
- `users` → **restricted** into tables representing authoritative history where the user acted as expert/reviewer (e.g. `consultations` as expert, media assets referenced elsewhere).
- `farmer_profiles` → `farms` is `ON DELETE RESTRICT`. Combined with the `users`→`farmer_profiles` cascade, **a user with any farms currently cannot be hard-deleted** — the cascading delete of their `farmer_profiles` row will fail on the FK from `farms`, rolling back the whole delete. This is a deliberate safety rail against orphaning farm data, but it means a future "delete my account" flow needs an explicit farm-deletion step first, or it will surface as an unexplained transaction failure.
- `farms`/`fields`/`crop_scans`/`diagnoses` cascade down to their children (`action_plans`, `scan_images`, `diagnosis_alternatives`, `expert_reviews`, severity/follow-up children) consistently.

## Known defect found during this audit (P1, not P0 security — functional bug)

`services/api/src/domain/crop-scans/crop-scan.service.ts:129` — the raw-SQL ownership check `ownedField()` joins `farms f ... farmer_profiles fp ON fp.id = f.farmer_profile_id`. **The actual column on `farms` is `farmer_id`**, not `farmer_profile_id` (confirmed in `migrations/1755000000000-initial-geospatial-schema.ts:38` and the current `schema.prisma`). `farmer_profile_id` does not exist anywhere in the schema. This query will throw a Postgres "column does not exist" error at runtime every time a farmer creates a crop scan with a `fieldId` set (`crop-scan.service.ts:29-30` calls `ownedField()` whenever `dto.fieldId` is present) — i.e., **field-linked crop scan creation is currently broken**. Not a security bug (fails closed with an error rather than bypassing the check), but should be fixed before this path is exercised, with a regression test added since raw-SQL ownership checks have no compile-time column-name safety net.

## Production readiness checklist (per AGENTS.md Phase 19)

- [x] Migrations decoupled from app boot (dedicated `migrate` compose service)
- [x] `synchronize: false` everywhere
- [x] Connection via `DATABASE_URL`, `DATABASE_SSL` toggle present, Joi-validated as required
- [ ] Verify `SELECT PostGIS_Version();` succeeds against the actual target production database before first deploy
- [ ] Fix `crop-scan.service.ts:129` column-name bug before enabling field-linked crop scan creation in production
- [ ] Re-run `prisma db pull` to refresh the stale `schema.prisma` snapshot if it's going to be used as a reference (it is inspection-only, not required for runtime)

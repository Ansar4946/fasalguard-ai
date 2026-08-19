# Impact / Outcome Tracking Engine

**Date:** 2026-08-19
**Status:** Real, persisted, unit-tested. Activates two previously dead tables (`farm_interventions`, `farm_verifications`) as the real action/outcome ledger, rather than inventing a parallel event-tracking system.

## What this closes

Before this work, `farm_incidents` was write-once: `createIncident` (Farm Brain's confirmed tool call) inserted a row and nothing ever updated it again. `resolved_at` existed in the schema since the original digital-twin migration but had never been set by any code path. `farm_interventions` and `farm_verifications` — tables purpose-built for action tracking and follow-up verification, and already read by `FarmDigitalTwinService`'s own timeline query (`INTERVENTION`/`RECOVERY_CHECK` event types) — had zero writers anywhere in the codebase.

This work gives both tables real writers, adds the handful of outcome columns that had no existing home, and wires a genuine "an incident can actually be resolved" path for the first time.

## Lifecycle timestamps — what's real and where each comes from

| Field | Source | Notes |
|---|---|---|
| `detectedAt` | `farm_incidents.detected_at` | Already real (set at `createIncident`). |
| `notifiedAt` | `notifications.created_at`, joined via new `notifications.incident_id` | Not duplicated onto the incident — derived by join so there's one source of truth. |
| `acknowledgedAt` | `notifications.read_at`, same join | Reuses the notification-read signal that already existed (`NotificationService.read()`) — a farmer opening the alert about an incident *is* acknowledgement; no new column needed. |
| `actionCreatedAt` | `farm_interventions.created_at` | Set when a Farm Brain tool call that creates a task (`createInspectionTask`/`scheduleFollowUp`/`requestFarmerPhoto`) is linked to the incident that triggered the same investigation run. |
| `actionStartedAt` | `farm_interventions.started_at` | Set by the new farmer-triggered `POST /farms/:farmId/interventions/:id/start` — a real action, not inferred. |
| `actionCompletedAt` | `farm_interventions.completed_at` | Mirrors `farmer_tasks.completed_at` — set as a best-effort side effect wherever a task is marked COMPLETED (`SyncService.completeTask`, `NotificationService.updateTask`). |
| `followUpAt` | `farm_verifications.observed_at` | Set when a farmer or expert records a real, evidence-backed follow-up. |
| `resolvedAt` | `farm_incidents.resolved_at` | Set for the first time ever, when a follow-up reports `IMPROVED`. |

## Outcome deltas

`initialVegetationScore`/`initialAffectedAreaHectares` are captured once, at `createIncident` time, from the field's latest `field_health_scores.score` and the latest completed satellite capture's stress-zone area (`ST_Area(geometry::geography)` — real PostGIS geometry, not a fabricated number). `followUpVegetationScore`/`followUpAffectedAreaHectares` are captured identically at follow-up time via the shared `captureFieldSnapshot()` helper (`services/api/src/domain/impact/incident-snapshot.ts`), so the two are honestly comparable. Both are `null`, not zero, when there is genuinely no underlying satellite/health evidence yet.

`followUpRiskScore` is sourced from the most recent real `field_risk_assessments.score` for the field at follow-up time (normalized from its native 0–100 scale to the 0–1 scale `farm_incidents.confidence` already uses at detection) — not a fabricated re-score.

`farmerConfirmed`/`expertConfirmed` are tri-state booleans (`null` = not yet asked/answered), set via `POST /farms/:farmId/incidents/:id/confirm` (farmer) and `POST /admin/incidents/:id/expert-confirm` (Admin/SuperAdmin).

## The `time_to_detection` reframe

FasalGuard has no independent ground truth for when a crop problem actually began in the field — only for when its own pipeline started investigating. `time_to_detection` is therefore measured as **investigation-start → incident-created latency** (`farm_brain_runs.created_at` → `farm_incidents.detected_at`, correlated via the new `farm_incidents.investigation_run_id`), not real-world onset-to-detection. This is stated explicitly in every `/admin/impact` response's `policy.note` — it is not silently mislabeled as something it isn't.

## Never claims crop loss prevented

`risk_reduction` (avg `confidence − follow_up_risk_score`) and `affected_area_change` (avg `follow_up_affected_area_hectares − initial_affected_area_hectares`) are directional, model- and satellite-derived signals comparing a before/after snapshot. They are **not** agronomic loss verification and are never presented as "crop loss prevented" — enforced by an explicit `policy.neverClaimsLossPrevented: true` flag and accompanying note on every `/admin/impact` response, per the project's standing anti-fabrication rule.

Every rate (`taskCompletionRate`, `incidentResolutionRate`, `followUpCompletionRate`, `confirmedAlertRate`) is reported alongside its own `sampleSize`, so a rate computed from a handful of incidents is visibly low-confidence rather than presented with false authority. `confirmedAlertRate`'s denominator is farmer *responses* (confirmed or disputed), not all incidents — silence is not counted as disagreement.

## New endpoints

- `POST /farms/:farmId/incidents/:id/confirm` — farmer confirms/disputes an incident.
- `POST /farms/:farmId/incidents/:id/follow-up` — records a real, evidence-backed follow-up (requires a crop scan, satellite capture, or field inspection the caller actually owns); transitions the incident to `RESOLVED` (on `IMPROVED`) or `ESCALATED` (on `WORSENED`).
- `POST /farms/:farmId/interventions/:id/start` — farmer marks a recommended action as started.
- `GET /farms/:farmId/impact-summary` — real, per-farm season impact summary for the farmer.
- `GET /admin/impact` — real, org-wide outcome metrics (excludes `is_test_account`).
- `POST /admin/incidents/:id/expert-confirm` — Admin/SuperAdmin expert review of an incident.
- `GET /crop-scans?fieldId=` — lists a farmer's own diagnosed crop scans for a field, used to populate the follow-up evidence picker.

## Frontend

`/admin/impact` (judge-facing) and a "Farm Incidents" panel on each farm's detail page (`components/farms/detail/farm-incidents-panel.tsx`, replacing the previous hardcoded "No alerts yet" placeholder) — showing active incidents with real confirm/dispute actions and a follow-up form backed by the farmer's own recent crop scans.

## Verification performed

- `incident-lifecycle.service.spec.ts` (7 tests) — confirm/expert-confirm set the right columns; a follow-up with no evidence reference is rejected; a follow-up whose evidence doesn't belong to the caller is rejected; `IMPROVED` resolves the incident and sets `resolved_at`; `WORSENED` escalates without setting `resolved_at`.
- `impact-analytics.service.spec.ts` (3 tests) — honest all-null/zero shape when nothing has been persisted; correct rate/sample-size computation from real counts; `mySeasonSummary` correctly scoped to one farmer and one farm.
- Full existing backend unit suite re-run after every touched shared file (`farm-brain.service.ts`, `notification.service.ts`, `sync.service.ts`, `farm-digital-twin.service.ts`, `crop-scan.service.ts`) — no regressions.
- `tsc --noEmit` and a clean `eslint` pass across the whole backend and frontend.

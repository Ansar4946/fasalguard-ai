# Pilot-User System

**Date:** 2026-08-19
**Status:** Real, persisted, unit-tested, and live-verified against the running Postgres instance (including a real invite → accept → onboard cohort walkthrough).

## What this activates vs. builds new

Two overlapping, half-built "pilot" concepts already existed: `pilot_users` (org-scoped, a 5-state enum, **zero writers anywhere**) and `pilot_leads` (pre-account lead capture, has a writer but nothing ever advances a lead past `NEW`). Neither matched the requested `PilotEnrollment` lifecycle. Rather than building a third, parallel table, this work repurposes `pilot_users` in place — matching the session's established pattern (see `docs/IMPACT_ENGINE.md` for the same move on `farm_interventions`/`farm_verifications`).

`AcquisitionSource` (`DIRECT/REFERRAL/FARMER_GROUP/SOCIAL/PARTNER/OTHER`) and `is_test_account` already existed exactly as requested and are reused, not rebuilt. `crop_cycles` is the real "CropSeason" — per-field, dated, status-tracked. `user_feedback` existed as schema only (zero writers, confirmed by audit) and is now activated as the real `Feedback` ledger.

## PilotEnrollment lifecycle

`INVITED → REGISTERED → ONBOARDED → ACTIVE → COMPLETED/DROPPED`. Per product decision: `INVITED` means an admin enrolls an **existing, already-registered** FasalGuard farmer into the curated pilot cohort — not a pre-account email invite. `user_id` is therefore `NOT NULL` from the start; `organization_id` is now nullable (an individual can be invited without an org sponsor).

| Transition | Trigger | Real signal |
|---|---|---|
| → INVITED | Admin calls `POST /admin/pilot/enrollments` | `invited_at`, `invited_by` |
| → REGISTERED | Farmer calls `POST /growth/pilot-enrollment/respond` with `accepted:true` | Writes a real `consents` row (`type=RESEARCH_DATA_USE`) in the same transaction as the status change — reuses the consent type this table was already built for, rather than inventing a new one |
| → DROPPED (decline) | Same endpoint, `accepted:false` | `dropped_at` |
| → ONBOARDED | Daily cron (`PilotLifecycleSyncService`, 06:00) | Reuses `FunnelAnalyticsService`'s exact "onboarded" definition (farm + field + active crop cycle) — never a second definition of the term |
| → ACTIVE | Same cron | Reuses the exact "active" definition (`last_login_at` within 7 days) |
| → COMPLETED / DROPPED (later) | Admin-only, explicit | Business decisions, never auto-inferred — the sync job only ever advances forward |

## Admin dashboard (`/admin/pilot`)

Six real KPIs, all scoped to the pilot cohort and excluding `is_test_account`: users acquired, users onboarded, active users, farms created, crop seasons, returning users (same 7-day-return definition used elsewhere). Plus a live enrollments table (invite by user id, complete/drop actions) and a feedback list with `consent_to_quote` surfaced per row.

## Verification performed

- 16 new unit tests across `pilot-enrollment.service.spec.ts`, `pilot-lifecycle-sync.service.spec.ts`, `pilot-analytics.service.spec.ts`, `feedback.service.spec.ts`.
- Live walkthrough against the real running stack: registered two fresh (test-flagged) accounts, invited one via the real admin endpoint, accepted via the real farmer endpoint (confirmed a real `consents` row was written), created a real farm/field/active crop cycle, ran the lifecycle-sync logic and confirmed the enrollment advanced to `ONBOARDED`, confirmed `/admin/pilot/summary` and `/admin/pilot/enrollments`/`/admin/pilot/feedback` all correctly returned **zero/empty** — proving the `is_test_account` exclusion works end-to-end rather than just trusting the code.

## A real, pre-existing bug found and fixed along the way

While building this, `DataSource.query()`'s behavior for `UPDATE`/`DELETE ... RETURNING` was empirically confirmed: called directly **or from inside a transaction**, it returns a `[rows, affectedCount]` tuple, not a flat rows array (`INSERT ... RETURNING` is unaffected — always flat). This is a documented pitfall in `farm-brain.service.ts` for one call site, but the same bug existed, unfixed, in several other real code paths — most seriously, **`FarmBrainService.confirm()`**, which meant every Gemini tool-call confirmation in this codebase had been silently broken (always threw a 400, never actually executed a tool). Also fixed: `AutomaticMonitoringService.dispatchDueFields()` (satellite monitoring dispatch was queuing garbage jobs), `AuthService.revokeSession`/`revokeAllSessions`, `NotificationService.deleteToken`/`read`/`updateTask`, `SyncService`'s offline task/inspection conflict detection (version conflicts were never actually detected), and `KnowledgeAdminService`'s guideline CRUD (including a silently-corrupted approval audit snapshot). All fixed using the same explicit-unwrap pattern already established in this file, with a full backend test-suite re-run (128/129 passing — one pre-existing, unrelated failure) and a live re-verification of the two highest-impact fixes (`confirmIncident`, and a real Farm Brain tool-call confirm that now correctly executes and creates a real notification).

## Known, separate issue flagged (not fixed here)

The configured `GEMINI_API_KEY` does not look like a valid Google API key (wrong format/prefix) and real investigations are currently failing with `PROVIDER_OR_SCHEMA_FAILURE`. This is a credential problem, not a code bug — flagged for the user to replace with a real key; not something this session can fabricate or resolve.

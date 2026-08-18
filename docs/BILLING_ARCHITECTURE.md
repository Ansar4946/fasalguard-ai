# Billing Architecture

**Date:** 2026-08-18
**Status:** Real, persisted, enforced. No payment gateway is integrated — see "Why manual verification" below. Every number this system reports is derived from real rows; an unseeded database honestly returns zero, never a placeholder.

This document covers the subscription/entitlement/payment system built in response to `docs/HACKATHON_WINNING_GAP_ANALYSIS.md` item #2 ("Real subscription/payment architecture"). It extends, rather than replaces, the pre-existing `organizations`/`pilot_users`/`subscriptions`/`subscription_payments`/`user_feedback` schema from migration `1755000023000-business-viability-evidence.ts`, which already had a real (but previously unused) `/analytics/viability` endpoint reading from it.

## Why manual verification, not a payment gateway

No payment processor (Stripe, Razorpay, PayU, etc.) is configured anywhere in this codebase or its environment files — confirmed by the gap analysis audit. Rather than fabricate a checkout flow that doesn't actually process money, this system implements a real, honest **manual-verification upgrade flow**, which is how many regional SaaS products in Pakistan operate (matching the product's existing `+92` phone-based farmer identity): a farmer submits a plan-upgrade request naming a manual payment channel (bank transfer, JazzCash, EasyPaisa) and their own transaction reference; an admin cross-checks that reference against their real bank/mobile-money statement and explicitly verifies it before the plan activates.

This is not a stub. The `subscription_payments.status='PAID'` row is only reachable through an authenticated Admin/SuperAdmin action, and the database enforces via `CHECK` constraint that a `PAID` row must carry `paid_at`, `verified_at`, and `verification_source` — the frontend can never mark its own payment successful.

## Schema

- **`subscription_plans`** — the plan catalog. `code` (PK), `name`, `price_minor` (bigint, nullable for custom/contact-sales plans), `currency`, `billing_interval` (`MONTHLY`/`CUSTOM`), `limits` (jsonb — the entitlement source of truth), `is_active`, `sort_order`.
- **`subscriptions`** — now owned by *either* a `user_id` (individual farmer self-serve) *or* an `organization_id` (pilot/NGO/co-op, reusing the pre-existing `organizations`/`pilot_users` tables), enforced by `CHECK ((user_id IS NOT NULL)::int + (organization_id IS NOT NULL)::int = 1)`. Every registered farmer gets a real `FREE`/`ACTIVE` row inserted in the same database transaction as their registration (`auth.service.ts` `register()`).
- **`subscription_payments`** — one row per payment attempt. `status`: `PENDING → PAID | FAILED | CANCELLED`, or `PAID → REFUNDED`. `plan_code` records which plan the payment is for. `verified_by_user_id` + `verification_source` + `notes` record who verified it and why.
- **`invoices`** — a billing record/receipt tied to a payment (not a payment-gateway artifact, since none exists). Mirrors payment status.
- **`billing_events`** — an append-only audit log (`SUBSCRIPTION_CREATED`, `UPGRADE_REQUESTED`, `PAYMENT_VERIFIED`, `PAYMENT_REJECTED`, `PAYMENT_REFUNDED`, `SUBSCRIPTION_ACTIVATED`, `SUBSCRIPTION_DOWNGRADED`, `ORGANIZATION_PLAN_ASSIGNED`). Service code never `UPDATE`s or `DELETE`s these rows.
- **`usage_records`** — a periodic, derived snapshot of real usage counts (written whenever `GET /billing/usage` is called). **Not** the enforcement source of truth — see below.

## Plan matrix

| Plan | maxFarms | maxActiveCropSeasons | geminiAnalysesPerMonth | satelliteMonitoring | advancedReports | maxTeamMembers | Price (PKR/mo) |
|---|---|---|---|---|---|---|---|
| `FREE` | 1 | 2 | 3 | false | false | 1 | 0 |
| `FARMER_PRO` | 3 | 6 | 30 | true | true | 1 | 999 |
| `FARM_BUSINESS` | 15 | 40 | 150 | true | true | 5 | 4,999 |
| `COOPERATIVE` | unlimited | unlimited | 1,000 | true | true | unlimited | custom — admin-assigned, not self-serve |

These are placeholder product/pricing figures pending a real business decision, stored the same way the pre-existing `1755000001000-seed-reference-crops.ts` migration seeds reference data — they are product configuration, not measured or reported data, so there is no fabrication concern. They can be changed by editing `subscription_plans.limits`/`price_minor` directly, with no code deploy required.

## Entitlement enforcement

`EntitlementService.getActivePlan(userId)` resolves, in order: the user's own active subscription → their pilot organization's active subscription (via `pilot_users`) → a hardcoded `FREE` fallback (for accounts that predate this migration and haven't hit a billing endpoint yet, which lazily backfills a real `FREE` row on first access via `BillingService.ensureSubscription`).

**Usage counts are always re-derived live from authoritative tables** (`farms`, `crop_cycles`, `farm_brain_runs`) at the moment of enforcement — never from `usage_records`, which is a display/audit cache only. This avoids any drift between what's enforced and what's real.

| Limit | Enforced at | Notes |
|---|---|---|
| `maxFarms` | `FarmManagementService.createFarm()` | Counted inside the existing creation transaction |
| `maxActiveCropSeasons` | `FarmManagementService.createField()` | Only on net-new field+season creation; `updateField`'s in-place crop-cycle replacement is exempt since it doesn't increase the active count |
| `geminiAnalysesPerMonth` | `FarmBrainService.start()` | Counted *after* the existing dedup-by-input-hash check, so a deduplicated (not a new) investigation never wrongly consumes quota |
| `satelliteMonitoring` | `AutomaticMonitoringService.dispatchDueFields()` cron | Gated in the dispatch query itself (own plan → org plan → deny) — a plan change takes effect on the very next 10-minute tick, no backfill job needed |
| `advancedReports` | `ReportService.assertScope()` | Gates `WeeklyActionPlan` report generation |
| `maxTeamMembers` | **Not enforced** | This codebase has no multi-user/collaborator concept anywhere (`farmer_profiles.user_id` is `UNIQUE` — one owner per farm chain). The limit is defined in plan config and returned by `/billing/plans`/`/billing/usage` for forward compatibility, but there is nothing to enforce it against yet. Building a team/collaborator feature is out of scope here. |

A blocked action returns `403 { code: 'ENTITLEMENT_LIMIT_REACHED', metric, plan, limit }`.

## API

**Farmer-facing** (`/api/v1/billing/*`):
- `GET /plans` — public, no auth required (so a pricing page can render pre-login).
- `GET /subscription` — the caller's subscription, resolved plan, and last 10 payments/invoices.
- `GET /usage` — live usage vs. plan limits for the current calendar month (also upserts `usage_records`).
- `POST /upgrade-request` — `{ planCode, provider, providerPaymentReference, notes? }` → creates a `PENDING` payment + `ISSUED` invoice. Rejects with `PLAN_REQUIRES_MANUAL_ASSIGNMENT` for plans with no self-serve price (`COOPERATIVE`).
- `POST /upgrade-request/:paymentId/cancel` — farmer cancels their own still-`PENDING` request.

**Admin-facing** (`/api/v1/admin/billing/*`, `@Roles(Admin, SuperAdmin)`):
- `GET /revenue` — total/monthly revenue by currency (never summed across currencies), MRR-if-applicable, paying-users count, plan distribution, successful/failed/pending/refunded payment counts. See "Anti-fabrication" below.
- `GET /payments?status=` — review queue.
- `POST /payments/:id/verify` — the only path to `PAID`. Activates the subscription's plan.
- `POST /payments/:id/reject` — `{ reason }` → `FAILED`.
- `POST /payments/:id/refund` — `{ reason }` → `REFUNDED`, subscription reverts to `FREE`.
- `POST /subscriptions/organization` — assigns/updates an org-scoped subscription (for admin-onboarded `COOPERATIVE` pilot customers, reusing the pre-existing `organizations` table).

## Admin revenue dashboard

`app/(admin)/admin/billing` renders **only** the real values returned by the two endpoints above. Zero/empty states render plainly (`₨0 revenue`, `0 paying users`) rather than being hidden or replaced with placeholder numbers — this deliberately avoids the mistake flagged in the gap analysis, where `government/impact` rendered hardcoded mock numbers disconnected from its real backend.

## Anti-fabrication

Mirroring `docs/BUSINESS_EVIDENCE.md`'s existing principle: if no real evidence exists, the API returns zero, never a substituted sample number. `AdminBillingService.revenue()` follows the same discipline as the pre-existing `AnalyticsService.viability()` — raw parameterized SQL over real tables, currencies kept as a `Record<currency, amount>` map and never summed, and revenue only counts payments with `status='PAID' AND verified_at IS NOT NULL`.

**Resolved**: `users.is_test_account` (added by the growth-features migration, `docs/GROWTH_FEATURES.md`) now excludes flagged accounts from every `revenue()` aggregate — `policy.excludesTestAccounts: true`. Org-scoped (pilot/cooperative) subscriptions have no `user_id` and are never excluded by this flag, since the flag only applies to individual accounts.

## Verification performed

- `entitlement.service.spec.ts`, `admin-billing.service.spec.ts` — unit tests (hand-rolled `db.query`/`db.transaction` stubs, matching this codebase's existing `analytics.service.spec.ts` pattern).
- `billing.integration-spec.ts` — full-stack test against a real Postgres instance: register → real `FREE` subscription exists → create farms up to the limit → next one 403s → submit an upgrade request → confirm it stays `FREE` until an admin verifies → admin verifies → subscription is now `FARMER_PRO` → `/admin/billing/revenue` reflects the real payment.
- `auth.integration-spec.ts` extended to assert registration creates a real `FREE` subscription row.
- `farm-management.integration-spec.ts` updated to put its test farmer on a high-limit plan, since that suite intentionally creates several farms for one owner to test ownership/geometry behavior unrelated to billing.

# Growth Features

**Date:** 2026-08-18
**Status:** Real, persisted, verified live. Every funnel stage below is derived from real rows; an unseeded database honestly returns zero.

This document covers the acquisition/growth layer built on top of the billing/entitlement system (`docs/BILLING_ARCHITECTURE.md`) and in response to the hackathon gap analysis (`docs/HACKATHON_WINNING_GAP_ANALYSIS.md`) items #14 (referral/invite system), #15 (weekly AI farm report — partially addressed, see below), #16/#17 (pilot management/admin dashboard).

## Design principle: derive, don't duplicate

Almost every funnel stage is computed live from tables that already existed or that the billing work just built (`users`, `farms`, `crop_cycles`, `farm_brain_runs`, `subscription_payments`) — matching the same never-fabricate discipline as `AnalyticsService`/`AdminBillingService`. Only four things genuinely needed new storage, because no other real signal produces them: landing-page views, pilot leads, referral attribution, and lifecycle-email dedup.

## The ACTIVATED milestone — no roadmap feature exists

The requested funnel is account → farm → crop → **roadmap** → monitored → risk → action → notified. This codebase has no crop-roadmap generation feature anywhere (confirmed by two independent repo-wide searches, in both the original gap analysis and again during this work). Per an explicit product decision, **ACTIVATED = account + farm + an active crop cycle + the first COMPLETED Gemini Farm Brain investigation** — Farm Brain is the closest real analog to a "roadmap," since it's the product's actual Gemini-powered farm intelligence feature. This is documented in the `/admin/funnel` response itself (`policy.activatedDefinition`) so it's never silently overstated.

## Schema (migration `1755000027000-growth-funnel.ts`)

- `users.is_test_account boolean DEFAULT false` — every new funnel/revenue query excludes flagged accounts. `AdminBillingService.revenue()` was retrofitted to use this too, closing the gap `docs/BILLING_ARCHITECTURE.md` had explicitly flagged as unresolved.
- `farmer_profiles.acquisition_source`, `.referred_by_user_id`, `.referral_code` — captured at registration. Every farmer gets a real, unique referral code the moment they register (backfilled for pre-existing rows in the same migration).
- `pilot_leads` — the "Join Free Pilot" lead-capture form target. Deliberately **not** the pre-existing `pilot_users`/`organizations` tables, which require an already-registered `user_id` and non-null `consented_at`/`evidence_reference` — built for an already-onboarded pilot cohort, not a pre-account lead.
- `landing_page_views` — one row per calendar day, upserted. A page-view proxy, not a unique-visitor count, and not bot-filtered — documented explicitly rather than presented as more precise than it is.
- `lifecycle_email_log` — dedup guard for one-time/weekly lifecycle emails. Deliberately has no uniqueness constraint (unlike `billing_events`), because `WEEKLY_SUMMARY` must legitimately recur; one-time types (`ONBOARDING_INCOMPLETE`, `ROADMAP_READY`, `INSIGHT_READY`) are guarded by an application-level existence check instead.

## Referral system

- Every registered farmer gets a real `referral_code` (8-char, generated via `generateReferralCode()`).
- `POST /auth/register` (via the onboarding flow) accepts an optional `referralCode`, resolved to `referred_by_user_id` **inside the same registration transaction** (`resolveReferrer()` — a plain exported function, not an injectable, specifically so `AuthModule` doesn't need to import `GrowthModule`, which itself imports `AuthModule` for `EMAIL_PROVIDER` — avoiding a circular module dependency).
- `GET /growth/referral` returns the caller's real code and a real invite count (`count(*) WHERE referred_by_user_id=$1`).
- Frontend: the landing page and `/join` capture `?ref=`/`?src=` query params into onboarding state; a referral card on the farmer dashboard shows the real link and real invite count with a copy button.
- **Verified live**: registered a referrer, fetched their code, registered a second farmer with that code, confirmed `acquisition_source='REFERRAL'` and `referred_by_user_id` set correctly, and confirmed the referrer's invite count incremented from 0 to 1.

## Pilot leads ("Join Free Pilot")

`POST /growth/pilot-leads` (public, rate-limited) — name, email, phone (optional), country, farm size, main crop, number of farms. Nothing else is asked. Visible in the admin funnel (`funnel.pilotLeads`) and manageable later via `pilot_leads.status` (`NEW → CONTACTED → CONVERTED/DECLINED`) — no admin UI for status transitions was built yet (out of scope for this pass; the data is real and queryable).

## Upgrade trigger — wired to real entitlement data, not a blanket banner

The pre-existing static "Upgrade to Pro" banner in `farmer-shell.tsx` (disconnected, no click handler, always visible) was replaced with `<UpgradeNudge />`, which fetches `GET /billing/usage` and only renders when the caller is on `FREE` and genuinely near or at a real limit (≥80% of `maxFarms`/`maxActiveCropSeasons`/`geminiAnalysesPerMonth`). Clicking it goes to `/billing/upgrade`, a real form (plan from `GET /billing/plans`, provider, payment reference) that submits to the real Prompt-1 manual-verification flow — it never claims success; it explicitly states the payment is pending until an admin verifies it.

## Funnel analytics

`GET /admin/funnel` (`@Roles(Admin, SuperAdmin)`) returns, all excluding `is_test_account`:

| Stage | Definition |
|---|---|
| `landingViews` | Sum of `landing_page_views.count` |
| `pilotLeads` | `count(*) FROM pilot_leads` |
| `registered` | `count(*) FROM users WHERE role='FARMER'` |
| `onboarded` | Farmers with ≥1 farm and ≥1 active crop cycle |
| `activated` | Onboarded + ≥1 `farm_brain_runs.status='COMPLETED'` |
| `active7Day` | `last_login_at >= now() - 7 days` |
| `upgradeRequested` | Distinct farmers with ≥1 `subscription_payments` row ever |
| `paid` | Distinct farmers with ≥1 `PAID` + verified payment |

Also returns a real 7-day-return rate (`returned / eligible`, `null` when no one is eligible yet — never a fabricated percentage) and real referral-signup count.

**Verified live**: submitted a real pilot lead and a real landing view, registered farmers via referral, and confirmed `/admin/funnel` reflected all of it — including a real registered count of 33 accumulated across this session's testing, which is itself evidence the numbers are live-computed, not cached or fabricated.

## Lifecycle emails

Five real triggers, each gated by the existing `consents(type='NOTIFICATIONS')` check (same pattern `WeatherAlertService` already used) and an at-most-once (or this-week, for the summary) dedup guard via `lifecycle_email_log`:

| Email | Trigger |
|---|---|
| Account ready | The pre-existing `sendCredentials` email at registration already serves this purpose (passwordless "your account is ready, sign in with email/phone" message) — a separate "Welcome" email was deliberately **not** added on top of it, since sending both would be exactly the spam this feature set was asked to avoid. |
| Onboarding incomplete | Daily cron (`0 9 * * *`): farmers registered 24–72h ago with still no farm |
| Roadmap ready | First `farm_brain_runs.status='COMPLETED'` for a user (hooked into `FarmBrainService.process()`) |
| Insight ready | First `SCREENING_COMPLETE` crop-scan diagnosis (hooked into `CropScanProcessor`) |
| Weekly farm summary | Weekly cron (`0 8 * * 1`), only for farmers with an active crop cycle; skipped entirely if there's nothing real to report (zero pending and zero completed tasks) — never an empty summary |

All five failures are swallowed (best-effort) — an email problem must never break the real product action (a farm-brain investigation, a crop scan, a login) that triggered it.

## Admin funnel dashboard

`app/(admin)/admin/funnel` — same pattern as the billing dashboard (`components/admin/funnel-dashboard.tsx`): a plain async helper with no `setState` inside it, `setState` only in `.then()/.catch()` callbacks, matching this repo's `react-hooks/set-state-in-effect` lint rule. `AdminShell` now has a small Billing/Funnel nav.

## Test-account exclusion

`POST /admin/funnel/users/:userId/test-account` (`{isTestAccount: boolean}`) lets an admin flag/unflag an account. Every funnel and revenue query filters on this — set it for any QA/demo account created during development or judging so it never contaminates real acquisition or revenue numbers.

## Known limitations, stated plainly

- **Landing views** are a page-view proxy, not unique visitors, and are not bot-filtered.
- **7-day return rate** is `null` (not `0%`) until at least one user has been registered for 7+ days — an honest "not enough data" state rather than a misleading zero.
- **Pilot lead status management** (contacted/converted/declined) has no admin UI yet — the data is real and queryable but not yet actionable from the dashboard.
- **Weekly AI farm report** email content is real task-count aggregation (reusing `ReportService`'s existing `WeeklyActionPlan` SQL), not an AI-authored narrative — building Gemini-authored weekly report content was out of scope for this pass.

## Verification performed

- `funnel-analytics.service.spec.ts`, `pilot-lead.service.spec.ts`, `referral.service.spec.ts` — unit tests with hand-rolled `db.query` stubs, matching this codebase's established pattern.
- `growth.integration-spec.ts` — full-stack test against real Postgres: referral attribution + invite-count increment, pilot lead visible in admin funnel, landing-view beacon dedup.
- Live end-to-end verification via `curl` against the running Docker stack: registration with a real referral code, referral count increment, pilot lead submission, landing view, admin funnel numbers reflecting real accumulated state, and all four new frontend routes (`/`, `/join`, `/admin/funnel`, `/billing/upgrade`) rendering successfully through the Next.js dev server with real session cookies.

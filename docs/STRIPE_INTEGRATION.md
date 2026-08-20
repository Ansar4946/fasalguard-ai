# Stripe Payment Integration + Pricing

**Date:** 2026-08-19
**Status:** Real, unit-tested, and live-verified against the running stack with blank (unconfigured) Stripe keys — the honest state until real test-mode keys are provided. No fabricated "connected" status anywhere.

## What this is

A second, auto-verifying `PaymentProvider` (`STRIPE`) sitting **alongside** the existing manual bank-transfer/JazzCash/EasyPaisa channels — not replacing them. Uses Stripe Checkout (hosted, redirect-based): no card data ever touches this backend, built-in 3DS/SCA compliance, and the one shared activation path (`activateSubscription()` in `billing.service.ts`) is used by both manual admin verification and the Stripe webhook, so the two can never diverge in behavior.

## Pricing

The existing ladder (FREE / Farmer Pro ₨999 / Farm Business ₨4,999 / Cooperative contact-sales) stays as the real pricing. Added: annual variants at 10× the monthly price (2 months free) for Farmer Pro and Farm Business, seeded as real rows in `subscription_plans` (`FARMER_PRO_ANNUAL`, `FARM_BUSINESS_ANNUAL`), not a hardcoded frontend discount. `/pricing` is a new, real public marketing page — fetches the real plan catalog rather than hardcoding numbers, so it can never drift from what's actually enforced.

## Honest-until-configured behavior

Every Stripe env var (`STRIPE_SECRET_KEY`, `STRIPE_WEBHOOK_SECRET`, `STRIPE_PUBLISHABLE_KEY`) defaults to blank, exactly like every other provider credential in this codebase. With blank keys (today's real state, live-verified):
- `POST /billing/stripe/checkout-session` → clean `503 PAYMENT_NOT_CONFIGURED`, never a crash or a faked checkout URL.
- `POST /billing/stripe/webhook` → same clean 503.
- `GET /admin/billing/stripe-status` → `{"configured":false,"webhookConfigured":false}`, surfaced as an amber banner on the admin billing dashboard.
- A plan with no `stripe_price_id` set → clean `503 STRIPE_PRICE_NOT_CONFIGURED`, distinct from the "Stripe not configured at all" case.

## To go live

1. Create a Stripe account (test mode first), get `sk_test_...`/`whsec_...`/`pk_test_...`.
2. Set `STRIPE_SECRET_KEY`, `STRIPE_WEBHOOK_SECRET`, `STRIPE_PUBLISHABLE_KEY` in `.env`.
3. In the Stripe Dashboard, create a real Product + recurring Price for each paid plan (Farmer Pro monthly/annual, Farm Business monthly/annual).
4. Paste each real Price id in via the admin dashboard's Pricing Plans section (`components/admin/billing-dashboard.tsx`), or directly via `POST /admin/billing/plans/:code/stripe-price`.
5. Point a Stripe webhook endpoint at `POST /api/v1/billing/stripe/webhook`, subscribed to `checkout.session.completed`, `invoice.paid`, `invoice.payment_failed`, `customer.subscription.deleted`. For local testing, use `stripe listen --forward-to localhost:4000/api/v1/billing/stripe/webhook`.
6. Complete a real test-card checkout and confirm the subscription activates via the webhook, not a client-side redirect (the `success_url` redirect is UX only — activation is only ever driven by the verified server-to-server webhook).

## The one real Nest+Stripe gotcha, handled

Stripe signature verification requires the raw, unparsed request body. `services/api/src/configure-app.ts` registers `express.raw({type:'application/json'})` for `/api/v1/billing/stripe/webhook` specifically, ahead of the global JSON body parser — every other route is unaffected and stays normally JSON-parsed.

## Idempotency

Stripe may redeliver the same webhook event. `checkout.session.completed` inserts a `subscription_payments` row with `provider_payment_reference = session.id`; the real, already-existing `UNIQUE(provider, provider_payment_reference)` constraint makes a duplicate delivery a genuine no-op (caught via Postgres error code `23505`), not a double-activation. Live-verified via a real duplicate-key simulation in `stripe.service.spec.ts`.

## Renewals (`invoice.paid`)

Stripe bills every renewal automatically — it never routes back through Checkout, so `checkout.session.completed` only ever fires once per subscription. Renewals are recorded by a separate `invoice.paid` handler, keyed by `invoice.id` (not `session.id`) for idempotency. That handler explicitly skips `billing_reason === 'subscription_create'`, because that specific invoice is the same first payment `checkout.session.completed` already recorded — without the skip, the two handlers would record the same payment twice under two different reference values, since the unique constraint can't tell they're the same period. A successful renewal also runs through the same shared `activateSubscription()` every other activation path uses, so it correctly recovers a subscription that had drifted to `PAST_DUE` after a failed retry.

## Also fixed along the way

- `docker-compose.yml` was hardcoding `SENTINEL_HUB_CLIENT_ID`/`SECRET` as empty strings instead of `${VAR:-}` — meaning setting them in `.env` had no effect. Fixed to match every other provider credential's interpolation pattern.
- `components/admin/billing-dashboard.tsx` referenced `revenue.policy.note`, a field the backend has never actually returned (always rendered `undefined`) — fixed to match the real response shape and copy.
- **A real credential leak was found and partially remediated**: `services/api/.env.example` had a real Gmail app password committed in plaintext across two commits already pushed to the public GitHub remote. The working-tree file has been scrubbed (blank placeholders, matching every other credential in that file); the user is handling rotation of the Google app password directly. Git history still contains the old value — treat it as compromised regardless of any code fix.

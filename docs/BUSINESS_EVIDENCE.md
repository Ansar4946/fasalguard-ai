# Business viability evidence

FasalGuard business and impact claims must be computed from persisted evidence. UI counters, pitch-deck numbers and demo fixtures are never sources of truth.

`organizations` classifies records as `LIVE`, `PILOT`, `DEMO` or `TEST`. `pilot_users` records consent, onboarding state and an evidence reference. `subscriptions` describe the commercial relationship; revenue is recorded separately in `subscription_payments` and a paid record is valid only when it has a provider payment reference, paid time, verification time and verification source. `user_feedback` preserves attributable feedback while consent to quote is explicit.

Operational evidence remains in the existing normalized tables: farms, satellite captures, Gemini Farm Brain runs, run evidence, incidents, tool-call actions, tasks, notifications and verification events.

`GET /api/v1/analytics/viability` is restricted to NGO, government and administrator roles. It excludes `DEMO` and `TEST` organizations. Paid-customer and revenue figures use `LIVE` organizations only. Revenue is returned in minor units grouped by ISO currency; different currencies are never summed.

Definitions are intentionally conservative:

- onboarded farmer: verified pilot membership with an onboarding timestamp;
- monitored farm: qualifying farm with a satellite capture or completed Gemini investigation;
- Gemini analysis: completed run;
- anomaly investigated: completed run containing persisted satellite-anomaly evidence;
- confirmed incident: incident that advanced beyond detection/investigation;
- action generated: non-rejected mutation proposal persisted in the tool-call ledger;
- completed follow-up: completed AI action-plan task;
- paid customer: live organization with at least one externally verified paid payment.

If no real evidence exists, the API returns zero. It must never substitute sample numbers.

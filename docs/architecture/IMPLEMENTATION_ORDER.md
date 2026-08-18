# XPRIZE Implementation Order

Each stage must pass lint, typecheck, unit/integration tests, migration validation and security review before the next stage.

## P0 — required for the hackathon

1. **Live frontend/API spine**: typed API client, login/session handling, onboarding persistence, farm/field creation and one real dashboard projection. Remove fixture data only from the selected demo journey.
2. **Gemini foundation**: provider interface, server-only configuration, structured schemas, operation-specific model policy, timeouts/retries and fake-provider tests.
3. **AI audit ledger**: additive `ai_runs`, evidence and tool-call migrations with privacy-safe observability.
4. **Incident lifecycle**: canonical incident, evidence and state-transition records linking existing scans, risks, expert review, action plans, tasks and notifications.
5. **Digital-twin snapshot**: authorized field/crop-cycle evidence projection over existing satellite, weather, scan, inspection and outbreak records.
6. **Gemini investigation job**: asynchronous structured reasoning and read-only tool calls; no direct mutation.
7. **Policy gate**: validate evidence references, approved guidelines, confidence and escalation before domain commands run.
8. **One closed-loop cotton flow**: observe real or reproducible evidence, create an incident, request/confirm an action, create a task, submit follow-up evidence and record recovery/status.
9. **XPRIZE evidence telemetry**: real AI executions, incidents, confirmations, tasks, alerts and follow-ups exposed as PII-free aggregates.
10. **Evaluation and demo hardening**: expert-labelled golden cases, failure/offline path, cost quota, deterministic replay and backup demo dataset clearly marked as recorded evidence.

## P1 — strong differentiators

- Voice/photo multimodal investigation in Urdu and English.
- Automated new-evidence trigger from satellite/weather with alert suppression until policy approval.
- Intervention execution and measured recovery comparisons.
- Expert feedback loop and Gemini-versus-specialist evaluation dashboard.
- Farmer explanation cards separating observations, inferences, uncertainty and next action.
- Subscription/entitlement experiment after real usage events exist.

## P2 — post-hackathon

- Multi-provider intelligent routing and automated fallback.
- Nationwide disease forecasting or government-scale simulation.
- Advanced crop-specific temporal models.
- Full offline on-device inference.
- Video consultation, WhatsApp integration and reputation systems.
- Large-scale payment, billing and marketplace features.

## Breaking-change risks

- Replacing Qwen interfaces instead of adding a routing layer.
- Making Gemini output an ORM/write contract.
- Renaming existing statuses or entities used by migrations/tests.
- Backfilling incidents as if historical AI reasoning occurred.
- Changing public outbreak geometry or owner authorization behavior.

## Features not to build before submission

- New microservices for each domain.
- Autonomous pesticide or dosage recommendations.
- Exact disease claims from satellite imagery.
- Nationwide predictive maps without validated data.
- General-purpose agent tools, arbitrary HTTP/SQL execution or auto-executed mutations.
- Payment infrastructure before the real farmer loop works.
- Broad UI redesign unrelated to the closed-loop demonstration.
- Replacing PostgreSQL/PostGIS, NestJS or BullMQ.

## Next Codex prompt

> Implement P0 step 1 only: audit the current frontend fixture repositories and backend authentication/farm endpoints, then add a production-shaped typed API client and connect login, onboarding, farm creation and field creation end to end. Preserve fixture fallback only behind an explicit demo flag. Add contract tests, loading/error/offline states and documentation. Do not implement Gemini yet, do not change database schema, and stop after lint, typecheck, tests and production builds pass.


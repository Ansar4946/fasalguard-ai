# XPRIZE Gap Analysis

## Executive assessment

The repository has unusually strong production foundations for a hackathon, but the implemented product is not yet the proposed autonomous Gemini farm platform. It is currently a collection of capable domain workflows with Qwen-assisted language functions and deterministic engines. The missing value is a coherent, auditable loop connecting observations to incidents, decisions, actions and verified outcomes.

## Goal assessment

### Business viability

Strengths include roles, consent, farm ownership, reports, analytics events, operational deployment assets and privacy controls. Gaps are real frontend/API activation, onboarding-to-owned-farm persistence, subscription/entitlement boundaries, user feedback, cohort/retention telemetry and evidence from real farms. Payments should not be added before the core loop works with real users.

### AI-native operations

Specialist evidence pipelines exist, but no Gemini integration or central orchestrator exists. Qwen prompt flows are isolated by feature. There is no shared AI run ledger, tool-call record, evidence graph, incident reasoner or follow-up verification policy. The present assistant cannot mutate state—which is a sound safety boundary—but it also does not orchestrate the operational loop.

### Category impact

Satellite, weather, crop scans, expert review, outbreaks and notifications can support measurable impact. Today they remain disconnected from a unified incident and outcome model, and the frontend mostly demonstrates fixture data. Consequently the system cannot yet prove that a detected problem led to an action, follow-up measurement and recovery.

## Critical gaps

1. No Gemini SDK, provider, credentials, structured schema or tool calling.
2. No first-class farm digital twin aggregating time-series evidence by field/crop cycle.
3. No canonical incident lifecycle linking observation, inference, recommendation, task, alert and verification.
4. No unified `ai_run` audit record with evidence/tool provenance and schema versions.
5. No intervention/treatment execution and outcome model.
6. No explicit verification scan/follow-up measurement relationship.
7. Frontend screens do not consume the API, authentication or queues.
8. Most configured production providers require credentials/model assets; assistant, speech, storage and push use development defaults locally.
9. No Gemini-specific safety/evaluation tests, tool authorization tests or replayable golden cases.
10. Impact analytics are limited and cannot yet compute closed-loop agronomic outcomes.

## Risks

- **XPRIZE narrative risk:** calling the current system Gemini-powered would be inaccurate.
- **Demo integrity risk:** fixture dashboards can diverge from real backend state.
- **Provider conflict:** Qwen currently owns assistant/follow-up responsibilities that overlap the intended Gemini role.
- **Agronomic safety:** demo rules are explicitly unverified and must never be presented as approved recommendations.
- **Data migration:** introducing incidents and unified observations requires backfilling references without altering historical predictions.
- **Cost/quota:** multimodal Gemini plus Sentinel processing can create uncontrolled usage without budgets and deduplication.
- **Privacy:** a central reasoning payload can accidentally include exact geometry, PII or raw farmer content unless constructed through an allowlisted evidence projection.
- **Latency:** synchronous orchestration across satellite, vision and LLM providers would exceed interactive request budgets.

## Existing fake, mock or incomplete paths

- Frontend fixture data and `mockDiagnosisRepository`.
- Browser-local onboarding and crop-scan state.
- `FakeAssistantProvider` and `FakeSpeechProvider`, selected by development defaults.
- Mock object storage in development/tests.
- Development push and OTP adapters; production OTP is a fail-closed placeholder.
- Self-hosted vision/geospatial path requires real production inference model assets and validation.
- Demo-unverified weather, severity, outbreak and early-warning rulesets.

These paths are appropriate for tests or a clearly labelled demo. They must be observable and fail closed in production.

## Missing configuration for the target

At minimum: Gemini provider mode, Google AI/Vertex project and region selection, credential injection mechanism, model IDs, per-operation model policy, request timeout, retry budget, token/cost budget, structured schema versions, safety settings and feature flags. Production should prefer workload identity/service-account injection, not a browser API key.

## Missing tests

- Gemini structured-output contract and malformed-output rejection.
- Tool allowlist, authorization and dry-run/confirmation behavior.
- Evidence redaction and exact-geometry exclusion.
- Orchestrator idempotency/replay and partial-provider failure.
- Incident state-machine and intervention verification.
- Golden multimodal cases evaluated against expert labels.
- Frontend/backend contract and end-to-end farmer journey.
- Cost, timeout and queue-load tests.

## Potential dead or disconnected code

No code should be deleted from this audit alone. Candidates for later proof include fixture-only frontend repositories, duplicate Qwen assistant/follow-up prompt machinery after Gemini migration, the legacy `devices.push_token` field alongside `device_tokens`, and modules exposed in navigation but not backed by live API data. Confirm runtime use before removal.


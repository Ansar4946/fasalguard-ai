# AI Execution Telemetry

**Date:** 2026-08-19
**Status:** Real, persisted, verified live. `ai_runs` reports genuinely zero for any operation type that has no real AI implementation behind it — never a placeholder.

This document covers the cross-cutting `ai_runs` execution ledger built in response to the hackathon gap analysis's Gemini-telemetry requirement, and the `/admin/ai-operations` dashboard + judge-facing CSV export built on top of it.

## What already existed vs. what this adds

Before this work, Gemini/AI telemetry existed but was siloed per feature:
- `farm_brain_runs` (+ `farm_brain_run_evidence`, `farm_brain_tool_calls`) — detailed, Farm-Brain-specific, already real (provider, model, tokens, latency).
- `ai_interactions` — detailed, Qwen-follow-up-specific, stores raw prompts/responses (`input_data`, `output_data`, `raw_provider_response` — appropriate for an internal audit log, **not** appropriate for a judge-facing evidence view, since it can contain full model output text).

Neither of those was a cross-cutting index across operation types, and neither excluded chain-of-thought-adjacent content by design. `ai_runs` is new: a single structured-summary table written by every real AI call site, with **no raw prompt/response bodies and no chain-of-thought — only already-validated fields** (findings/tool names, confidence, error codes, token counts). The detailed tables above are untouched and remain the internal source of truth for their own domains; `ai_runs` is additive, not a replacement.

## Which operations are real today

The requested operation list includes several that **do not exist as AI-powered features anywhere in this codebase** — confirmed by the same repo-wide searches from `docs/HACKATHON_WINNING_GAP_ANALYSIS.md` and `docs/GROWTH_FEATURES.md`. `ai_runs` only ever receives a row for an operation when a real AI call actually happens:

| Operation | Real today? | Call site | Provider |
|---|---|---|---|
| `FARM_HEALTH_ANALYSIS` | **Yes** | `FarmBrainService.process()` | Google Gemini |
| `CROP_ANALYSIS` | **Yes** | `CropScanProcessor.process()` | Roboflow / self-hosted vision (not Gemini — this codebase's only vision model) |
| `FOLLOW_UP_ANALYSIS` | **Yes** | `FollowUpService.audit()` (question selection, answer summary, result explanation, translation) | Alibaba Qwen |
| `INCIDENT_INVESTIGATION` | Not separately implemented | Farm Brain investigations that create an incident are still logged as `FARM_HEALTH_ANALYSIS` — there is no distinct "incident investigation" AI flow | — |
| `ROADMAP_GENERATION` | **No feature exists** | — | — |
| `WEATHER_RISK_ANALYSIS` | **No — deterministic, not AI** | `WeatherRulesEngine` is rule-based math, not a model call | — |
| `SATELLITE_RISK_ANALYSIS` | **No — deterministic, not AI** | The Python NDVI/NDMI baseline comparison is statistical (median/MAD), not a model call | — |
| `WEEKLY_SUMMARY` | **No — SQL aggregation, not AI** | `ReportService`'s `WeeklyActionPlan` is a task-count query; the growth-features weekly email is the same | — |

Logging a deterministic risk engine or a plain SQL aggregation as an "AI run" would misrepresent it as AI execution — that's exactly the kind of fabrication this system is built to prevent. Those operation values remain defined in the `ai_runs.operation` CHECK constraint (so the schema is ready the moment any of them becomes a real AI feature) but are never written today.

## What's captured, and what's deliberately not

Captured (per run): `userId`, `farmId`, `operation`, `provider`, `model`, `status`, `startedAt`/`completedAt`/`latencyMs`, `inputType`, `evidenceIds` (Farm Brain only — the evidence manifest IDs actually cited), `toolCalls` (name + status only), `toolCallCount`, `confidence` (average across Gemini hypothesis confidences when present, `null` otherwise — never invented), `inputTokens`/`outputTokens`, `humanReviewStatus`, `errorCode`, and a `sourceTable`/`sourceId` pointer back to the detailed record.

**Never captured**: raw prompts, raw model response text, or anything resembling chain-of-thought. `evidenceIds` are opaque identifiers, not the evidence content itself. No API keys or secrets are ever logged — the only credential-adjacent thing near this system is the opt-in cost-pricing config (below), which holds a price-per-token number, not a secret.

**Known gap**: `FollowUpService`'s three LLM call sites are not individually wrapped in try/catch, so a Qwen failure there propagates as an unhandled error and never reaches `ai_runs` as a `FAILED` row — only `FARM_HEALTH_ANALYSIS` and `CROP_ANALYSIS` currently log failures. Documented rather than silently gapped.

## Cost estimation — opt-in only, never a guessed number

`estimated_cost`/`cost_currency` are `null` unless an operator explicitly sets `GEMINI_INPUT_PRICE_PER_MILLION_TOKENS` and `GEMINI_OUTPUT_PRICE_PER_MILLION_TOKENS` (real, current USD pricing from Google's published rates). No hardcoded price is baked into the code — a stale hardcoded number would eventually misreport real spend, which is worse than reporting nothing.

## Design choices worth knowing

- **One row per completed operation, not a live QUEUED→RUNNING state machine.** Farm Brain and crop-scan already manage their own detailed lifecycle in their own tables; `ai_runs` is written once, after the operation reaches a terminal state, using the timing already computed by that operation. This avoids a second state machine to keep in sync.
- **Retry-attempt noise is suppressed for Farm Brain.** A `FAILED` row is only written on the `finalAttempt` (after BullMQ's retries are exhausted), not once per transient retry — otherwise one real investigation failure could inflate the failure count 3x.
- **`incidentsCreated`/`actionsTriggered` on the dashboard are computed live from `farm_brain_tool_calls`**, not from `ai_runs.incident_created`/summed `toolCallCount`. A Farm Brain investigation logs its `ai_runs` row at completion, when proposed mutation tools (like `createIncident`) are still `AWAITING_CONFIRMATION` — the incident doesn't actually exist until a farmer later confirms it via `POST /farm-brain/runs/:runId/tool-calls/:toolCallId/confirm`. Computing these two headline metrics from the live, authoritative table avoids understating them.

## Admin dashboard & evidence export

`GET /admin/ai-operations` (`@Roles(Admin, SuperAdmin)`): total/Gemini/completed/failed call counts, success rate (`null` when zero calls — never `0%` presented as a real rate), avg/p95 latency, tool-call count, farm analyses, incidents created, actions triggered, and breakdowns by operation and provider. All exclude `is_test_account`-flagged users.

`GET /admin/ai-operations/export.csv`: every real `ai_runs` row (capped at 5,000, most recent first), no aggregation — the raw evidence, for a judge to inspect directly. `app/(admin)/admin/ai-operations` renders the dashboard with an "Export CSV for judges" link.

## Verification performed

- `ai-run-logger.service.spec.ts` — unit tests: correct latency computation, tool-call-count derivation, `incidentCreated` only true when a tool call is actually `EXECUTED` (not merely proposed), cost only estimated when both pricing env vars are set, and that a logging failure never throws (best-effort).
- `ai-operations-analytics.service.spec.ts` — unit tests: honest all-null/all-zero shape on an empty table, real success-rate computation, test-account exclusion in the export query.
- **Live end-to-end verification** against the running Docker stack: registered a real farmer, created a real farm, triggered a real Farm Brain investigation, and confirmed a real `ai_runs` row appeared with genuine values — `gemini-3.6-flash`, 16,822ms latency, 2,672 input / 156 output tokens, 2 tool calls — then confirmed both `/admin/ai-operations` and the CSV export reflected it, through both the raw backend and the Next.js frontend proxy with a real session cookie.

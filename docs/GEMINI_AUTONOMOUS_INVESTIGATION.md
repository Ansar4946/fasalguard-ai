# Gemini Autonomous Investigation

**Date:** 2026-08-19
**Status:** Real, persisted, verified live (including a fresh live-verified Gemini investigation earlier this session: `gemini-3.6-flash`, real tool calls, real evidence).

This document audits the "Gemini as an operational agent" request against what already existed in this codebase (Farm Brain, `services/api/src/domain/farm-brain/`) before adding the one genuine gap: automatic signal detection. **Nothing about Farm Brain's Gemini interaction, validation, or persistence was rebuilt** — per this project's explicit "do not duplicate working systems" directive, this work extends the existing, tested, live-verified pipeline rather than replacing it.

## The core loop — what already existed vs. what was added

| Step | Status before this work | Evidence |
|---|---|---|
| Detect signal | **Missing** — investigations only ever started from a farmer's explicit `POST /farms/:id/farm-brain/investigations` | Confirmed by the hackathon gap analysis and re-confirmed while building this |
| Collect evidence | **Already real** | `FarmDigitalTwinService.getSnapshot()` + `evidenceManifest()` in `farm-brain.service.ts` |
| Gemini evaluates | **Already real, live-verified** | `GeminiFarmReasoningProvider.investigate()` — a genuine `gemini-3.6-flash` call, confirmed working end-to-end multiple times this session |
| Decide if more evidence is needed | **Already real** | `FarmBrainResult.missingEvidence` — Gemini explicitly states what's missing; enforced by `farm-brain.schema.ts` (e.g. a satellite anomaly with no visual evidence forces `missingEvidence`, not a diagnosis) |
| Use tool/function | **Already real** | Gemini function-calling with an allowlisted `toolDeclarations` set; unknown tool names are rejected by `farm-brain.schema.ts` |
| Create action | **Already real, but confirm-gated** | `FarmBrainService.confirm()` executes a proposed tool only after an explicit, authorized, ownership-checked confirmation — see "Anti-fabrication safeguards" below |
| Record result | **Already real** | `farm_brain_runs`, `farm_brain_tool_calls`, and (added this session) the cross-cutting `ai_runs` ledger |
| Schedule follow-up | **Partially real** | `scheduleFollowUp` is a real, executable tool that creates a `farmer_tasks` row; there is no separate automatic re-check scheduler yet (tracked as a known gap, not fabricated) |

**What this work adds**: `RiskAssessmentService` (the existing, deterministic, evidence-weighted risk engine — see `docs/HACKATHON_WINNING_GAP_ANALYSIS.md`'s cross-cutting finding #4) now automatically escalates to a real Farm Brain investigation whenever a real risk assessment computes `HIGH` or `CRITICAL`. This is the actual "Detect signal" step — closing the one structural gap the gap analysis identified as blocking the pipeline from being genuinely autonomous end-to-end. Every trigger that already feeds into risk assessment (weather updates, satellite updates, community outbreaks, farmer-initiated scans) now flows through this same escalation point, so wiring it once covers all of them.

## Tool mapping — requested names vs. real implemented equivalents

| Requested | Real tool (`FarmBrainToolName`) | Notes |
|---|---|---|
| `getFarmDigitalTwin` | `getFarmDigitalTwin` | Exact match |
| `getWeatherContext` | `getLatestWeather` | Same capability |
| `getSatelliteTrend` | `getVegetationTrend` | Same capability |
| `getRecentCropImages` | `getRecentFarmerImages` | Same capability |
| `getCropStage` | *(not a separate tool)* | Crop stage is already included directly in every investigation's input context (`toFarmBrainInput()`), so Gemini never needs to call out for it — adding a tool that just re-returns already-provided data would be redundant, not a real gap |
| `createIncident` | `createIncident` | Exact match |
| `requestFarmerEvidence` | `requestFarmerPhoto` | Same capability (photo-specific); broader "ask the farmer a clarifying question" is separately covered by the existing Qwen-powered follow-up Q&A flow (`FollowUpService`) |
| `createInspectionTask` | `createInspectionTask` | Exact match |
| `sendFarmerAlert` | `sendFarmerAlert` | Exact match |
| `scheduleFollowUp` | `scheduleFollowUp` | Exact match |
| `escalateForReview` | `escalateToExpert` | Same capability |

Every requested capability already has a real, working equivalent — none were missing.

## Structured output

The example schema in the request (`status`, `riskLevel`, `confidence`, `evidence`, `missingEvidence`, `recommendedTools`, `recommendedActions`, `requiresHumanReview`) describes the same intent as the real, already-validated `FarmBrainResult` schema (`farm-brain.types.ts`/`farm-brain.schema.ts`): `schemaVersion`, `healthStatus` (enum, not a numeric level), `riskScore` (0–1, more precise than a 4-value enum), `findings`, `hypotheses` (each evidence-grounded with its own `confidence` — richer than a single top-level number), `evidence`, `missingEvidence`, `recommendedActions` (tool name embedded per action, so no separate `recommendedTools` list is needed), `requiresHumanReview`. Field names were **not** renamed to match the illustrative example — the real schema is already stricter (it's enforced by `validateFarmBrainResult()`, which rejects unknown fields, out-of-range scores, and unapproved chemical guidance) and is exercised by real, passing tests and a real live Gemini call this session. Renaming working, tested fields purely for cosmetic alignment would be pure churn with no functional benefit.

## Anti-fabrication safeguards — already in place, re-confirmed

- **"Do not allow arbitrary AI text to mutate database state"**: Gemini's raw text output is never executed directly. `validateFarmBrainResult()` parses and validates every field (allowed tool names, evidence IDs that must reference real evidence actually given to the model, confidence ranges, a regex block on unapproved chemical/dosage language) before anything is persisted, and even a validated *proposal* only reaches `AWAITING_CONFIRMATION` — no mutation happens until a human explicitly confirms it.
- **"Tool calls must pass validation and authorization"**: `farm-brain.schema.ts`'s `isMutationTool()`/allowlist check, plus `FarmBrainService.confirm()`'s ownership check (`run.userId` must match the confirming principal) and `authorizedField()` (the field must genuinely belong to the farm).
- **"Persist every tool call"**: every proposed tool call is written to `farm_brain_tool_calls` at investigation time (status `AWAITING_CONFIRMATION`/`EXECUTED`/`REJECTED_BY_POLICY`), and the summary is also written to the cross-cutting `ai_runs` ledger (`docs/AI_EXECUTION_TELEMETRY.md`).

## Autonomous escalation — implementation

`RiskAssessmentService.assess()` (`services/api/src/domain/risk/risk.service.ts`), immediately after persisting a `field_risk_assessments` row, calls a new private `escalateToFarmBrain()` when `level` is `HIGH` or `CRITICAL`. It resolves the field's real owner (farm + user), then calls the same `FarmBrainService.start()` a farmer would trigger manually — so it inherits every existing safeguard for free: the evidence-hash dedup (a repeated risk signal with no material change never spawns a duplicate investigation), and the plan-entitlement check (`geminiAnalysesPerMonth`). The call is deliberately best-effort: an entitlement limit, a transient Gemini failure, or a field with no resolvable owner is logged and swallowed — it must never break the risk-assessment response that triggered it.

## Verification performed

- `risk-farm-brain-escalation.spec.ts` — unit tests: escalates on `HIGH`, does not escalate on `LOW`, never lets a Farm Brain failure (e.g. `ENTITLEMENT_LIMIT_REACHED`) propagate and break the risk response, and skips silently when no owner can be resolved.
- **Live negative-case verification**: seeded a real `CRITICAL` weather-risk signal for a fresh field with no other risk history, requested its risk assessment, and confirmed the deterministic engine correctly computed `LOW` (score 31.25 — the other four evidence categories were genuinely zero, correctly diluting the weighted average) and, correctly, did **not** escalate (`farm_brain_runs` count unchanged, 10 before and after).
- The **positive case** (a genuinely `HIGH`/`CRITICAL` real-evidence scenario) is covered by the unit test rather than a live demo, since manufacturing realistic community-report/outbreak-cluster/crop-scan evidence across five weighted categories through raw SQL would itself risk looking like fabricated evidence — the unit test proves the wiring is correct without needing to fake real-world risk data.

# Gemini Migration Plan

## Current provider map

| Provider | Input | Output | Active selection/fallback | Target role |
|---|---|---|---|---|
| Qwen follow-up | Scan evidence and farmer answers | Structured questions, summaries, explanation/translation | Always injected in follow-up module; fails if unconfigured | Migrate reasoning to Gemini; retain temporarily behind interface |
| Qwen assistant | Authorized context and farmer message | Text plus allowlisted proposals | Qwen only when configured; fake default | Replace primary assistant with Gemini; keep Qwen as optional fallback during evaluation |
| Qwen speech | Private audio/text | Transcript/audio | Qwen only when configured; fake default | Specialist speech tool if Gemini audio does not meet locale/latency needs |
| Roboflow | Ground images | Classification and alternatives | Optional demo adapter | Specialist visual classifier evidence under Gemini |
| Self-hosted vision | Ground images | Quality/classification path | Default configured path | Specialist production evidence provider |
| Sentinel Hub/FastAPI | Field polygon/raster | Numeric metrics and anomaly polygons | Real provider/service | Measurement tools; never disease oracle |
| Deterministic engines | Approved/configured evidence | Severity/weather/risk | Active | Authoritative policy calculators called by orchestration |

## Migration principles

1. Add Gemini behind interfaces; do not delete Qwen or specialist providers in the first migration.
2. Gemini orchestrates evidence and proposes actions; application services validate and execute.
3. Use structured response schemas and function declarations, not free-form prompt parsing.
4. Persist the run and evidence manifest before invoking the model.
5. Keep deterministic severity/risk and approved treatment guidance authoritative.
6. Compare Gemini and existing flows in shadow mode before cutover.

## Google integration strategy

- Define `FarmReasoningProvider` independent of SDK details.
- Implement a Gemini adapter with an explicit transport choice: Google AI API for hackathon credentials or Vertex AI for production workload identity.
- Centralize model policy by operation (fast model for summarization/translation, higher-reasoning multimodal model for incident investigation).
- Declare JSON schemas for every response and reject unknown fields or invalid references.
- Declare a small tool catalog; resolve tools server-side against authenticated, privacy-filtered services.
- Store provider/model identifiers returned at runtime rather than assuming a marketing model name.

## Phased cutover

### P0: prove the closed loop

1. Add configuration and fail-closed provider selection.
2. Add AI-run telemetry and incident migrations.
3. Build privacy-safe digital-twin snapshot projection.
4. Implement Gemini structured investigation with read-only tools.
5. Run in shadow mode on a curated cotton case set and compare with expert decisions.
6. Enable validated incident/action/follow-up proposals behind a feature flag.
7. Connect one real frontend journey and record human confirmation/outcome.

### P1: differentiate

- Multimodal photo plus voice reasoning.
- Scheduled investigation triggered by new satellite/weather evidence.
- Intervention and recovery measurement.
- Bilingual explanations from approved content.
- Evaluation dashboard for accuracy, review rate, latency, cost and recovery.

### P2: optimize

- Provider routing/fallback based on measured quality and cost.
- Crop/region-specific evaluation suites.
- Advanced temporal reasoning and calibrated confidence.

## Provider conflicts and resolution

Do not run Qwen and Gemini as competing writers. During migration, a routing service selects one primary provider; shadow outputs are audit-only. Roboflow and self-hosted models remain classifiers, Sentinel/Open-Meteo remain measurements, and deterministic engines remain policy calculators. Gemini cites their evidence IDs rather than replacing their outputs.

## Safety and security

- Never send password/session/token data, farmer contact details, exact boundary geometry or permanent media URLs.
- Use short-lived signed media access only when the Gemini transport requires it, preferably uploaded provider files with controlled lifecycle.
- Treat farmer text/voice as untrusted data, not instructions.
- Reject pesticide/dosage proposals unless they reference an approved guideline that explicitly permits them.
- Force expert review for high-risk, critical, unknown or low-confidence cases.
- Record malformed/refused/provider-failed runs without creating incidents or alerts.


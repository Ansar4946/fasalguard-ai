# Target Architecture

## Design principle

Keep the NestJS modular monolith and specialist provider interfaces. Add a Gemini orchestration module and explicit domain records rather than replacing working services or allowing model output to write directly to the database.

```text
Farmer / Expert / Scheduled monitor
                |
                v
        Observation ingestion
  satellite | weather | image | voice | history
                |
                v
       Digital-twin evidence view
                |
                v
       Gemini Farm Brain (queued)
  structured reasoning + allowlisted tool proposals
                |
                v
     Application validation / policy gate
                |
       +--------+---------+
       v        v         v
    Incident  ActionPlan  ExpertReview
       |        |          |
       +------ Task / Alert+
                |
                v
        Follow-up observation
                |
                v
          Outcome / recovery
```

## Bounded components

### Digital twin query layer

Builds a privacy-minimized, immutable evidence snapshot for one field and crop cycle. It references existing satellite captures/statistics, weather records, scans/predictions, inspections, risks, outbreaks, tasks and previous incidents. Raw raster bytes, permanent media URLs, PII and exact geometry are not included in model prompts.

### Gemini provider

Introduce a replaceable `FarmReasoningProvider` interface. The Google adapter should support Gemini multimodal inputs, JSON-schema constrained responses and function/tool declarations. Configuration should support Google AI Studio for the hackathon and Vertex AI/workload identity for production without changing domain services.

### Farm brain orchestrator

Runs asynchronously through BullMQ. It selects an operation (`INVESTIGATE`, `CLASSIFY_EVIDENCE`, `ASSESS_RISK`, `PLAN_FOLLOW_UP`), builds an evidence snapshot, calls Gemini, validates the response and passes accepted proposals to deterministic application services.

### Policy and safety gate

Enforces ownership, role, confidence, severity, knowledge approval and human-review rules. Gemini cannot prescribe unapproved chemicals, declare laboratory confirmation, overwrite specialist predictions, execute arbitrary tools or access unprojected database data.

### Incident service

Owns an explicit state machine such as `DETECTED -> INVESTIGATING -> ACTION_REQUIRED -> MONITORING -> RECOVERING -> RESOLVED`, with `ESCALATED` and `DISMISSED` transitions. It links evidence, AI runs, human decisions, action plans, tasks, alerts and outcome checks.

## Structured decision contract

Gemini returns a versioned proposal, never an ORM entity:

```json
{
  "schemaVersion": "farm-reasoning.v1",
  "incidentType": "POSSIBLE_CROP_HEALTH_STRESS",
  "severity": "HIGH",
  "confidence": 0.78,
  "observations": [{"evidenceId": "...", "statement": "..."}],
  "inferences": [{"statement": "...", "uncertainty": "..."}],
  "recommendedTools": [{"name": "REQUEST_GROUND_PHOTOS", "arguments": {}}],
  "recommendedActions": [{"guidelineId": "...", "reason": "..."}],
  "humanReviewRequired": true
}
```

The API validates JSON schema, evidence IDs, tool names, resource ownership, guideline approval, confidence range and state-transition policy. Invalid output is retained as a failed AI run but causes no business mutation.

## Tool allowlist

Read tools may obtain authorized digital-twin projections. Proposal tools may request a photo, schedule an inspection, propose a task, request an expert or propose a sanitized outbreak view. Any state-changing operation runs through a normal application command with idempotency and, where appropriate, user/expert confirmation. No arbitrary SQL, HTTP or shell tool is exposed.

## Operational model

Every orchestration run gets a durable ID, input hash and evidence snapshot before provider invocation. Queue jobs deduplicate by operation, field/crop cycle and evidence version. Provider timeouts produce a retryable run state; they do not produce farmer alerts. Metrics cover latency, tokens, failures, tool proposals, review outcomes and per-field cost.

## Human authority

Specialist models provide measurements/classifications. Gemini synthesizes evidence and proposes operations. Deterministic engines calculate configured severity/risk where required. Approved knowledge provides recommendations. Farmers confirm actions; experts confirm high-risk or uncertain cases. Original evidence and every correction remain immutable/auditable.


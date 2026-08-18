# Gemini Investigation Mode

## Purpose and authority boundary

Gemini Investigation Mode synthesizes authorized farm evidence across time. It does not replace Sentinel measurements, vision predictions, deterministic risk/severity engines, approved agronomic guidance, or agriculture experts.

Gemini receives a privacy-minimized Farm Digital Twin projection containing farm metadata, crop cycles, satellite observations and neutral anomaly evidence, weather, ground-image screening references, history and active incidents. Exact polygons, centroids, contact information, secrets, permanent media URLs and raster binaries are rejected before provider invocation.

Satellite evidence is explicitly non-diagnostic. A disease hypothesis requires a cited ground-level visual evidence ID; satellite-only disease claims fail schema validation.

## Investigation loop

When Sentinel evidence shows vegetation decline but no recent farmer imagery exists, the schema policy requires a `requestFarmerPhoto` proposal and rejects `createIncident`. The proposal carries only a human-readable approximate zone such as `Southeast` plus an urgency such as `today`; exact coordinates are forbidden. After the farmer supplies images, a new run can combine satellite anomaly evidence, weather, crop stage and the visual-analysis record. Only then can Gemini propose a cautious condition hypothesis and incident creation, with every conclusion linked to evidence IDs.

## Execution flow

```text
authenticated farmer
  -> owner-authorized FarmDigitalTwinService snapshot
  -> privacy boundary and canonical input hash
  -> farm_brain_runs + immutable evidence manifest
  -> BullMQ investigation job
  -> Gemini structured output / function-call proposal
  -> schema, evidence and safety validation
  -> durable farm_brain_tool_calls
  -> explicit authenticated confirmation
  -> normal application service or transaction
```

The input and evidence ledger are committed before Gemini is invoked. Repeated requests with the same authorized evidence snapshot deduplicate by user, farm and input hash.

## Structured result

The response schema is `farm-brain.v1` and includes `healthStatus`, a normalized 0–1 `riskScore`, evidence-grounded findings and hypotheses, missing evidence, recommended tool proposals and `requiresHumanReview`. Unknown fields, invalid enums, out-of-range confidence, invented evidence IDs and chemical/dosage instructions are rejected.

Critical assessments and low-confidence hypotheses force human review even if the model says otherwise.

## Function calling

The provider declares this allowlist:

- read projections: `getFarmDigitalTwin`, `getLatestWeather`, `getVegetationTrend`, `getRecentFarmerImages`;
- mutations: `createIncident`, `createInspectionTask`, `scheduleFollowUp`, `sendFarmerAlert`, `requestFarmerPhoto`, `escalateToExpert`.

Gemini never executes a function. A Gemini function call is returned to the model as `PROPOSAL_RECORDED_NOT_EXECUTED`, normalized into a durable tool-call record, and evaluated by application policy. Read tools refer to the already-authorized input snapshot. Mutation tools start as `AWAITING_CONFIRMATION`.

The first executable confirmation scope supports generic incident creation, inspection/follow-up/photo tasks and non-emergency farmer notifications. Specialized expert escalation remains fail-closed until a valid owned crop scan and expert workflow can be supplied; unsupported calls do not mutate state.

## API

- `POST /api/v1/farms/:farmId/farm-brain/investigations` returns `202` and a run ID.
- `GET /api/v1/farm-brain/runs/:id` returns an owner-scoped run, evidence manifest and proposals.
- `POST /api/v1/farm-brain/runs/:runId/tool-calls/:toolCallId/confirm` confirms one proposal.

The original input manifest is never returned by the run endpoint.

## Configuration

For local development, `FARM_BRAIN_PROVIDER=fake` is deterministic and clearly non-model-backed.

For a Google AI API demo:

```env
FARM_BRAIN_PROVIDER=gemini
GEMINI_TRANSPORT=google-ai
GEMINI_API_KEY=<server-side-secret>
GEMINI_MODEL=gemini-3.6-flash
```

For production Vertex AI:

```env
FARM_BRAIN_PROVIDER=gemini
GEMINI_TRANSPORT=vertex
GOOGLE_CLOUD_PROJECT=<project-id>
GOOGLE_CLOUD_LOCATION=us-central1
GEMINI_MODEL=gemini-3.6-flash
```

Vertex uses workload identity through the Google metadata server. `GOOGLE_ACCESS_TOKEN` exists only for short-lived, secret-injected non-GCP staging and must not be committed or baked into an image.

## Remaining production work

- Run shadow evaluation against expert-labelled cases before enabling farmer-impacting proposals broadly.
- Add crop/region-specific golden cases, calibrated review thresholds and provider cost budgets.
- Connect `escalateToExpert` to the owned crop-scan workflow rather than creating a synthetic expert case.
- Add approved-guideline IDs before allowing any treatment-oriented action.

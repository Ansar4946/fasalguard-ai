# Feature scoring framework

Every major capability introduced from Prompt 24 onward must have an evidence card before it is presented as complete. A polished screen is not proof of a working capability.

## Release gate

| Question | Gate | Evidence required |
|---|---:|---|
| Does it use real data? | Preferred | Provider response, farmer submission or persisted operational record; fixtures must be labelled `DEMO` or `TEST`. |
| Is Gemini essential? | Required for core reasoning features | Persisted Gemini run containing provider, model, version, input hash and schema version. Deterministic infrastructure features do not pretend to use Gemini. |
| Does Gemini make or assist a decision? | Required for Gemini features | Schema-controlled finding, hypothesis, missing-evidence decision or allowlisted action proposal. |
| Can the action be measured? | Required | Durable incident, task, notification, intervention, verification or tool-call identifier. |
| Can we log it? | Required | Correlation ID, evidence references, timestamps, status transitions and privacy-safe operational metrics. |
| Does it help a farmer? | Required | A clear farmer outcome: inspect, photograph, avoid unsafe action, receive guidance, request expert help or verify recovery. |
| Can judges understand it in under 10 seconds? | Preferred | One-line finding, risk level, evidence summary and next action. |
| Does it help business viability? | Preferred | Verified adoption, usage, outcome, feedback or payment evidence. |
| Can we demonstrate it live? | Required | A deterministic demo path with observable input, decision, action and persisted result. |

## Scoring

- A feature **fails** if any applicable required gate fails.
- Preferred gates improve prioritization but cannot compensate for a failed required gate.
- Gemini is not forced into deterministic infrastructure such as authentication, geometry validation, uploads or billing. For those features, the Gemini gates are marked `NOT_APPLICABLE`, never falsely reported as passed.
- A metric without a source record is `UNVERIFIED` and must not appear in a judge-facing claim.
- Demo fixtures may prove UI behavior but may not be counted as adoption, impact, customers or revenue.

## Evidence card template

```yaml
feature: Gemini Investigation Mode
dataSources:
  - satellite_anomaly_assessments
  - weather_snapshots
  - crop_scans
geminiRole: identifies missing evidence and proposes the next bounded action
decisionRecord: farm_brain_runs
actionRecord: farm_brain_tool_calls
outcomeRecords:
  - farmer_tasks
  - farm_incidents
  - farm_verifications
farmerBenefit: receives a targeted photo request instead of an unsupported diagnosis
demoPath: satellite anomaly -> photo request -> upload -> rerun -> incident proposal
businessEvidence: completed investigations and follow-ups from LIVE/PILOT organizations
limitations:
  - satellite evidence cannot diagnose disease
  - mutating proposals require application validation and user confirmation
```

## Current capability matrix

| Capability | Real evidence | Gemini decision | Measurable action | Audit record | Farmer value | Live demonstration |
|---|---|---|---|---|---|---|
| Farm Digital Twin | Farm, crop, weather, satellite, scans and history | Supplies bounded context | Snapshot/timeline retrieval | Provenance and freshness fields | Longitudinal farm context | Open one farm and compare 30 days |
| Satellite anomaly ingestion | Sentinel scenes and numeric raster statistics | Not used for measurement | Anomaly evidence created | Capture, layer, statistic and anomaly IDs | Locates areas needing inspection | Process a real available scene |
| Gemini Investigation Mode | Digital Twin evidence projection | Determines risk, uncertainty, missing evidence and proposals | Photo request, task, alert or incident proposal | Run, evidence and tool-call ledgers | Avoids false certainty and asks for useful evidence | Anomaly -> photo request -> rerun |
| Incident follow-up | Farmer images, weather, satellite and crop history | Assists causal hypothesis | Incident/task/verification | Evidence-linked state transitions | Tracks action and recovery | Confirm action then complete follow-up |
| Business viability analytics | LIVE/PILOT memberships, operations and verified payments | Not applicable | Aggregate viability snapshot | Source tables and conservative definitions | Keeps product claims credible | Refresh metrics after a real event |

## Judge-facing rule

The shortest valid story is:

> Real observation → Gemini-assisted decision → bounded action → persisted outcome → measurable farmer value.

If any arrow cannot be demonstrated, the capability is not ready for the main demo.

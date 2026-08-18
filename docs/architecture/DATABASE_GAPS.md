# Database Audit and Gaps

## Existing tables by capability

### Identity and access

`users`, `farmer_profiles`, `expert_profiles`, `consents`, `devices`, `auth_sessions`, `device_tokens`, `notification_preferences`.

### Farm digital foundation

`crops`, `crop_varieties`, `farms`, `fields`, `crop_cycles`. Farm and field boundaries are PostGIS Polygon SRID 4326; centroids are Point SRID 4326; GiST indexes and validity/range constraints exist. Fields can be configured to require containment within a farm.

### Observations and intelligence

`satellite_captures`, `satellite_layers`, `satellite_statistics`, `satellite_stress_zones`, `field_health_scores`, `weather_snapshots`, `weather_forecasts`, `crop_weather_rules`, `weather_risk_assessments`, `field_inspections`, `crop_scans`, `scan_images`, `image_quality_results`, `model_versions`, `model_predictions`, `diagnoses`, `diagnosis_alternatives`, `follow_up_questions`, `follow_up_answers`, `ai_interactions`, `severity_rulesets`, `severity_assessments`, `field_risk_rulesets`, `field_risk_assessments`.

### Decisions, action and review

`knowledge_articles`, `guideline_sources`, `treatment_guidelines`, `guideline_approvals`, `action_plans`, `action_plan_steps`, `farmer_tasks`, `expert_reviews`, `expert_assignments`, `consultations`, `consultation_messages`, `case_status_history`.

### Community, delivery and operations

`outbreak_settings`, `community_reports`, `community_verifications`, `outbreak_clusters`, `outbreak_members`, `regional_advisories`, `notifications`, `notification_deliveries`, `assistant_conversations`, `assistant_messages`, `voice_note_metadata`, `mutation_receipts`, `sync_changes`, `media_assets`, `generated_reports`, `analytics_events`, `integration_usage`.

## Relationship assessment

The schema supports farm ownership, crop cycles, time-stamped satellite/weather/image evidence, diagnosis alternatives, expert corrections, approved action plans, queued farmer tasks, notifications and audit-like histories. It can answer many feature-specific questions, but the records are connected through individual workflows rather than a canonical farm-event graph.

## Gaps against the autonomous loop

| Required concept | Current coverage | Gap |
|---|---|---|
| Farm boundaries | Strong | None for P0 |
| Observations over time | Multiple typed tables | No unified observation envelope/versioned evidence snapshot |
| Satellite scenes/metrics | Strong | Need direct evidence references from reasoning runs/incidents |
| Weather observations | Strong | Need observation provenance in reasoning snapshots |
| Diagnoses | Strong | No canonical incident linking diagnosis to action/outcome |
| AI runs | `ai_interactions`, assistant message metadata | Not unified; missing operation, input hash, tool calls, evidence IDs, status and human review |
| Incidents | Indirect through scans/reviews/outbreaks | No first-class field incident/state machine |
| Recommendations | Guidelines/action plans | No reasoned proposal record before validated plan creation |
| Intervention tasks | `farmer_tasks` | Execution evidence, actual intervention and outcome are not first class |
| Notifications | Strong | Need incident/action linkage and impact attribution |
| Verification scans | Ordinary scans/history | No explicit verifies-incident/action relationship or expected follow-up |
| Audit trails | Several histories/analytics | No unified AI and operational decision audit |
| Treatment history | Action-plan intent only | Missing executed intervention/treatment event and safe product metadata |

## Proposed additions (not implemented in this audit)

### P0 migrations

- `ai_runs`: user/farm/field/incident IDs, provider/model/version, operation, timestamps, status, latency, input hash, schema version, confidence, usage, error category and review status.
- `ai_run_evidence`: typed evidence reference, source timestamp and immutable snapshot hash.
- `ai_tool_calls`: allowlisted tool name, validated arguments, result reference, status and latency.
- `incidents`: field/crop-cycle scope, type, state, severity, confidence, detected/resolved timestamps and optimistic version.
- `incident_evidence`: incident-to-observation reference with observation/inference distinction.
- `incident_events`: immutable transition/decision audit.
- `follow_up_checks`: incident/action relationship, due date, required evidence and completion status.
- Add nullable `incident_id`/`ai_run_id` foreign keys to action plans, tasks, notifications and expert reviews through additive migrations.

### P1 migrations

- `interventions`: executed action, actor, time, approved guideline/action step, notes and evidence.
- `outcome_assessments`: baseline/follow-up references, recovery state, measured deltas and reviewer.
- `digital_twin_snapshots`: versioned evidence manifests for reproducible reasoning.
- Extended analytics events for AI runs, incidents, actions, follow-ups, confirmations and recovery.

## Migration risks

- Avoid polymorphic foreign keys without referential validation; use a constrained evidence type plus resolver or dedicated nullable FKs.
- Do not rewrite historical predictions or expert reviews during backfill.
- Incident backfill from existing diagnoses is ambiguous; mark provenance and allow `legacy_import` rather than implying original orchestration.
- Large snapshot JSON may duplicate sensitive data; store references/hashes and a minimal redacted manifest.
- Exact geometry must never be copied into AI telemetry or public analytics.
- Add indexes for field/time, incident/state, run/status/created time and evidence source uniqueness.


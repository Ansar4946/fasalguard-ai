# Farm Digital Twin

## Purpose

The FasalGuard Farm Digital Twin is a read model over normalized operational records. It is not a giant JSON document and it does not replace the farm, field, satellite, weather, crop-scan, expert or task domains. `FarmDigitalTwinService` assembles an authorized point-in-time snapshot and chronological timeline from those source tables.

The twin answers both “what is known now?” and “what changed during this period?” while preserving the original evidence and ingestion times.

## Domain model

Existing temporal records remain authoritative:

- `farms`, `fields`, `crop_cycles`, `crops`, `crop_varieties`: identity, geometry and crop context.
- `satellite_captures`, `satellite_statistics`, `satellite_layers`, `satellite_anomaly_assessments`, `satellite_stress_zones`, `field_health_scores`: remote-sensing observations, non-diagnostic anomaly provenance and storage references.
- `weather_snapshots`, `weather_forecasts`, `weather_risk_assessments`: weather observations and derived risk.
- `field_inspections`: farmer notes and media references.
- `crop_scans`, `scan_images`, `model_predictions`, `diagnoses`: ground-image evidence and screening history.
- `expert_reviews`: human review without overwriting original predictions.
- `action_plans`, `farmer_tasks`: planned operational work.

Three additive temporal entities represent concepts that existing tables could not safely express:

- `farm_incidents`: a canonical farm/field issue with state, severity, source and evidence references.
- `farm_interventions`: an action actually planned or performed, optionally linked to an incident, approved plan and farmer task.
- `farm_verifications`: a recovery/follow-up check linked to an incident and at least one observation reference.

All records are append-oriented. Resolution changes incident state but does not delete its history or source evidence.

## Data flow

```text
Normalized source entities
  -> owner and optional field-scope authorization
  -> bounded parallel database queries
  -> normalized snapshot / chronological event stream
  -> privacy-safe evidence projection
  -> future Gemini reasoning input
```

The service performs a constant number of batched queries using field ID arrays. It does not issue one query per field. Indexes cover farm/state/time, field/time, observation time and incident state. Existing PostGIS indexes are unchanged.

## Provenance

Every external observation exposed by the twin has:

- `source`: provider or actor category.
- `sourceIdentifier`: provider scene/request identifier or stable record identifier.
- `observedAt`: when the source event occurred.
- `ingestedAt`: when FasalGuard stored it.
- `sourceStatus`: provider/data quality where available.

Timeline events contain an evidence reference shaped as:

```json
{
  "id": "SATELLITE_OBSERVATION:64c...",
  "type": "SATELLITE_OBSERVATION",
  "source": "SENTINEL_HUB",
  "sourceIdentifier": "S2B_MSIL2A_...",
  "observedAt": "2026-08-15T05:12:00.000Z",
  "ingestedAt": "2026-08-15T05:12:00.000Z"
}
```

Incident, intervention and verification records also retain explicit JSON evidence references. A later Gemini conclusion must cite these identifiers; it must never create an evidence-free operational record.

## Freshness

Freshness is derived at snapshot time and does not overwrite source observations:

- `fresh`: an observation exists within its source-specific time budget.
- `stale`: an observation exists but is older than that budget.
- `missing`: no observation exists.
- `estimated`: the source explicitly marks the value estimated.

The response includes the threshold, age, source timestamps and source identifier so consumers can explain the classification. Current initial budgets are presentation/operational defaults, not agronomic thresholds: satellite 14 days, weather 6 hours, forecast 12 hours, and farmer/diagnosis/incident evidence 30 days.

## API

Both routes follow the existing `/api/v1` convention and require an authenticated farmer who owns the farm:

```http
GET /api/v1/farms/:farmId/digital-twin?days=30&fieldId=<uuid>&includeGeometry=false
GET /api/v1/farms/:farmId/timeline?days=30&fieldId=<uuid>&limit=100
```

Unknown and non-owned farms return the same `404 FARM_NOT_FOUND` response to prevent tenant enumeration. `days` is limited to 1–365 and timeline `limit` to 1–500.

Exact polygons are omitted by default. The response supplies bounding boxes and owner-only `geometryRef` routes. An authenticated owner can request `includeGeometry=true`; future Gemini adapters must continue using the default privacy-minimized projection.

## Example snapshot

```json
{
  "generatedAt": "2026-08-17T12:00:00.000Z",
  "window": { "from": "2026-07-18T12:00:00.000Z", "to": "2026-08-17T12:00:00.000Z", "days": 30 },
  "farm": { "id": "...", "name": "Green Farm", "areaHectares": 12.4, "bbox": [71.4, 30.1, 71.42, 30.12], "geometryRef": "/api/v1/farms/.../geojson" },
  "fields": [{ "id": "...", "name": "North Field", "areaHectares": 5.1, "geometryRef": "/api/v1/fields/.../geojson" }],
  "crop": [{ "fieldId": "...", "cropCycleId": "...", "name": "Cotton", "plantingDate": "2026-06-12", "growthStage": "vegetative", "status": "active" }],
  "currentHealth": [{ "fieldId": "...", "score": 78, "risk": "MODERATE" }],
  "latestSatellite": [{ "id": "...", "source": "SENTINEL_HUB", "sourceIdentifier": "S2-scene", "observedAt": "...", "layers": [{ "type": "NDVI", "mediaAssetId": "..." }] }],
  "vegetationTrend": [{ "fieldId": "...", "index": "NDVI", "statistics": { "mean": 0.67 }, "observedAt": "..." }],
  "weather": { "current": [], "forecasts": [] },
  "activeIncidents": [],
  "recentInterventions": [],
  "farmerObservations": [],
  "previousDiagnoses": [],
  "recoveryChecks": [],
  "dataFreshness": { "satellite": { "status": "fresh", "sourceIdentifier": "S2-scene", "ageSeconds": 86400, "thresholdSeconds": 1209600 } }
}
```

No image, raster or audio binary is embedded. Only private media asset IDs and owner-authorized access routes are represented.

## Gemini consumption

The future Gemini orchestrator should call the service internally with `includeGeometry=false`, select only evidence relevant to its operation and persist the selected evidence IDs in its AI-run ledger. Farmer notes remain untrusted data. The model may distinguish observations from inferences and propose actions, but application validation must check ownership, incident transitions, confidence, expert-escalation rules and approved treatment guidance before creating state.

The twin itself performs no Gemini call, satellite ingestion or agronomic recommendation.

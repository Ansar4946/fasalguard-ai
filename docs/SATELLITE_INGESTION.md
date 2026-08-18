# Satellite ingestion and scientific interpretation

## Scientific boundary

FasalGuard treats Sentinel-2 as a source of field-scale observations. It can identify a change in vegetation or moisture response, but it cannot diagnose early blight, a fungus, a pest, or any other exact condition. Exact screening requires ground-level photographs and, when needed, expert review.

The enforced pipeline is:

1. discover a Sentinel-2 Level-2A acquisition through the Catalog API;
2. reject scenes above the configured catalog cloud limit;
3. render true colour, reflectance-derived NDVI and NDMI, plus an SCL/data mask;
4. calculate numeric statistics through the Statistical API;
5. stop before anomaly analysis when valid pixels are below `SATELLITE_MIN_VALID_PIXEL_PERCENTAGE`;
6. compare the clear observation with previous valid observations from the same field;
7. produce only allowlisted stress/anomaly labels;
8. persist the baseline, engine version, source scene, metric references and evidence for later investigation.

The API and database reject disease labels at the satellite-analysis boundary. The allowed conclusions are `VEGETATION_DECLINE`, `POSSIBLE_WATER_STRESS`, `POSSIBLE_EXCESS_MOISTURE`, `UNEVEN_GROWTH`, and `UNKNOWN_STRESS`.

## Temporal baseline

No universal crop-independent NDVI threshold is used. With one or two prior clear acquisitions, the assessment is marked `PREVIOUS_VALID_OBSERVATION`; with three or more it is `ROLLING_FIELD_BASELINE`; without history it is `INSUFFICIENT_HISTORY`. Cloud-blocked captures are not baseline evidence.

Spatial anomalies use robust, field-relative statistics. Moisture labels require at least three historical NDMI observations and are relative to that field's history.

## Provenance and Gemini hand-off

`satellite_anomaly_assessments` records the capture, field, observed time, Sentinel scene identifier, baseline capture IDs, analysis engine version and metric references. Its evidence has a database-enforced `SATELLITE_STRESS_ANOMALY` conclusion scope and `diagnosticCapability: NONE`.

Gemini may use this record to ask an investigation question such as “A vegetation decline was observed; can you photograph affected plants?” It must not convert the anomaly into a disease diagnosis. The Farm Digital Twin exposes these records as `satelliteEvidence` without embedding raster binaries.

## Endpoints

- `POST /api/v1/fields/:fieldId/satellite-scans` queues ingestion.
- `GET /api/v1/satellite-scans/:id/layers` returns short-lived private layer access.
- `GET /api/v1/satellite-scans/:id/statistics` returns reflectance-derived metrics.
- `GET /api/v1/satellite-scans/:id/stress-zones` returns neutral anomaly polygons.
- `GET /api/v1/satellite-scans/:id/evidence` returns baseline and provenance.
- `GET /api/v1/farms/:farmId/digital-twin` includes normalized satellite evidence.

Provider credentials remain server-side. Raster objects are private, worker jobs are idempotent, and a provider failure does not create a farmer alert.

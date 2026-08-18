import { Injectable, NotFoundException } from '@nestjs/common';
import { InjectDataSource } from '@nestjs/typeorm';
import { DataSource } from 'typeorm';
import { EvidenceFreshness, IncidentState } from './digital-twin.enums';
import type {
  DigitalTwinSnapshot,
  EvidenceReference,
  FreshnessDescriptor,
  TimelineEvent,
} from './digital-twin.types';
import type {
  DigitalTwinQueryDto,
  DigitalTwinTimelineQueryDto,
} from './dto/digital-twin-query.dto';

interface FarmScope {
  id: string;
  name: string;
  province: string | null;
  district: string | null;
  tehsil: string | null;
  soilType: string | null;
  irrigationType: string | null;
  waterSource: string | null;
  areaHectares: number;
  bbox: number[];
  boundary?: Record<string, unknown>;
  centroid?: Record<string, unknown>;
}

interface FieldScope {
  id: string;
  farmId: string;
  name: string;
  status: string;
  areaHectares: number;
  bbox: number[];
  boundary?: Record<string, unknown>;
  centroid?: Record<string, unknown>;
  cropCycleId: string | null;
  cropId: string | null;
  crop: string | null;
  variety: string | null;
  sowingDate: string | null;
  growthStage: string | null;
  cropCycleStatus: string | null;
}

const freshnessThresholds = {
  satellite: 14 * 24 * 60 * 60,
  weather: 6 * 60 * 60,
  forecast: 12 * 60 * 60,
  farmerObservation: 30 * 24 * 60 * 60,
  diagnosis: 30 * 24 * 60 * 60,
  incident: 30 * 24 * 60 * 60,
} as const;

@Injectable()
export class FarmDigitalTwinService {
  constructor(@InjectDataSource() private readonly db: DataSource) {}

  async getSnapshot(
    userId: string,
    farmId: string,
    options: DigitalTwinQueryDto,
    now = new Date(),
  ): Promise<DigitalTwinSnapshot> {
    const { farm, fields } = await this.requireScope(userId, farmId, options);
    const fieldIds = fields.map((field) => field.id);
    const from = new Date(now.getTime() - options.days * 86_400_000);
    const empty = fieldIds.length === 0;

    const [
      health,
      satellites,
      vegetation,
      satelliteEvidence,
      currentWeather,
      forecasts,
      incidents,
      interventions,
      observations,
      diagnoses,
      verifications,
    ] = await Promise.all([
      empty ? [] : this.currentHealth(fieldIds),
      empty ? [] : this.latestSatellite(fieldIds),
      empty ? [] : this.vegetationTrend(fieldIds, from),
      empty ? [] : this.satelliteEvidence(fieldIds, from),
      empty ? [] : this.currentWeather(fieldIds),
      empty ? [] : this.latestForecasts(fieldIds),
      this.activeIncidents(farmId, fieldIds),
      this.recentInterventions(farmId, fieldIds, from),
      empty ? [] : this.farmerObservations(fieldIds, from),
      empty ? [] : this.previousDiagnoses(fieldIds, from),
      this.recoveryChecks(farmId, fieldIds, from),
    ]);

    return {
      generatedAt: now.toISOString(),
      window: { from: from.toISOString(), to: now.toISOString(), days: options.days },
      farm: this.projectFarm(farm, options.includeGeometry),
      fields: fields.map((field) => this.projectField(field, options.includeGeometry)),
      crop: fields
        .filter((field) => field.cropCycleId)
        .map((field) => ({
          fieldId: field.id,
          cropCycleId: field.cropCycleId,
          cropId: field.cropId,
          name: field.crop,
          variety: field.variety,
          plantingDate: field.sowingDate,
          growthStage: field.growthStage,
          status: field.cropCycleStatus,
        })),
      currentHealth: health,
      latestSatellite: satellites,
      vegetationTrend: vegetation,
      satelliteEvidence,
      weather: { current: currentWeather, forecasts },
      activeIncidents: incidents,
      recentInterventions: interventions,
      farmerObservations: observations,
      previousDiagnoses: diagnoses,
      recoveryChecks: verifications,
      dataFreshness: {
        satellite: describeFreshness(satellites[0], freshnessThresholds.satellite, now),
        weather: describeFreshness(currentWeather[0], freshnessThresholds.weather, now),
        forecast: describeFreshness(forecasts[0], freshnessThresholds.forecast, now),
        farmerObservations: describeFreshness(
          observations[0],
          freshnessThresholds.farmerObservation,
          now,
        ),
        diagnoses: describeFreshness(diagnoses[0], freshnessThresholds.diagnosis, now),
        incidents: describeFreshness(incidents[0], freshnessThresholds.incident, now),
      },
    };
  }

  async getTimeline(
    userId: string,
    farmId: string,
    options: DigitalTwinTimelineQueryDto,
  ): Promise<{ window: { from: string; to: string; days: number }; events: TimelineEvent[] }> {
    const now = new Date();
    const from = new Date(now.getTime() - options.days * 86_400_000);
    const { fields } = await this.requireScope(userId, farmId, options);
    const fieldIds = fields.map((field) => field.id);
    if (!fieldIds.length)
      return {
        window: { from: from.toISOString(), to: now.toISOString(), days: options.days },
        events: [],
      };

    const rows: TimelineEvent[] = await this.db.query(
      `SELECT * FROM (
        SELECT sc.id::text AS id,'SATELLITE_OBSERVATION' AS type,sc.field_id AS "fieldId",sc.acquisition_date AS "occurredAt",sc.provider AS source,COALESCE(sc.provider_scene_id,sc.id::text) AS "sourceIdentifier",jsonb_build_object('status',sc.processing_status,'quality',sc.data_quality,'cloudCoverage',sc.cloud_coverage) AS summary FROM satellite_captures sc WHERE sc.field_id=ANY($1::uuid[]) AND sc.acquisition_date >= $2
        UNION ALL SELECT ws.id::text,'WEATHER_OBSERVATION',ws.field_id,ws.observed_at,ws.provider,COALESCE(ws.source_identifier,ws.id::text),jsonb_build_object('status',ws.observation_status,'values',ws.values) FROM weather_snapshots ws WHERE ws.field_id=ANY($1::uuid[]) AND ws.observed_at >= $2
        UNION ALL SELECT fi.id::text,'FARMER_OBSERVATION',fi.field_id,fi.observed_at,'FARMER',fi.id::text,jsonb_build_object('notes',fi.notes,'mediaAssetIds',fi.media_asset_ids) FROM field_inspections fi WHERE fi.field_id=ANY($1::uuid[]) AND fi.observed_at >= $2
        UNION ALL SELECT cs.id::text,'CROP_SCAN',cs.field_id,cs.created_at,'CROP_SCAN',cs.id::text,jsonb_build_object('status',cs.status) FROM crop_scans cs WHERE cs.field_id=ANY($1::uuid[]) AND cs.created_at >= $2
        UNION ALL SELECT i.id::text,'INCIDENT',i.field_id,i.detected_at,i.source,i.source_identifier,jsonb_build_object('state',i.state,'severity',i.severity,'title',i.title) FROM farm_incidents i WHERE i.field_id=ANY($1::uuid[]) AND i.detected_at >= $2
        UNION ALL SELECT x.id::text,'INTERVENTION',x.field_id,x.performed_at,'FASALGUARD',x.id::text,jsonb_build_object('type',x.type,'status',x.status,'incidentId',x.incident_id) FROM farm_interventions x WHERE x.field_id=ANY($1::uuid[]) AND x.performed_at >= $2
        UNION ALL SELECT v.id::text,'RECOVERY_CHECK',v.field_id,v.observed_at,'FASALGUARD',v.id::text,jsonb_build_object('status',v.status,'outcome',v.outcome,'incidentId',v.incident_id) FROM farm_verifications v WHERE v.field_id=ANY($1::uuid[]) AND v.observed_at >= $2
      ) events ORDER BY "occurredAt" DESC,id DESC LIMIT $3`,
      [fieldIds, from, options.limit],
    );
    return {
      window: { from: from.toISOString(), to: now.toISOString(), days: options.days },
      events: rows.map((row) => ({ ...row, evidence: [evidenceFor(row)] })),
    };
  }

  private async requireScope(
    userId: string,
    farmId: string,
    options: Pick<DigitalTwinQueryDto, 'fieldId'>,
  ): Promise<{ farm: FarmScope; fields: FieldScope[] }> {
    const farms: FarmScope[] = await this.db.query(
      `SELECT f.id,f.name,f.province,f.district,f.tehsil,f.soil_type AS "soilType",f.irrigation_type AS "irrigationType",f.water_source AS "waterSource",f.area_hectares AS "areaHectares",ARRAY[ST_XMin(f.boundary),ST_YMin(f.boundary),ST_XMax(f.boundary),ST_YMax(f.boundary)] AS bbox,ST_AsGeoJSON(f.boundary)::jsonb AS boundary,ST_AsGeoJSON(f.centroid)::jsonb AS centroid FROM farms f JOIN farmer_profiles fp ON fp.id=f.farmer_id WHERE f.id=$1 AND fp.user_id=$2 AND f.deleted_at IS NULL`,
      [farmId, userId],
    );
    if (!farms[0]) throw this.notFound();
    const fields: FieldScope[] = await this.db.query(
      `SELECT fi.id,fi.farm_id AS "farmId",fi.name,fi.status,fi.area_hectares AS "areaHectares",ARRAY[ST_XMin(fi.boundary),ST_YMin(fi.boundary),ST_XMax(fi.boundary),ST_YMax(fi.boundary)] AS bbox,ST_AsGeoJSON(fi.boundary)::jsonb AS boundary,ST_AsGeoJSON(fi.centroid)::jsonb AS centroid,cc.id AS "cropCycleId",cc.crop_id AS "cropId",c.name AS crop,cv.name AS variety,cc.sowing_date AS "sowingDate",cc.growth_stage AS "growthStage",cc.status AS "cropCycleStatus" FROM fields fi LEFT JOIN LATERAL (SELECT * FROM crop_cycles WHERE field_id=fi.id AND deleted_at IS NULL AND status IN ('planned','active') ORDER BY created_at DESC LIMIT 1) cc ON true LEFT JOIN crops c ON c.id=cc.crop_id LEFT JOIN crop_varieties cv ON cv.id=cc.crop_variety_id WHERE fi.farm_id=$1 AND fi.deleted_at IS NULL AND ($2::uuid IS NULL OR fi.id=$2) ORDER BY fi.created_at`,
      [farmId, options.fieldId ?? null],
    );
    if (options.fieldId && !fields.length) throw this.notFound();
    return { farm: farms[0], fields };
  }

  private currentHealth(fieldIds: string[]): Promise<Record<string, unknown>[]> {
    return this.db.query(
      `SELECT fi.id AS "fieldId",h.id AS "healthScoreId",h.score,h.components,h.created_at AS "observedAt",h.created_at AS "ingestedAt",r.id AS "riskAssessmentId",r.level AS risk,r.score AS "riskScore",r.valid_until AS "riskValidUntil" FROM fields fi LEFT JOIN LATERAL (SELECT * FROM field_health_scores WHERE field_id=fi.id ORDER BY created_at DESC LIMIT 1) h ON true LEFT JOIN LATERAL (SELECT * FROM field_risk_assessments WHERE field_id=fi.id ORDER BY created_at DESC LIMIT 1) r ON true WHERE fi.id=ANY($1::uuid[]) ORDER BY h.created_at DESC NULLS LAST`,
      [fieldIds],
    );
  }

  private latestSatellite(fieldIds: string[]): Promise<Record<string, unknown>[]> {
    return this.db.query(
      `SELECT fi.id AS "fieldId",sc.id,sc.provider,sc.provider_scene_id AS "sourceIdentifier",sc.satellite,sc.acquisition_date AS "observedAt",sc.created_at AS "ingestedAt",sc.processed_date AS "processedAt",sc.data_quality AS "sourceStatus",sc.processing_status AS status,sc.cloud_coverage AS "cloudCoverage",sc.usable_pixel_percentage AS "usablePixelPercentage",COALESCE((SELECT jsonb_agg(jsonb_build_object('type',sl.type,'mediaAssetId',sl.media_asset_id)) FROM satellite_layers sl WHERE sl.capture_id=sc.id),'[]'::jsonb) AS layers FROM fields fi LEFT JOIN LATERAL (SELECT * FROM satellite_captures WHERE field_id=fi.id AND acquisition_date IS NOT NULL ORDER BY acquisition_date DESC LIMIT 1) sc ON true WHERE fi.id=ANY($1::uuid[]) AND sc.id IS NOT NULL ORDER BY sc.acquisition_date DESC`,
      [fieldIds],
    );
  }

  private vegetationTrend(fieldIds: string[], from: Date): Promise<Record<string, unknown>[]> {
    return this.db.query(
      `SELECT ss.id,sc.field_id AS "fieldId",sc.id AS "captureId",ss.index,ss.statistics,sc.provider,sc.provider_scene_id AS "sourceIdentifier",sc.acquisition_date AS "observedAt",ss.created_at AS "ingestedAt",sc.data_quality AS "sourceStatus" FROM satellite_statistics ss JOIN satellite_captures sc ON sc.id=ss.capture_id WHERE sc.field_id=ANY($1::uuid[]) AND sc.acquisition_date >= $2 AND ss.index IN ('NDVI','NDMI') ORDER BY sc.acquisition_date,ss.index`,
      [fieldIds, from],
    );
  }

  private satelliteEvidence(fieldIds: string[], from: Date): Promise<Record<string, unknown>[]> {
    return this.db.query(
      `SELECT saa.id,saa.capture_id AS "captureId",saa.field_id AS "fieldId",saa.baseline_method AS "baselineMethod",saa.baseline_capture_ids AS "baselineCaptureIds",saa.status,saa.engine_version AS "engineVersion",saa.observed_at AS "observedAt",saa.created_at AS "ingestedAt",saa.source_identifier AS "sourceIdentifier",saa.evidence,COALESCE((SELECT jsonb_agg(jsonb_build_object('id',sz.id,'label',sz.label,'severity',sz.severity,'score',sz.score,'areaHectares',sz.area_hectares,'evidence',sz.evidence) ORDER BY sz.score DESC) FROM satellite_stress_zones sz WHERE sz.capture_id=saa.capture_id),'[]'::jsonb) AS anomalies FROM satellite_anomaly_assessments saa WHERE saa.field_id=ANY($1::uuid[]) AND saa.observed_at >= $2 ORDER BY saa.observed_at DESC`,
      [fieldIds, from],
    );
  }

  private currentWeather(fieldIds: string[]): Promise<Record<string, unknown>[]> {
    return this.db.query(
      `SELECT DISTINCT ON(field_id) id,field_id AS "fieldId",provider,COALESCE(source_identifier,id::text) AS "sourceIdentifier",observed_at AS "observedAt",created_at AS "ingestedAt",observation_status AS "sourceStatus",values FROM weather_snapshots WHERE field_id=ANY($1::uuid[]) ORDER BY field_id,observed_at DESC`,
      [fieldIds],
    );
  }

  private latestForecasts(fieldIds: string[]): Promise<Record<string, unknown>[]> {
    return this.db.query(
      `SELECT DISTINCT ON(field_id) id,field_id AS "fieldId",provider,COALESCE(source_identifier,id::text) AS "sourceIdentifier",generated_at AS "observedAt",created_at AS "ingestedAt",observation_status AS "sourceStatus",valid_from AS "validFrom",valid_to AS "validTo",points FROM weather_forecasts WHERE field_id=ANY($1::uuid[]) ORDER BY field_id,generated_at DESC`,
      [fieldIds],
    );
  }

  private activeIncidents(farmId: string, fieldIds: string[]): Promise<Record<string, unknown>[]> {
    return this.db.query(
      `SELECT id,farm_id AS "farmId",field_id AS "fieldId",crop_cycle_id AS "cropCycleId",type,state,severity,confidence,title,source,source_identifier AS "sourceIdentifier",evidence_references AS evidence,detected_at AS "observedAt",created_at AS "ingestedAt" FROM farm_incidents WHERE farm_id=$1 AND ($2::uuid[]='{}'::uuid[] OR field_id IS NULL OR field_id=ANY($2::uuid[])) AND state NOT IN ($3,$4) ORDER BY detected_at DESC`,
      [farmId, fieldIds, IncidentState.Resolved, IncidentState.Dismissed],
    );
  }

  private recentInterventions(
    farmId: string,
    fieldIds: string[],
    from: Date,
  ): Promise<Record<string, unknown>[]> {
    return this.db.query(
      `SELECT id,farm_id AS "farmId",field_id AS "fieldId",incident_id AS "incidentId",action_plan_id AS "actionPlanId",task_id AS "taskId",type,status,performed_at AS "observedAt",created_at AS "ingestedAt",recorded_by AS "recordedBy",notes,evidence_references AS evidence,'FASALGUARD' AS source,id::text AS "sourceIdentifier" FROM farm_interventions WHERE farm_id=$1 AND performed_at >= $3 AND ($2::uuid[]='{}'::uuid[] OR field_id IS NULL OR field_id=ANY($2::uuid[])) ORDER BY performed_at DESC`,
      [farmId, fieldIds, from],
    );
  }

  private farmerObservations(fieldIds: string[], from: Date): Promise<Record<string, unknown>[]> {
    return this.db.query(
      `SELECT id,field_id AS "fieldId",notes,media_asset_ids AS "mediaAssetIds",observed_at AS "observedAt",created_at AS "ingestedAt",'FARMER' AS source,id::text AS "sourceIdentifier",'RECORDED' AS "sourceStatus" FROM field_inspections WHERE field_id=ANY($1::uuid[]) AND observed_at >= $2 ORDER BY observed_at DESC`,
      [fieldIds, from],
    );
  }

  private previousDiagnoses(fieldIds: string[], from: Date): Promise<Record<string, unknown>[]> {
    return this.db.query(
      `SELECT d.id,cs.field_id AS "fieldId",cs.id AS "scanId",d.screened_condition AS condition,d.confidence,d.disposition,d.is_firm_diagnosis AS "isFirmDiagnosis",mp.predicted_condition AS "modelPrediction",mv.provider,mv.model_id AS "modelId",mv.model_version AS "modelVersion",COALESCE(mp.inference_timestamp,cs.created_at) AS "observedAt",d.created_at AS "ingestedAt",COALESCE(mp.id,d.id)::text AS "sourceIdentifier",COALESCE((SELECT jsonb_agg(jsonb_build_object('category',si.category,'mediaAssetId',si.media_asset_id)) FROM scan_images si WHERE si.scan_id=cs.id),'[]'::jsonb) AS images FROM crop_scans cs JOIN diagnoses d ON d.scan_id=cs.id LEFT JOIN LATERAL (SELECT * FROM model_predictions WHERE scan_id=cs.id ORDER BY inference_timestamp DESC LIMIT 1) mp ON true LEFT JOIN model_versions mv ON mv.id=mp.model_version_id WHERE cs.field_id=ANY($1::uuid[]) AND cs.created_at >= $2 ORDER BY COALESCE(mp.inference_timestamp,cs.created_at) DESC`,
      [fieldIds, from],
    );
  }

  private recoveryChecks(
    farmId: string,
    fieldIds: string[],
    from: Date,
  ): Promise<Record<string, unknown>[]> {
    return this.db.query(
      `SELECT id,farm_id AS "farmId",field_id AS "fieldId",incident_id AS "incidentId",crop_scan_id AS "cropScanId",satellite_capture_id AS "satelliteCaptureId",field_inspection_id AS "fieldInspectionId",status,outcome,observed_at AS "observedAt",created_at AS "ingestedAt",evidence_references AS evidence,'FASALGUARD' AS source,id::text AS "sourceIdentifier" FROM farm_verifications WHERE farm_id=$1 AND observed_at >= $3 AND ($2::uuid[]='{}'::uuid[] OR field_id IS NULL OR field_id=ANY($2::uuid[])) ORDER BY observed_at DESC`,
      [farmId, fieldIds, from],
    );
  }

  private projectFarm(farm: FarmScope, includeGeometry: boolean): Record<string, unknown> {
    const { boundary, centroid, ...safe } = farm;
    return {
      ...safe,
      geometryRef: `/api/v1/farms/${farm.id}/geojson`,
      ...(includeGeometry ? { boundary, centroid } : {}),
    };
  }

  private projectField(field: FieldScope, includeGeometry: boolean): Record<string, unknown> {
    return {
      id: field.id,
      farmId: field.farmId,
      name: field.name,
      status: field.status,
      areaHectares: field.areaHectares,
      bbox: field.bbox,
      geometryRef: `/api/v1/fields/${field.id}/geojson`,
      ...(includeGeometry ? { boundary: field.boundary, centroid: field.centroid } : {}),
    };
  }

  private notFound(): NotFoundException {
    return new NotFoundException({ code: 'FARM_NOT_FOUND', message: 'Farm was not found.' });
  }
}

export function describeFreshness(
  row: Record<string, unknown> | undefined,
  thresholdSeconds: number,
  now = new Date(),
): FreshnessDescriptor {
  if (!row)
    return {
      status: EvidenceFreshness.Missing,
      observedAt: null,
      ingestedAt: null,
      ageSeconds: null,
      thresholdSeconds,
      source: null,
      sourceIdentifier: null,
    };
  const observedAt = row.observedAt as Date | string | undefined;
  const ageSeconds = observedAt
    ? Math.max(0, Math.floor((now.getTime() - new Date(observedAt).getTime()) / 1000))
    : null;
  const sourceStatus = typeof row.sourceStatus === 'string' ? row.sourceStatus : '';
  const estimated = sourceStatus.toUpperCase() === 'ESTIMATED';
  return {
    status: estimated
      ? EvidenceFreshness.Estimated
      : ageSeconds !== null && ageSeconds <= thresholdSeconds
        ? EvidenceFreshness.Fresh
        : EvidenceFreshness.Stale,
    observedAt: observedAt ?? null,
    ingestedAt: (row.ingestedAt as Date | string | undefined) ?? null,
    ageSeconds,
    thresholdSeconds,
    source: (row.source as string | undefined) ?? null,
    sourceIdentifier: (row.sourceIdentifier as string | undefined) ?? null,
  };
}

function evidenceFor(row: TimelineEvent): EvidenceReference {
  return {
    id: `${row.type}:${row.id}`,
    type: row.type,
    source: row.source,
    sourceIdentifier: row.sourceIdentifier,
    observedAt: row.occurredAt,
    ingestedAt: row.occurredAt,
  };
}

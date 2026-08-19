import { ForbiddenException, Injectable, Logger, NotFoundException } from '@nestjs/common';
import { InjectQueue } from '@nestjs/bullmq';
import { InjectDataSource } from '@nestjs/typeorm';
import type { Queue } from 'bullmq';
import { DataSource } from 'typeorm';
import { FarmBrainService } from '../farm-brain/farm-brain.service';
import { RiskEngine, type RiskEvidence, type RiskRules } from './risk.engine';
import { FieldRiskLevel, RiskTrigger } from './risk.enums';
export const FIELD_RISK_QUEUE = 'field-risk-assessment';
export interface FieldRiskJob {
  fieldId: string;
  trigger: RiskTrigger;
}
interface Context {
  fieldId: string;
  cropCycleId: string | null;
  cropId: string | null;
  cropName: string | null;
  growthStage: string | null;
}
interface RulesRow {
  rulesetVersion: string;
  weights: Record<string, number>;
  thresholds: RiskRules['thresholds'];
  validityHours: number;
  validationStatus: string;
  description: string;
}
@Injectable()
export class RiskAssessmentService {
  private readonly logger = new Logger(RiskAssessmentService.name);
  constructor(
    @InjectDataSource() private readonly db: DataSource,
    @InjectQueue(FIELD_RISK_QUEUE) private readonly queue: Queue<FieldRiskJob>,
    private readonly engine: RiskEngine,
    private readonly farmBrain: FarmBrainService,
  ) {}
  async get(userId: string, fieldId: string): Promise<unknown> {
    const context = await this.context(fieldId, userId);
    const current = await this.db.query<Array<Record<string, unknown>>>(
      `SELECT fra.id,fra.field_id "fieldId",fra.score,fra.level,fra.evidence,fra.factors,fra.ruleset_version "rulesetVersion",fra.trigger_source "triggerSource",fra.valid_until "validUntil",fra.created_at "generatedAt",jsonb_build_object('version',rr.ruleset_version,'validationStatus',rr.validation_status,'description',rr.description) ruleset FROM field_risk_assessments fra JOIN field_risk_rulesets rr ON rr.ruleset_version=fra.ruleset_version WHERE fra.field_id=$1 AND fra.valid_until>now() ORDER BY fra.created_at DESC LIMIT 1`,
      [fieldId],
    );
    return current[0]
      ? {
          ...current[0],
          crop: { id: context.cropId, name: context.cropName, growthStage: context.growthStage },
          disclaimer:
            'This explainable assessment indicates inspection priority and does not predict or diagnose disease.',
        }
      : this.assess(context, RiskTrigger.Api);
  }
  async assessField(fieldId: string, trigger: RiskTrigger): Promise<unknown> {
    return this.assess(await this.context(fieldId), trigger);
  }
  async enqueue(fieldId: string | undefined | null, trigger: RiskTrigger): Promise<void> {
    if (!fieldId) return;
    const bucket = Math.floor(Date.now() / 300000);
    await this.queue.add(
      'field-risk:assess',
      { fieldId, trigger },
      {
        jobId: `risk-${fieldId}-${trigger}-${bucket}`,
        attempts: 3,
        backoff: { type: 'exponential', delay: 1000 },
        removeOnComplete: 1000,
        removeOnFail: 5000,
      },
    );
  }
  async enqueueNearbyOutbreak(fieldId: string, cropId: string): Promise<void> {
    const fields = await this.db.query<Array<{ id: string }>>(
      `SELECT DISTINCT target.id FROM fields origin JOIN outbreak_settings s ON s.active=true JOIN fields target ON target.deleted_at IS NULL AND ST_DWithin(target.centroid::geography,origin.centroid::geography,s.distance_radius_meters) JOIN LATERAL(SELECT crop_id FROM crop_cycles cc WHERE cc.field_id=target.id AND cc.status='active' AND cc.deleted_at IS NULL ORDER BY cc.created_at DESC LIMIT 1)cycle ON cycle.crop_id=$2 WHERE origin.id=$1 LIMIT 1000`,
      [fieldId, cropId],
    );
    await Promise.all(fields.map((x) => this.enqueue(x.id, RiskTrigger.Outbreak)));
  }
  private async assess(c: Context, trigger: RiskTrigger): Promise<unknown> {
    const rules = (
      await this.db.query<RulesRow[]>(
        `SELECT ruleset_version "rulesetVersion",weights,thresholds,validity_hours "validityHours",validation_status "validationStatus",description FROM field_risk_rulesets WHERE active=true ORDER BY created_at DESC LIMIT 1`,
      )
    )[0];
    if (!rules) throw new NotFoundException('Active field risk ruleset was not found.');
    const weather = (
      await this.db.query<
        Array<{
          id: string;
          suitability: string | null;
          risks: Record<string, unknown>[];
          assessedAt: Date;
        }>
      >(
        `SELECT id,overall_suitability suitability,risks,assessed_at "assessedAt" FROM weather_risk_assessments WHERE field_id=$1 ORDER BY assessed_at DESC LIMIT 1`,
        [c.fieldId],
      )
    )[0];
    const reports = (
      await this.db.query<Array<{ count: number; confirmed: number; ids: string[] }>>(
        `SELECT count(*)::integer count,count(*)FILTER(WHERE expert_confirmed)::integer confirmed,COALESCE(array_agg(cr.id),'{}') ids FROM community_reports cr JOIN outbreak_settings s ON s.active=true WHERE cr.crop_id=$2 AND cr.abuse_status='ACCEPTED' AND cr.reported_at>=now()-make_interval(hours=>s.time_window_hours) AND ST_DWithin(cr.private_location::geography,(SELECT centroid::geography FROM fields WHERE id=$1),s.distance_radius_meters)`,
        [c.fieldId, c.cropId],
      )
    )[0];
    const outbreaks = (
      await this.db.query<Array<{ count: number; ids: string[] }>>(
        `SELECT count(*)::integer count,COALESCE(array_agg(oc.id),'{}') ids FROM outbreak_clusters oc JOIN outbreak_settings s ON s.active=true WHERE oc.crop_id=$2 AND oc.status='CONFIRMED' AND ST_DWithin(oc.private_centroid::geography,(SELECT centroid::geography FROM fields WHERE id=$1),s.distance_radius_meters)`,
        [c.fieldId, c.cropId],
      )
    )[0];
    const health = await this.db.query<Array<{ id: string; score: number; createdAt: Date }>>(
      `SELECT id,score,created_at "createdAt" FROM field_health_scores WHERE field_id=$1 ORDER BY created_at DESC LIMIT 2`,
      [c.fieldId],
    );
    const history = (
      await this.db.query<Array<{ count: number; highCount: number; ids: string[] }>>(
        `SELECT count(DISTINCT cs.id)::integer count,count(DISTINCT cs.id)FILTER(WHERE sa.severity IN('HIGH','CRITICAL'))::integer "highCount",COALESCE(array_agg(DISTINCT cs.id),'{}') ids FROM crop_scans cs LEFT JOIN severity_assessments sa ON sa.scan_id=cs.id WHERE cs.field_id=$1 AND cs.created_at>now()-interval '90 days'`,
        [c.fieldId],
      )
    )[0];
    const decline = health.length > 1 ? Math.max(0, health[1]!.score - health[0]!.score) : null;
    const evidence: RiskEvidence[] = [
      {
        key: 'weatherRisk',
        value: weather ? this.weatherScore(weather.suitability) : null,
        description: 'Recent and upcoming weather conditions',
        sourceType: 'WEATHER_RISK_ASSESSMENT',
        sourceId: weather?.id ?? null,
        details: { risks: weather?.risks ?? [], assessedAt: weather?.assessedAt ?? null },
      },
      {
        key: 'nearbyReports',
        value: reports ? Math.min(100, reports.count * 20) : null,
        description: `${reports?.count ?? 0} nearby community reports`,
        sourceType: 'COMMUNITY_REPORT_AGGREGATE',
        sourceId: null,
        details: { anonymousCount: reports?.count ?? 0, reportIds: reports?.ids ?? [] },
      },
      {
        key: 'confirmedOutbreak',
        value: outbreaks ? Math.min(100, outbreaks.count * 50) : null,
        description: `${outbreaks?.count ?? 0} nearby expert-confirmed outbreaks`,
        sourceType: 'OUTBREAK_CLUSTER_AGGREGATE',
        sourceId: null,
        details: { clusterIds: outbreaks?.ids ?? [] },
      },
      {
        key: 'satelliteDecline',
        value: decline === null ? null : Math.min(100, decline * 2),
        description:
          decline === null
            ? 'Satellite health trend'
            : `Field health score declined ${decline.toFixed(1)} points`,
        sourceType: 'FIELD_HEALTH_SCORE',
        sourceId: health[0]?.id ?? null,
        details: { latest: health[0]?.score ?? null, previous: health[1]?.score ?? null },
      },
      {
        key: 'fieldHistory',
        value: history
          ? Math.min(
              100,
              history.highCount * 25 + Math.max(0, history.count - history.highCount) * 5,
            )
          : null,
        description: 'Recent field scan and severity history',
        sourceType: 'FIELD_SCAN_HISTORY',
        sourceId: null,
        details: {
          scanCount: history?.count ?? 0,
          highOrCriticalCount: history?.highCount ?? 0,
          scanIds: history?.ids ?? [],
        },
      },
    ];
    const result = this.engine.calculate(evidence, {
      version: rules.rulesetVersion,
      weights: rules.weights,
      thresholds: rules.thresholds,
    });
    const rows = await this.db.query<Array<{ id: string }>>(
      `INSERT INTO field_risk_assessments(field_id,crop_cycle_id,score,level,evidence,factors,ruleset_version,trigger_source,valid_until)VALUES($1,$2,$3,$4,$5,$6,$7,$8,now()+make_interval(hours=>$9))RETURNING id`,
      [
        c.fieldId,
        c.cropCycleId,
        result.score,
        result.level,
        JSON.stringify(result.evidence),
        JSON.stringify(result.factors),
        rules.rulesetVersion,
        trigger,
        rules.validityHours,
      ],
    );
    if (result.level === FieldRiskLevel.High || result.level === FieldRiskLevel.Critical)
      await this.escalateToFarmBrain(c.fieldId, trigger, result.level);
    return {
      id: rows[0]!.id,
      fieldId: c.fieldId,
      crop: { id: c.cropId, name: c.cropName, growthStage: c.growthStage },
      ...result,
      ruleset: {
        version: rules.rulesetVersion,
        validationStatus: rules.validationStatus,
        description: rules.description,
      },
      validUntil: new Date(Date.now() + rules.validityHours * 3600000).toISOString(),
      disclaimer:
        'This explainable assessment indicates inspection priority and does not predict or diagnose disease.',
    };
  }
  /**
   * "Detect signal" for the autonomous Farm Brain investigation loop — a HIGH/CRITICAL
   * explainable risk score is the real signal. This is the one place in the whole product
   * that starts a Gemini investigation without a farmer opening the app first; every other
   * trigger point (weather alerts, satellite anomalies, community outbreaks) already flows
   * through this same risk assessment, so wiring it here covers all of them at once.
   * FarmBrainService.start() already dedupes by evidence hash and enforces the caller's
   * plan entitlement — this is deliberately best-effort: an entitlement limit, a Gemini
   * provider failure, or a deduplicated no-op investigation must never break the risk
   * assessment response that triggered it.
   */
  private async escalateToFarmBrain(
    fieldId: string,
    trigger: RiskTrigger,
    level: FieldRiskLevel,
  ): Promise<void> {
    try {
      const owner: Array<{ farmId: string; userId: string }> = await this.db.query(
        `SELECT fa.id "farmId",fp.user_id "userId" FROM fields fi JOIN farms fa ON fa.id=fi.farm_id JOIN farmer_profiles fp ON fp.id=fa.farmer_id WHERE fi.id=$1 AND fi.deleted_at IS NULL AND fa.deleted_at IS NULL`,
        [fieldId],
      );
      const row = owner[0];
      if (!row) return;
      await this.farmBrain.start(row.userId, row.farmId, fieldId);
    } catch (error) {
      this.logger.warn(
        `Skipped autonomous Farm Brain escalation for field ${fieldId} (trigger=${trigger}, level=${level}): ${error instanceof Error ? error.message : 'unknown error'}`,
      );
    }
  }

  private async context(fieldId: string, userId?: string): Promise<Context> {
    const params: unknown[] = [fieldId];
    let owner = '';
    if (userId) {
      params.push(userId);
      owner = 'AND fp.user_id=$2';
    }
    const rows = await this.db.query<Context[]>(
      `SELECT fi.id "fieldId",cc.id "cropCycleId",cc.crop_id "cropId",c.name "cropName",cc.growth_stage "growthStage" FROM fields fi JOIN farms fa ON fa.id=fi.farm_id JOIN farmer_profiles fp ON fp.id=fa.farmer_id LEFT JOIN LATERAL(SELECT * FROM crop_cycles x WHERE x.field_id=fi.id AND x.status='active' AND x.deleted_at IS NULL ORDER BY x.created_at DESC LIMIT 1)cc ON true LEFT JOIN crops c ON c.id=cc.crop_id WHERE fi.id=$1 AND fi.deleted_at IS NULL ${owner}`,
      params,
    );
    if (rows[0]) return rows[0];
    if (userId) {
      const exists = await this.db.query<unknown[]>(
        `SELECT 1 FROM fields WHERE id=$1 AND deleted_at IS NULL`,
        [fieldId],
      );
      if (exists.length) throw new ForbiddenException('You do not have access to this field.');
    }
    throw new NotFoundException('Field was not found.');
  }
  private weatherScore(x: string | null): number {
    return x === 'CRITICAL'
      ? 100
      : x === 'HARMFUL'
        ? 80
        : x === 'CAUTION'
          ? 55
          : x === 'MOSTLY_BENEFICIAL'
            ? 20
            : x === 'BENEFICIAL'
              ? 5
              : 40;
  }
}

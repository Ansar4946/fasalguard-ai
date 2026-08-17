import { Injectable, NotFoundException } from '@nestjs/common';
import { InjectDataSource } from '@nestjs/typeorm';
import { DataSource } from 'typeorm';
import { SeverityEngine, type EvidenceKey, type SeverityEvidence } from './severity.engine';
interface ScanRow {
  id: string;
  fieldId: string | null;
  condition: string | null;
  confidence: number | null;
}
interface RulesetRow {
  id: string;
  engineVersion: string;
  weights: Record<EvidenceKey, number>;
  thresholds: { moderate: number; high: number; critical: number };
  status: string;
  source: string;
}
@Injectable()
export class SeverityService {
  constructor(
    @InjectDataSource() private readonly db: DataSource,
    private readonly engine: SeverityEngine,
  ) {}
  async calculate(userId: string, scanId: string): Promise<unknown> {
    const scan = await this.scan(userId, scanId);
    const rules = (
      await this.db.query<RulesetRow[]>(
        `SELECT id,engine_version AS "engineVersion",weights,thresholds,status,source FROM severity_rulesets WHERE key='DEMO_RULESET' AND active=true ORDER BY created_at DESC LIMIT 1`,
      )
    )[0]!;
    const answers = await this.db.query<Array<{ key: string; answer: string; id: string }>>(
      `SELECT q.library_key AS key,a.answer_text AS answer,a.id FROM follow_up_answers a JOIN follow_up_questions q ON q.id=a.question_id WHERE q.scan_id=$1`,
      [scanId],
    );
    const spread = answers.find((x) => x.key === 'SPREADING');
    const extent = answers.find((x) => x.key === 'FIELD_PERCENT');
    const percentage = this.percentage(extent?.answer);
    const rapid = spread ? /(rapid|quick|fast|yes|spreading)/i.test(spread.answer) : false;
    const satellite = scan.fieldId
      ? (
          await this.db.query<Array<{ id: string; score: number }>>(
            `SELECT sz.id,sz.score FROM satellite_stress_zones sz JOIN satellite_captures sc ON sc.id=sz.capture_id WHERE sc.field_id=$1 ORDER BY sc.acquisition_date DESC,sz.score DESC LIMIT 1`,
            [scan.fieldId],
          )
        )[0]
      : undefined;
    const weather = scan.fieldId
      ? (
          await this.db.query<Array<{ id: string; suitability: string | null }>>(
            `SELECT id,overall_suitability AS suitability FROM weather_risk_assessments WHERE field_id=$1 ORDER BY assessed_at DESC LIMIT 1`,
            [scan.fieldId],
          )
        )[0]
      : undefined;
    const history = scan.fieldId
      ? (
          await this.db.query<Array<{ count: string }>>(
            `SELECT count(*)::text count FROM crop_scans WHERE field_id=$1 AND id<>$2 AND status IN('DIAGNOSED','EXPERT_REVIEW','VERIFIED','RESOLVED')`,
            [scan.fieldId, scanId],
          )
        )[0]
      : undefined;
    const confidence = scan.confidence;
    const evidence: SeverityEvidence[] = [
      this.e(
        'imageConfidenceRisk',
        confidence === null ? null : (1 - confidence) * 100,
        'MODEL_PREDICTION',
        scanId,
        'Lower image-model certainty',
      ),
      this.e('visualExtent', null, 'IMAGE_QUALITY', null, 'Visual symptom extent'),
      this.e(
        'fieldAffected',
        percentage,
        'FOLLOW_UP_ANSWER',
        extent?.id ?? null,
        'Farmer-reported affected field percentage',
      ),
      this.e(
        'spreadRate',
        spread ? (rapid ? 90 : 20) : null,
        'FOLLOW_UP_ANSWER',
        spread?.id ?? null,
        'Farmer-reported spread rate',
      ),
      this.e(
        'historyTrend',
        history ? Math.min(100, Number(history.count) * 20) : null,
        'CROP_SCAN_HISTORY',
        scan.fieldId,
        'Previous scan history',
      ),
      this.e(
        'satelliteDecline',
        satellite ? Math.max(0, Math.min(100, satellite.score)) : null,
        'SATELLITE_STRESS_ZONE',
        satellite?.id ?? null,
        'Satellite vegetation decline',
      ),
      this.e('nearbyReports', null, 'COMMUNITY_REPORT', null, 'Nearby community reports'),
      this.e(
        'weatherRisk',
        weather ? this.weatherScore(weather.suitability) : null,
        'WEATHER_RISK_ASSESSMENT',
        weather?.id ?? null,
        'Recent weather risk',
      ),
    ];
    const result = this.engine.calculate(
      evidence,
      { engineVersion: rules.engineVersion, weights: rules.weights, thresholds: rules.thresholds },
      {
        lowConfidence: confidence === null || confidence < 0.65,
        rapidSpread: rapid,
        unknownCondition: !scan.condition || /unknown/i.test(scan.condition),
      },
    );
    const rows = await this.db.query<Array<{ id: string }>>(
      `INSERT INTO severity_assessments(scan_id,ruleset_id,severity,calculated_score,factors,weights_used,evidence_references,engine_version,explanation,expert_escalation,escalation_reasons,generated_at) VALUES($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12) RETURNING id`,
      [
        scanId,
        rules.id,
        result.severity,
        result.calculatedScore,
        JSON.stringify(result.factors),
        JSON.stringify(result.weightsUsed),
        JSON.stringify(result.evidenceReferences),
        result.engineVersion,
        JSON.stringify(result.explanation),
        result.expertEscalation,
        JSON.stringify(result.escalationReasons),
        result.generatedAt,
      ],
    );
    return {
      id: rows[0]!.id,
      ...result,
      ruleset: {
        key: 'DEMO_RULESET',
        status: rules.status,
        source: rules.source,
        productionApproved: false,
      },
    };
  }
  async latest(userId: string, scanId: string): Promise<unknown> {
    await this.scan(userId, scanId);
    const rows = await this.db.query<Array<Record<string, unknown>>>(
      `SELECT sa.*,sr.key AS ruleset_key,sr.status AS ruleset_status,sr.source AS ruleset_source FROM severity_assessments sa JOIN severity_rulesets sr ON sr.id=sa.ruleset_id WHERE sa.scan_id=$1 ORDER BY sa.generated_at DESC LIMIT 1`,
      [scanId],
    );
    if (!rows[0]) throw new NotFoundException('Severity assessment was not found.');
    return rows[0];
  }
  private async scan(userId: string, id: string): Promise<ScanRow> {
    const rows = await this.db.query<ScanRow[]>(
      `SELECT cs.id,cs.field_id AS "fieldId",d.screened_condition AS condition,d.confidence FROM crop_scans cs LEFT JOIN diagnoses d ON d.scan_id=cs.id WHERE cs.id=$1 AND cs.owner_id=$2`,
      [id, userId],
    );
    if (!rows[0]) throw new NotFoundException('Crop scan was not found.');
    return rows[0];
  }
  private e(
    key: EvidenceKey,
    value: number | null,
    type: string,
    id: string | null,
    description: string,
  ): SeverityEvidence {
    return { key, value, reference: { type, id }, description };
  }
  private percentage(value?: string): number | null {
    if (!value) return null;
    const match = value.match(/(\d+(?:\.\d+)?)\s*%?/);
    return match ? Math.max(0, Math.min(100, Number(match[1]))) : null;
  }
  private weatherScore(value: string | null): number {
    return value === 'CRITICAL'
      ? 100
      : value === 'HARMFUL'
        ? 80
        : value === 'CAUTION'
          ? 55
          : value === 'MOSTLY_BENEFICIAL'
            ? 20
            : 10;
  }
}

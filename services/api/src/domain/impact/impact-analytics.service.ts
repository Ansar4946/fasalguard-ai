import { Injectable } from '@nestjs/common';
import { InjectDataSource } from '@nestjs/typeorm';
import { DataSource } from 'typeorm';
/* eslint-disable @typescript-eslint/explicit-function-return-type */

function rate(numerator: number, denominator: number): number | null {
  return denominator > 0 ? numerator / denominator : null;
}

/**
 * Every value here is derived from real, persisted `farm_incidents`/`farm_interventions`/
 * `farm_verifications`/`notifications`/`farmer_tasks` rows — matching the never-fabricate
 * discipline used by `AdminBillingService`/`AiOperationsAnalyticsService`/`FunnelAnalyticsService`.
 * Every rate is reported alongside its own sampleSize so a rate computed from a handful of
 * incidents is visibly low-confidence rather than presented with false authority. Individual
 * accounts flagged `is_test_account` are excluded from the admin-wide summary.
 */
@Injectable()
export class ImpactAnalyticsService {
  constructor(@InjectDataSource() private readonly db: DataSource) {}

  async summary() {
    const rows = await this.db.query<Array<Record<string, string | null>>>(`
      WITH scoped_incidents AS (
        SELECT i.* FROM farm_incidents i
        JOIN farms fa ON fa.id=i.farm_id
        JOIN farmer_profiles fp ON fp.id=fa.farmer_id
        LEFT JOIN users u ON u.id=fp.user_id
        WHERE u.id IS NULL OR u.is_test_account=false
      )
      SELECT
        (SELECT avg(extract(epoch FROM (i.detected_at - r.created_at))) FROM scoped_incidents i JOIN farm_brain_runs r ON r.id=i.investigation_run_id)::text "avgDetectionLatencySeconds",
        (SELECT count(*) FROM scoped_incidents i WHERE i.investigation_run_id IS NOT NULL)::text "detectionLatencySampleSize",

        (SELECT avg(extract(epoch FROM (n.created_at - i.detected_at))) FROM scoped_incidents i JOIN notifications n ON n.incident_id=i.id)::text "avgNotificationLatencySeconds",
        (SELECT count(*) FROM scoped_incidents i JOIN notifications n ON n.incident_id=i.id)::text "notificationLatencySampleSize",

        (SELECT avg(extract(epoch FROM (n.read_at - n.created_at))) FROM scoped_incidents i JOIN notifications n ON n.incident_id=i.id WHERE n.read_at IS NOT NULL)::text "avgAcknowledgementLatencySeconds",
        (SELECT count(*) FROM scoped_incidents i JOIN notifications n ON n.incident_id=i.id WHERE n.read_at IS NOT NULL)::text "acknowledgementSampleSize",

        (SELECT count(*) FILTER (WHERE t.status='COMPLETED') FROM farmer_tasks t LEFT JOIN users u ON u.id=t.user_id WHERE t.source='AI_ACTION_PLAN' AND t.deleted_at IS NULL AND (u.id IS NULL OR u.is_test_account=false))::text "aiTasksCompleted",
        (SELECT count(*) FROM farmer_tasks t LEFT JOIN users u ON u.id=t.user_id WHERE t.source='AI_ACTION_PLAN' AND t.deleted_at IS NULL AND (u.id IS NULL OR u.is_test_account=false))::text "aiTasksTotal",

        (SELECT count(*) FROM scoped_incidents WHERE state='RESOLVED')::text "incidentsResolved",
        (SELECT count(*) FROM scoped_incidents WHERE state<>'DISMISSED')::text "incidentsEligibleForResolution",

        (SELECT count(DISTINCT i.id) FROM scoped_incidents i JOIN farm_verifications v ON v.incident_id=i.id)::text "incidentsWithFollowUp",
        (SELECT count(*) FROM scoped_incidents)::text "incidentsTotal",

        (SELECT count(*) FROM scoped_incidents WHERE farmer_confirmed=true)::text "confirmedTrue",
        (SELECT count(*) FROM scoped_incidents WHERE farmer_confirmed IS NOT NULL)::text "confirmedResponses",

        (SELECT avg(confidence - follow_up_risk_score) FROM scoped_incidents WHERE confidence IS NOT NULL AND follow_up_risk_score IS NOT NULL)::text "avgRiskReduction",
        (SELECT count(*) FROM scoped_incidents WHERE confidence IS NOT NULL AND follow_up_risk_score IS NOT NULL)::text "riskReductionSampleSize",

        (SELECT avg(follow_up_affected_area_hectares - initial_affected_area_hectares) FROM scoped_incidents WHERE follow_up_affected_area_hectares IS NOT NULL AND initial_affected_area_hectares IS NOT NULL)::text "avgAffectedAreaChangeHectares",
        (SELECT count(*) FROM scoped_incidents WHERE follow_up_affected_area_hectares IS NOT NULL AND initial_affected_area_hectares IS NOT NULL)::text "affectedAreaChangeSampleSize"
    `);
    const r = rows[0] ?? {};
    const num = (key: string): number => Number(r[key] ?? 0);
    const nullableNum = (key: string): number | null => (r[key] === null ? null : Number(r[key]));

    return {
      generatedAt: new Date().toISOString(),
      scope: 'real-persisted-incident-outcomes',
      policy: {
        excludesTestAccounts: true,
        neverClaimsLossPrevented: true,
        note: 'time_to_detection is measured as investigation-start → incident-created latency (FasalGuard has no independent ground truth for when a crop problem actually began, only for when its own pipeline started investigating). risk_reduction and affected_area_change are directional, model- and satellite-derived signals comparing initial vs. follow-up snapshots — they are not agronomic loss verification and must never be presented as "crop loss prevented."',
      },
      timeToDetection: {
        avgSeconds: nullableNum('avgDetectionLatencySeconds'),
        sampleSize: num('detectionLatencySampleSize'),
      },
      timeToNotification: {
        avgSeconds: nullableNum('avgNotificationLatencySeconds'),
        sampleSize: num('notificationLatencySampleSize'),
      },
      timeToAcknowledgement: {
        avgSeconds: nullableNum('avgAcknowledgementLatencySeconds'),
        sampleSize: num('acknowledgementSampleSize'),
      },
      taskCompletionRate: {
        rate: rate(num('aiTasksCompleted'), num('aiTasksTotal')),
        sampleSize: num('aiTasksTotal'),
      },
      incidentResolutionRate: {
        rate: rate(num('incidentsResolved'), num('incidentsEligibleForResolution')),
        sampleSize: num('incidentsEligibleForResolution'),
      },
      followUpCompletionRate: {
        rate: rate(num('incidentsWithFollowUp'), num('incidentsTotal')),
        sampleSize: num('incidentsTotal'),
      },
      confirmedAlertRate: {
        rate: rate(num('confirmedTrue'), num('confirmedResponses')),
        sampleSize: num('confirmedResponses'),
      },
      riskReduction: {
        avg: nullableNum('avgRiskReduction'),
        sampleSize: num('riskReductionSampleSize'),
      },
      affectedAreaChangeHectares: {
        avg: nullableNum('avgAffectedAreaChangeHectares'),
        sampleSize: num('affectedAreaChangeSampleSize'),
      },
    };
  }

  /** Scoped to one farmer's own incidents on one farm — already scoped to a real, single user, so no test-account filter is needed. */
  async mySeasonSummary(userId: string, farmId: string) {
    const rows = await this.db.query<Array<Record<string, string | null>>>(
      `WITH my_incidents AS (
         SELECT i.* FROM farm_incidents i
         JOIN farms fa ON fa.id=i.farm_id
         JOIN farmer_profiles fp ON fp.id=fa.farmer_id
         WHERE fp.user_id=$1 AND fa.id=$2
       )
       SELECT
         (SELECT count(*) FROM my_incidents)::text "incidentsTotal",
         (SELECT count(*) FROM my_incidents WHERE state='RESOLVED')::text "incidentsResolved",
         (SELECT count(*) FROM my_incidents WHERE state<>'DISMISSED')::text "incidentsEligibleForResolution",
         (SELECT avg(extract(epoch FROM (resolved_at - detected_at))) FROM my_incidents WHERE resolved_at IS NOT NULL)::text "avgResolutionSeconds",
         (SELECT count(*) FROM my_incidents WHERE resolved_at IS NOT NULL)::text "resolutionLatencySampleSize",
         (SELECT count(*) FILTER (WHERE t.status='COMPLETED') FROM farmer_tasks t JOIN fields fi ON fi.id=t.field_id WHERE t.user_id=$1 AND fi.farm_id=$2 AND t.source='AI_ACTION_PLAN' AND t.deleted_at IS NULL)::text "tasksCompleted",
         (SELECT count(*) FROM farmer_tasks t JOIN fields fi ON fi.id=t.field_id WHERE t.user_id=$1 AND fi.farm_id=$2 AND t.source='AI_ACTION_PLAN' AND t.deleted_at IS NULL)::text "tasksTotal",
         (SELECT avg(confidence - follow_up_risk_score) FROM my_incidents WHERE confidence IS NOT NULL AND follow_up_risk_score IS NOT NULL)::text "avgRiskReduction",
         (SELECT count(*) FROM my_incidents WHERE confidence IS NOT NULL AND follow_up_risk_score IS NOT NULL)::text "riskReductionSampleSize"
      `,
      [userId, farmId],
    );
    const r = rows[0] ?? {};
    const num = (key: string): number => Number(r[key] ?? 0);
    const nullableNum = (key: string): number | null => (r[key] === null ? null : Number(r[key]));
    return {
      generatedAt: new Date().toISOString(),
      policy: { neverClaimsLossPrevented: true },
      incidentsTotal: num('incidentsTotal'),
      incidentsResolved: num('incidentsResolved'),
      resolutionRate: rate(num('incidentsResolved'), num('incidentsEligibleForResolution')),
      avgResolutionSeconds: nullableNum('avgResolutionSeconds'),
      resolutionLatencySampleSize: num('resolutionLatencySampleSize'),
      taskCompletionRate: rate(num('tasksCompleted'), num('tasksTotal')),
      riskReduction: {
        avg: nullableNum('avgRiskReduction'),
        sampleSize: num('riskReductionSampleSize'),
      },
    };
  }
}

import { Injectable } from '@nestjs/common';
import { InjectDataSource } from '@nestjs/typeorm';
import { DataSource } from 'typeorm';
/* eslint-disable @typescript-eslint/explicit-function-return-type */
@Injectable()
export class AnalyticsService {
  constructor(@InjectDataSource() private readonly db: DataSource) {}
  async impact() {
    const rows = await this.db.query<Array<Record<string, string | null>>>(`SELECT
(SELECT count(*) FROM users WHERE role='FARMER' AND deleted_at IS NULL)::text "registeredFarmers",
(SELECT count(*) FROM farms WHERE deleted_at IS NULL)::text "activeFarms",
(SELECT count(*) FROM fields WHERE deleted_at IS NULL)::text "activeFields",
(SELECT count(*) FROM satellite_captures)::text "satelliteScans",
(SELECT count(*) FROM crop_scans)::text "cropScans",
(SELECT count(*) FROM expert_reviews WHERE decision='CONFIRMED')::text "expertConfirmedCases",
(SELECT count(*) FROM analytics_events WHERE event_type='ALERT_GENERATED')::text "alertsGenerated",
(SELECT count(DISTINCT actor_id) FROM analytics_events WHERE event_type='FARMER_ALERTED')::text "farmersAlerted",
(SELECT count(*) FROM outbreak_clusters)::text "outbreakClusters",
(SELECT avg(extract(epoch from (h.responded_at-a.assigned_at))/60) FROM expert_assignments a JOIN LATERAL (SELECT min(created_at) responded_at FROM case_status_history WHERE review_id=a.review_id AND actor_id=a.expert_id AND created_at>=a.assigned_at) h ON h.responded_at IS NOT NULL)::text "averageExpertResponseMinutes",
(SELECT count(*) FROM expert_reviews WHERE status='RESOLVED')::text "resolvedCases"`);
    const r = rows[0] ?? {};
    return {
      generatedAt: new Date().toISOString(),
      scope: 'aggregate',
      metrics: Object.fromEntries(
        Object.entries(r).map(([k, v]) => [k, v === null ? null : Number(v)]),
      ),
    };
  }

  async viability() {
    const rows = await this.db.query<
      Array<Record<string, string | null> & { revenueByCurrency: Record<string, number> | null }>
    >(`SELECT
      (SELECT count(DISTINCT pu.user_id) FROM pilot_users pu JOIN organizations o ON o.id=pu.organization_id WHERE o.evidence_class IN('LIVE','PILOT') AND pu.status IN('ONBOARDED','ACTIVE') AND pu.onboarded_at IS NOT NULL)::text "farmersOnboarded",
      (SELECT count(DISTINCT f.id) FROM farms f JOIN farmer_profiles fp ON fp.id=f.farmer_id JOIN pilot_users pu ON pu.user_id=fp.user_id JOIN organizations o ON o.id=pu.organization_id WHERE o.evidence_class IN('LIVE','PILOT') AND f.deleted_at IS NULL AND (EXISTS(SELECT 1 FROM satellite_captures sc WHERE sc.field_id IN(SELECT id FROM fields WHERE farm_id=f.id)) OR EXISTS(SELECT 1 FROM farm_brain_runs br WHERE br.farm_id=f.id AND br.status='COMPLETED')))::text "farmsMonitored",
      (SELECT count(*) FROM farm_brain_runs r JOIN pilot_users pu ON pu.user_id=r.user_id JOIN organizations o ON o.id=pu.organization_id WHERE o.evidence_class IN('LIVE','PILOT') AND r.status='COMPLETED')::text "geminiAnalyses",
      (SELECT count(DISTINCT r.id) FROM farm_brain_runs r JOIN farm_brain_run_evidence e ON e.run_id=r.id JOIN pilot_users pu ON pu.user_id=r.user_id JOIN organizations o ON o.id=pu.organization_id WHERE o.evidence_class IN('LIVE','PILOT') AND r.status='COMPLETED' AND e.evidence_type='anomalyEvidence')::text "anomaliesInvestigated",
      (SELECT count(*) FROM farm_incidents i JOIN farms f ON f.id=i.farm_id JOIN farmer_profiles fp ON fp.id=f.farmer_id JOIN pilot_users pu ON pu.user_id=fp.user_id JOIN organizations o ON o.id=pu.organization_id WHERE o.evidence_class IN('LIVE','PILOT') AND i.state IN('ACTION_REQUIRED','MONITORING','RECOVERING','RESOLVED'))::text "incidentsConfirmed",
      (SELECT count(*) FROM farm_brain_tool_calls tc JOIN farm_brain_runs r ON r.id=tc.run_id JOIN pilot_users pu ON pu.user_id=r.user_id JOIN organizations o ON o.id=pu.organization_id WHERE o.evidence_class IN('LIVE','PILOT') AND tc.name IN('createIncident','createInspectionTask','scheduleFollowUp','sendFarmerAlert','requestFarmerPhoto','escalateToExpert') AND tc.status IN('AWAITING_CONFIRMATION','CONFIRMED','EXECUTED'))::text "actionsGenerated",
      (SELECT count(*) FROM farmer_tasks t JOIN pilot_users pu ON pu.user_id=t.user_id JOIN organizations o ON o.id=pu.organization_id WHERE o.evidence_class IN('LIVE','PILOT') AND t.source='AI_ACTION_PLAN' AND t.status='COMPLETED')::text "followUpsCompleted",
      (SELECT count(DISTINCT s.organization_id) FROM subscriptions s JOIN organizations o ON o.id=s.organization_id WHERE o.evidence_class='LIVE' AND EXISTS(SELECT 1 FROM subscription_payments p WHERE p.subscription_id=s.id AND p.status='PAID' AND p.verified_at IS NOT NULL))::text "customersPaid",
      (SELECT COALESCE(jsonb_object_agg(currency,total), '{}'::jsonb) FROM (SELECT p.currency,sum(p.amount_minor)::numeric total FROM subscription_payments p JOIN subscriptions s ON s.id=p.subscription_id JOIN organizations o ON o.id=s.organization_id WHERE o.evidence_class='LIVE' AND p.status='PAID' AND p.verified_at IS NOT NULL GROUP BY p.currency) paid)::jsonb "revenueByCurrency",
      (SELECT count(*) FROM user_feedback uf JOIN pilot_users pu ON pu.user_id=uf.user_id JOIN organizations o ON o.id=pu.organization_id WHERE o.evidence_class IN('LIVE','PILOT'))::text "feedbackRecords"`);
    const r = rows[0] ?? ({} as Record<string, string | null>);
    const revenue = r.revenueByCurrency ?? {};
    return {
      generatedAt: new Date().toISOString(),
      scope: 'verified-live-and-pilot-evidence',
      policy: {
        excludesEvidenceClasses: ['DEMO', 'TEST'],
        revenueRequiresVerifiedPayment: true,
        mixedCurrenciesAreNeverSummed: true,
      },
      metrics: {
        farmersOnboarded: Number(r.farmersOnboarded ?? 0),
        farmsMonitored: Number(r.farmsMonitored ?? 0),
        geminiAnalyses: Number(r.geminiAnalyses ?? 0),
        anomaliesInvestigated: Number(r.anomaliesInvestigated ?? 0),
        incidentsConfirmed: Number(r.incidentsConfirmed ?? 0),
        actionsGenerated: Number(r.actionsGenerated ?? 0),
        followUpsCompleted: Number(r.followUpsCompleted ?? 0),
        customersPaid: Number(r.customersPaid ?? 0),
        revenueMinorByCurrency: Object.fromEntries(
          Object.entries(revenue).map(([currency, amount]) => [currency, Number(amount)]),
        ),
        feedbackRecords: Number(r.feedbackRecords ?? 0),
      },
    };
  }
}

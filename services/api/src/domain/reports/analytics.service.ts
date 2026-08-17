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
}

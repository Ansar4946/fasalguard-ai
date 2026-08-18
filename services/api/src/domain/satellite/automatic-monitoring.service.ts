import { Injectable } from '@nestjs/common';
import { Cron } from '@nestjs/schedule';
import { InjectDataSource } from '@nestjs/typeorm';
import { InjectQueue } from '@nestjs/bullmq';
import type { Queue } from 'bullmq';
import type { Polygon } from 'geojson';
import { DataSource } from 'typeorm';
export const SATELLITE_MONITORING_QUEUE = 'satellite-monitoring';
export interface MonitoringJob {
  fieldId: string;
  polygon: Polygon;
  lastSuccessfulCaptureAt: string | null;
}
@Injectable()
export class AutomaticMonitoringService {
  constructor(
    @InjectDataSource() private readonly db: DataSource,
    @InjectQueue(SATELLITE_MONITORING_QUEUE) private readonly queue: Queue<MonitoringJob>,
  ) {}
  @Cron('*/10 * * * *') async dispatchDueFields(): Promise<number> {
    // Satellite monitoring is a paid-plan entitlement (`satelliteMonitoring` in
    // subscription_plans.limits) — gated here (own subscription, then pilot-org
    // subscription, then deny) so an upgrade/downgrade takes effect on the next tick
    // with no per-field backfill needed.
    const rows: Array<{
      fieldId: string;
      boundary: Polygon;
      lastSuccessfulCaptureAt: Date | null;
    }> = await this.db.query(
      `WITH due AS (
         SELECT fi.id FROM fields fi
         JOIN farms f ON f.id=fi.farm_id
         JOIN farmer_profiles fp ON fp.id=f.farmer_id
         WHERE fi.status='active' AND fi.deleted_at IS NULL AND fi.next_satellite_check_at<=now()
           AND COALESCE(
             (SELECT (sp.limits->>'satelliteMonitoring')::boolean FROM subscriptions s JOIN subscription_plans sp ON sp.code=s.plan_code WHERE s.user_id=fp.user_id AND s.status IN('TRIAL','ACTIVE') ORDER BY s.created_at DESC LIMIT 1),
             (SELECT (sp.limits->>'satelliteMonitoring')::boolean FROM pilot_users pu JOIN subscriptions s ON s.organization_id=pu.organization_id JOIN subscription_plans sp ON sp.code=s.plan_code WHERE pu.user_id=fp.user_id AND s.status IN('TRIAL','ACTIVE') ORDER BY s.created_at DESC LIMIT 1),
             false
           )
         ORDER BY fi.next_satellite_check_at FOR UPDATE SKIP LOCKED LIMIT 100
       )
       UPDATE fields fi SET next_satellite_check_at=now()+interval '30 minutes',updated_at=now()
       FROM due WHERE fi.id=due.id
       RETURNING fi.id "fieldId",ST_AsGeoJSON(fi.boundary)::json boundary,fi.last_successful_capture_at "lastSuccessfulCaptureAt"`,
    );
    for (const row of rows)
      await this.queue.add(
        'satellite:monitor',
        {
          fieldId: row.fieldId,
          polygon: row.boundary,
          lastSuccessfulCaptureAt: row.lastSuccessfulCaptureAt?.toISOString() ?? null,
        },
        {
          jobId: `${row.fieldId}-${Math.floor(Date.now() / 1800000)}`,
          attempts: 1,
          removeOnComplete: 1000,
          removeOnFail: 5000,
        },
      );
    return rows.length;
  }
}

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
    const rows: Array<{
      fieldId: string;
      boundary: Polygon;
      lastSuccessfulCaptureAt: Date | null;
    }> = await this.db.query(
      `WITH due AS (SELECT fi.id FROM fields fi WHERE fi.status='active' AND fi.deleted_at IS NULL AND fi.next_satellite_check_at<=now() ORDER BY fi.next_satellite_check_at FOR UPDATE SKIP LOCKED LIMIT 100) UPDATE fields fi SET next_satellite_check_at=now()+interval '30 minutes',updated_at=now() FROM due WHERE fi.id=due.id RETURNING fi.id "fieldId",ST_AsGeoJSON(fi.boundary)::json boundary,fi.last_successful_capture_at "lastSuccessfulCaptureAt"`,
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

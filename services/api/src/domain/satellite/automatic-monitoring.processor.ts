import { Inject } from '@nestjs/common';
import { Processor, WorkerHost } from '@nestjs/bullmq';
import { InjectQueue } from '@nestjs/bullmq';
import { InjectDataSource } from '@nestjs/typeorm';
import { ConfigService } from '@nestjs/config';
import type { Job, Queue } from 'bullmq';
import { DataSource } from 'typeorm';
import {
  SATELLITE_PROVIDER,
  SatelliteProviderError,
  type SatelliteProvider,
} from './providers/satellite.provider';
import { SATELLITE_MONITORING_QUEUE } from './automatic-monitoring.service';
import { SATELLITE_QUEUE, type SatelliteJob } from './satellite.service';
import type { MonitoringJob } from './automatic-monitoring.service';
@Processor(SATELLITE_MONITORING_QUEUE, { concurrency: 2, limiter: { max: 20, duration: 60_000 } })
export class AutomaticMonitoringProcessor extends WorkerHost {
  constructor(
    @InjectDataSource() private readonly db: DataSource,
    @InjectQueue(SATELLITE_QUEUE) private readonly pipeline: Queue<SatelliteJob>,
    @Inject(SATELLITE_PROVIDER) private readonly provider: SatelliteProvider,
    private readonly config: ConfigService,
  ) {
    super();
  }
  async process(job: Job<MonitoringJob>): Promise<void> {
    const x = job.data;
    const interval = this.config.get<number>('satelliteMonitoringIntervalHours', 8);
    const threshold = this.config.get<number>('satelliteMaxCloudCoverage', 30);
    try {
      const to = new Date();
      const from = x.lastSuccessfulCaptureAt
        ? new Date(x.lastSuccessfulCaptureAt)
        : new Date(to.getTime() - 14 * 86400000);
      const scenes = await this.provider.searchCatalog({
        polygon: x.polygon,
        from,
        to,
        maxCloudCoverage: 100,
        limit: 20,
      });
      const existing: Array<{ provider_scene_id: string }> = await this.db.query(
        `SELECT provider_scene_id FROM satellite_captures WHERE field_id=$1 AND provider_scene_id IS NOT NULL`,
        [x.fieldId],
      );
      const seen = new Set(existing.map((v) => v.provider_scene_id));
      const newest = scenes
        .filter((v) => v.cloudCoverage <= threshold && !seen.has(v.id))
        .sort((a, b) => b.acquiredAt.getTime() - a.acquiredAt.getTime())[0];
      if (!newest) {
        await this.success(x.fieldId, interval);
        return;
      }
      const captures: Array<{ id: string }> = await this.db.query(
        `INSERT INTO satellite_captures(field_id,provider,provider_scene_id,satellite,acquisition_date,cloud_coverage,processing_status,raw_metadata,requested_from,requested_to) VALUES($1,'COPERNICUS_SENTINEL_HUB',$2,$3,$4,$5,'PROCESSING',$6,$7,$8) ON CONFLICT(field_id,provider,provider_scene_id) WHERE provider_scene_id IS NOT NULL DO NOTHING RETURNING id`,
        [
          x.fieldId,
          newest.id,
          newest.satellite,
          newest.acquiredAt,
          newest.cloudCoverage,
          newest.rawMetadata,
          from,
          to,
        ],
      );
      if (captures[0])
        await this.pipeline.add(
          'satellite:process',
          {
            captureId: captures[0].id,
            fieldId: x.fieldId,
            polygon: x.polygon,
            from: from.toISOString(),
            to: to.toISOString(),
            maxCloudCoverage: threshold,
          },
          {
            // BullMQ rejects ':' in a custom jobId ("Custom Id cannot contain :").
            jobId: `${captures[0].id}-satellite_process`,
            attempts: 4,
            backoff: { type: 'exponential', delay: 1500 },
            removeOnComplete: 1000,
            removeOnFail: 5000,
          },
        );
      await this.success(x.fieldId, interval);
    } catch (error) {
      const normalized =
        error instanceof SatelliteProviderError
          ? error
          : new SatelliteProviderError(
              'PROVIDER_OUTAGE',
              'Satellite provider is unavailable.',
              true,
            );
      const permanent = normalized.code === 'PROVIDER_AUTH_FAILED';
      await this.failure(x.fieldId, interval, permanent);
      /* Provider failures only update monitoring state; no farmer alert is created. */
    }
  }
  private async success(fieldId: string, hours: number): Promise<void> {
    await this.db.query(
      `UPDATE fields SET last_satellite_check_at=now(),next_satellite_check_at=now()+($2||' hours')::interval,satellite_check_failure_count=0,updated_at=now() WHERE id=$1`,
      [fieldId, hours],
    );
  }
  private async failure(fieldId: string, hours: number, permanent: boolean): Promise<void> {
    await this.db.query(
      `UPDATE fields SET last_satellite_check_at=now(),satellite_check_failure_count=satellite_check_failure_count+1,next_satellite_check_at=now()+(LEAST($2*power(2,satellite_check_failure_count),$3)||' hours')::interval,updated_at=now() WHERE id=$1`,
      [fieldId, permanent ? 12 : 1, hours * 4],
    );
  }
}

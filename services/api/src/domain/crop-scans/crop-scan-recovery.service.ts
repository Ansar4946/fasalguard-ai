import { Injectable, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { Cron } from '@nestjs/schedule';
import { InjectDataSource } from '@nestjs/typeorm';
import { DataSource } from 'typeorm';
import { CropScanStatus } from './crop-scan.enums';

export const ANALYSIS_TIMED_OUT = 'ANALYSIS_TIMED_OUT';
const DEFAULT_STALE_SECONDS = 900;

/**
 * Lease recovery for crop scans. Every status transition touches `updated_at`, so a scan that sits in
 * IMAGE_VALIDATION or ANALYSING longer than the lease (worker killed, job lost with the broker, attempts
 * exhausted) has no live owner. It is moved to NEEDS_FOLLOW_UP with a typed code so the farmer can retry
 * (`analyse` accepts that state and replaces the dead queue job). The UPDATE re-checks the lease, so a
 * scan that progressed meanwhile is never touched; concurrent sweeps are harmless.
 */
@Injectable()
export class CropScanRecoveryService {
  private readonly logger = new Logger(CropScanRecoveryService.name);
  constructor(
    @InjectDataSource() private readonly db: DataSource,
    private readonly config: ConfigService,
  ) {}

  @Cron('*/1 * * * *')
  async scheduledSweep(): Promise<void> {
    try {
      await this.recoverStale();
    } catch {
      this.logger.warn('crop scan recovery sweep failed');
    }
  }

  async recoverStale(): Promise<number> {
    const leaseSeconds = this.config.get<number>('cropScanLeaseSeconds', DEFAULT_STALE_SECONDS);
    // DataSource.query() on UPDATE...RETURNING yields [rows, affectedCount].
    const [rows] = await this.db.query<[Array<{ id: string }>, number]>(
      `UPDATE crop_scans SET status=$1,failure_code=$2,updated_at=now(),version=version+1
       WHERE id IN (SELECT id FROM crop_scans WHERE status = ANY($3::text[])
                    AND updated_at < now() - make_interval(secs => $4) ORDER BY updated_at LIMIT 100 FOR UPDATE SKIP LOCKED)
         AND status = ANY($3::text[]) AND updated_at < now() - make_interval(secs => $4)
       RETURNING id`,
      [
        CropScanStatus.NeedsFollowUp,
        ANALYSIS_TIMED_OUT,
        [CropScanStatus.ImageValidation, CropScanStatus.Analysing],
        leaseSeconds,
      ],
    );
    if (rows.length) this.logger.warn(`recovered ${rows.length} stale crop scan(s)`);
    return rows.length;
  }
}

import { Injectable, Logger, NotFoundException, ServiceUnavailableException } from '@nestjs/common';
import { InjectDataSource } from '@nestjs/typeorm';
import { DataSource } from 'typeorm';
import { LifecycleEmailService } from '../growth/lifecycle-email.service';
import { RiskTrigger } from '../risk/risk.enums';
import { RiskAssessmentService } from '../risk/risk.service';
import { CropScanStatus } from './crop-scan.enums';
import type { CropScanEventName } from './dto/internal-crop-scan-event.dto';

interface ScanRow {
  ownerId: string;
  fieldId: string | null;
  status: CropScanStatus;
  condition: string | null;
  disposition: string | null;
}

/**
 * Applies the side effects NestJS still owns for scans analysed by the Python service. Both are
 * idempotent: the risk job id is bucketed per field/trigger, and the lifecycle email is sent once.
 * Only ids are logged.
 */
@Injectable()
export class InternalCropScanEventsService {
  private readonly logger = new Logger(InternalCropScanEventsService.name);
  constructor(
    @InjectDataSource() private readonly db: DataSource,
    private readonly fieldRisk: RiskAssessmentService,
    private readonly lifecycle: LifecycleEmailService,
  ) {}

  async handle(
    event: CropScanEventName,
    scanId: string,
  ): Promise<{ accepted: true; applied: boolean }> {
    const rows = await this.db.query<ScanRow[]>(
      `SELECT cs.owner_id AS "ownerId",cs.field_id AS "fieldId",cs.status,d.screened_condition AS condition,d.disposition
       FROM crop_scans cs LEFT JOIN diagnoses d ON d.scan_id=cs.id WHERE cs.id=$1`,
      [scanId],
    );
    const scan = rows[0];
    if (!scan)
      throw new NotFoundException({
        code: 'CROP_SCAN_NOT_FOUND',
        message: 'Crop scan was not found.',
      });
    let applied = false;
    try {
      if (event === 'ANALYSIS_REQUESTED') {
        await this.fieldRisk.enqueue(scan.fieldId, RiskTrigger.FarmerScan);
        applied = true;
      } else if (scan.status === CropScanStatus.Diagnosed && scan.condition) {
        applied = await this.notifyFirstDiagnosis(scan, scanId);
      }
    } catch {
      this.logger.warn(`crop scan event ${event} could not be applied for scan ${scanId}`);
      throw new ServiceUnavailableException({
        code: 'CROP_SCAN_EVENT_UNAVAILABLE',
        message: 'The event could not be applied right now. Retry later.',
      });
    }
    this.logger.log(`crop scan event ${event} accepted for scan ${scanId} applied=${applied}`);
    return { accepted: true, applied };
  }

  private async notifyFirstDiagnosis(scan: ScanRow, scanId: string): Promise<boolean> {
    const count = await this.db.query<Array<{ count: string }>>(
      `SELECT count(*)::text count FROM crop_scans cs JOIN diagnoses d ON d.scan_id=cs.id WHERE cs.owner_id=$1 AND d.disposition='SCREENING_COMPLETE'`,
      [scan.ownerId],
    );
    if (scan.disposition !== 'SCREENING_COMPLETE' || Number(count[0]?.count ?? 0) !== 1)
      return false;
    const ctx = await this.db.query<Array<{ email: string | null; fieldName: string | null }>>(
      `SELECT u.email,fi.name "fieldName" FROM users u LEFT JOIN crop_scans cs ON cs.id=$2 LEFT JOIN fields fi ON fi.id=cs.field_id WHERE u.id=$1`,
      [scan.ownerId, scanId],
    );
    const row = ctx[0];
    if (!row?.email) return false;
    // notifyInsightReady is consent-gated and sends at most once per user (sentOnce), so replays are safe.
    await this.lifecycle.notifyInsightReady(
      scan.ownerId,
      row.email,
      row.fieldName ?? 'your crop scan',
      scan.condition!,
      scanId,
    );
    return true;
  }
}

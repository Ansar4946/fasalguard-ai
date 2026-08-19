import {
  BadRequestException,
  ForbiddenException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { InjectQueue } from '@nestjs/bullmq';
import { InjectDataSource } from '@nestjs/typeorm';
import type { Queue } from 'bullmq';
import { DataSource } from 'typeorm';
import { ConfigService } from '@nestjs/config';
import type { AddScanImageDto, CreateCropScanDto } from './dto/crop-scan.dto';
import { CropScanStatus } from './crop-scan.enums';
import { RiskAssessmentService } from '../risk/risk.service';
import { RiskTrigger } from '../risk/risk.enums';
export const CROP_SCAN_QUEUE = 'crop-image-screening';
export interface CropScanJob {
  scanId: string;
  ownerId: string;
}
@Injectable()
export class CropScanService {
  constructor(
    @InjectDataSource() private readonly db: DataSource,
    @InjectQueue(CROP_SCAN_QUEUE) private readonly queue: Queue<CropScanJob>,
    private readonly config: ConfigService,
    private readonly fieldRisk: RiskAssessmentService,
  ) {}
  async create(ownerId: string, dto: CreateCropScanDto): Promise<unknown> {
    if (dto.fieldId) await this.ownedField(ownerId, dto.fieldId);
    const policy = {
      minimumConfidence: this.config.get<number>('visionMinimumConfidence', 0.65),
      expertReviewBelow: this.config.get<number>('visionExpertReviewBelow', 0.85),
    };
    const rows = await this.db.query<Array<{ id: string }>>(
      `INSERT INTO crop_scans(owner_id,field_id,status,confidence_policy) VALUES($1,$2,$3,$4) RETURNING id`,
      [ownerId, dto.fieldId ?? null, CropScanStatus.Created, JSON.stringify(policy)],
    );
    return this.get(ownerId, rows[0]!.id);
  }
  async addImage(ownerId: string, scanId: string, dto: AddScanImageDto): Promise<unknown> {
    await this.require(ownerId, scanId);
    const media = await this.db.query<Array<{ id: string }>>(
      `SELECT id FROM media_assets WHERE id=$1 AND owner_id=$2 AND purpose='crop-scan' AND status='ready'`,
      [dto.mediaId, ownerId],
    );
    if (!media[0])
      throw new BadRequestException({
        code: 'INVALID_SCAN_MEDIA',
        message: 'Image must be a completed private crop-scan upload owned by the farmer.',
      });
    await this.db.query(
      `INSERT INTO scan_images(scan_id,media_asset_id,category) VALUES($1,$2,$3) ON CONFLICT(scan_id,media_asset_id) DO UPDATE SET category=excluded.category,updated_at=now()`,
      [scanId, dto.mediaId, dto.category],
    );
    await this.db.query(
      `UPDATE crop_scans SET status=$2,updated_at=now(),version=version+1 WHERE id=$1`,
      [scanId, CropScanStatus.Uploading],
    );
    return this.get(ownerId, scanId);
  }
  async analyse(ownerId: string, scanId: string): Promise<unknown> {
    const scan = await this.require(ownerId, scanId);
    const count = await this.db.query<Array<{ count: string }>>(
      `SELECT count(*)::text count FROM scan_images WHERE scan_id=$1`,
      [scanId],
    );
    if (Number(count[0]?.count ?? 0) < 1)
      throw new BadRequestException({
        code: 'SCAN_IMAGE_REQUIRED',
        message: 'Add at least one completed crop image before analysis.',
      });
    if (
      ![CropScanStatus.Created, CropScanStatus.Uploading, CropScanStatus.NeedsFollowUp].includes(
        scan.status,
      )
    )
      throw new BadRequestException({
        code: 'SCAN_NOT_READY',
        message: 'This scan cannot be analysed in its current state.',
      });
    await this.db.query(
      `UPDATE crop_scans SET status=$2,failure_code=NULL,updated_at=now(),version=version+1 WHERE id=$1`,
      [scanId, CropScanStatus.ImageValidation],
    );
    await this.queue.add(
      'crop-scan:analyse',
      { scanId, ownerId },
      {
        jobId: `crop-scan-${scanId}`,
        attempts: 3,
        backoff: { type: 'exponential', delay: 1000 },
        removeOnComplete: 1000,
        removeOnFail: 5000,
      },
    );
    const field = await this.db.query<Array<{ field_id: string | null }>>(
      `SELECT field_id FROM crop_scans WHERE id=$1`,
      [scanId],
    );
    await this.fieldRisk.enqueue(field[0]?.field_id, RiskTrigger.FarmerScan);
    return this.get(ownerId, scanId);
  }
  async get(ownerId: string, scanId: string): Promise<unknown> {
    await this.require(ownerId, scanId);
    const rows = await this.db.query<Array<Record<string, unknown>>>(
      `SELECT cs.id,cs.field_id AS "fieldId",cs.status,cs.confidence_policy AS "confidencePolicy",cs.failure_code AS "failureCode",cs.created_at AS "createdAt",COALESCE(jsonb_agg(DISTINCT jsonb_build_object('id',si.id,'mediaId',si.media_asset_id,'category',si.category,'widthPixels',si.width_pixels,'heightPixels',si.height_pixels)) FILTER(WHERE si.id IS NOT NULL),'[]') AS images,d.screened_condition AS "screenedCondition",d.confidence,d.disposition,d.is_firm_diagnosis AS "isFirmDiagnosis",d.disclaimer FROM crop_scans cs LEFT JOIN scan_images si ON si.scan_id=cs.id LEFT JOIN diagnoses d ON d.scan_id=cs.id WHERE cs.id=$1 AND cs.owner_id=$2 GROUP BY cs.id,d.id`,
      [scanId, ownerId],
    );
    return rows[0];
  }
  /** Recent, diagnosed scans for one field — used to let a farmer pick real evidence for an incident follow-up. */
  async listRecentForField(ownerId: string, fieldId: string): Promise<unknown[]> {
    return this.db.query(
      `SELECT cs.id,cs.created_at AS "createdAt",d.screened_condition AS "screenedCondition"
       FROM crop_scans cs LEFT JOIN diagnoses d ON d.scan_id=cs.id
       WHERE cs.owner_id=$1 AND cs.field_id=$2 AND cs.status IN($3,$4,$5,$6)
       ORDER BY cs.created_at DESC LIMIT 10`,
      [
        ownerId,
        fieldId,
        CropScanStatus.Diagnosed,
        CropScanStatus.ExpertReview,
        CropScanStatus.Verified,
        CropScanStatus.Resolved,
      ],
    );
  }
  private async require(
    ownerId: string,
    id: string,
  ): Promise<{ id: string; status: CropScanStatus }> {
    const rows = await this.db.query<Array<{ id: string; status: CropScanStatus }>>(
      `SELECT id,status FROM crop_scans WHERE id=$1 AND owner_id=$2`,
      [id, ownerId],
    );
    if (!rows[0])
      throw new NotFoundException({
        code: 'CROP_SCAN_NOT_FOUND',
        message: 'Crop scan was not found.',
      });
    return rows[0];
  }
  private async ownedField(ownerId: string, fieldId: string): Promise<void> {
    const rows = await this.db.query<Array<{ id: string }>>(
      `SELECT 1 FROM fields fi JOIN farms f ON f.id=fi.farm_id JOIN farmer_profiles fp ON fp.id=f.farmer_id WHERE fi.id=$1 AND fp.user_id=$2 AND fi.deleted_at IS NULL`,
      [fieldId, ownerId],
    );
    if (!rows.length) throw new ForbiddenException('You do not have access to this field.');
  }
}

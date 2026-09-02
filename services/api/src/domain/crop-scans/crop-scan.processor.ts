import { Inject } from '@nestjs/common';
import { Processor, WorkerHost } from '@nestjs/bullmq';
import { InjectDataSource } from '@nestjs/typeorm';
import type { Job } from 'bullmq';
import { DataSource } from 'typeorm';
import type sharpFactory from 'sharp';
// eslint-disable-next-line @typescript-eslint/no-require-imports -- sharp is an export= CommonJS module
const sharp = require('sharp') as typeof sharpFactory;
import {
  OBJECT_STORAGE_PROVIDER,
  type ObjectStorageProvider,
} from '../media/storage/object-storage.provider';
import { CropScanStatus, type ScanImageCategory } from './crop-scan.enums';
import {
  VISION_DIAGNOSIS_PROVIDER,
  type VisionDiagnosisProvider,
  type VisionInput,
} from './providers/vision-diagnosis.provider';
import { CROP_SCAN_QUEUE, type CropScanJob } from './crop-scan.service';
import { MetricsService } from '../../observability/metrics.service';
import { AIOperation, AIRunStatus, HumanReviewStatus } from '../ai-ops/ai-run.enums';
import { AIRunLogger } from '../ai-ops/ai-run-logger.service';
import { LifecycleEmailService } from '../growth/lifecycle-email.service';
interface ImageRow {
  id: string;
  objectKey: string;
  contentType: string;
  sizeBytes: string;
  category: ScanImageCategory;
}
@Processor(CROP_SCAN_QUEUE, { concurrency: 2, lockDuration: 120000 })
export class CropScanProcessor extends WorkerHost {
  constructor(
    @InjectDataSource() private readonly db: DataSource,
    @Inject(OBJECT_STORAGE_PROVIDER) private readonly storage: ObjectStorageProvider,
    @Inject(VISION_DIAGNOSIS_PROVIDER) private readonly vision: VisionDiagnosisProvider,
    private readonly lifecycle: LifecycleEmailService,
    private readonly aiRunLogger: AIRunLogger,
    private readonly metrics: MetricsService = new MetricsService(),
  ) {
    super();
  }
  async process(job: Job<CropScanJob>): Promise<void> {
    const jobStarted = Date.now();
    this.metrics.observe(
      'fasalguard_queue_latency_seconds',
      Math.max(0, jobStarted - job.timestamp) / 1000,
      { queue: CROP_SCAN_QUEUE },
    );
    try {
      const images = await this.db.query<ImageRow[]>(
        `SELECT si.id,ma.object_key AS "objectKey",ma.content_type AS "contentType",ma.size_bytes AS "sizeBytes",si.category FROM scan_images si JOIN media_assets ma ON ma.id=si.media_asset_id JOIN crop_scans cs ON cs.id=si.scan_id WHERE si.scan_id=$1 AND cs.owner_id=$2 AND ma.status='ready'`,
        [job.data.scanId, job.data.ownerId],
      );
      const inputs: VisionInput[] = [];
      let qualityFailed = false;
      const qualityIssueCodes = new Set<string>();
      for (const row of images) {
        if (Number(row.sizeBytes) > 15 * 1024 * 1024) throw new Error('IMAGE_TOO_LARGE');
        const image = await this.storage.getPrivateObject(row.objectKey);
        let metadata;
        try {
          metadata = await sharp(image, { failOn: 'error' }).metadata();
          await sharp(image).toBuffer();
        } catch {
          throw new Error('CORRUPT_IMAGE');
        }
        if (!metadata.width || !metadata.height || metadata.width < 320 || metadata.height < 320)
          throw new Error('IMAGE_DIMENSIONS_TOO_SMALL');
        await this.db.query(
          `UPDATE scan_images SET width_pixels=$2,height_pixels=$3,updated_at=now() WHERE id=$1`,
          [row.id, metadata.width, metadata.height],
        );
        const input = { image, contentType: row.contentType, category: row.category };
        inputs.push(input);
        const quality = await this.vision.assessQuality(input);
        qualityFailed ||= !quality.acceptable;
        quality.issues.forEach((issue) => qualityIssueCodes.add(issue.code));
        await this.db.query(
          `INSERT INTO image_quality_results(scan_image_id,acceptable,issues,provider_metadata) VALUES($1,$2,$3,$4) ON CONFLICT(scan_image_id) DO UPDATE SET acceptable=excluded.acceptable,issues=excluded.issues,provider_metadata=excluded.provider_metadata,updated_at=now()`,
          [
            row.id,
            quality.acceptable,
            JSON.stringify(quality.issues),
            JSON.stringify(quality.metadata ?? {}),
          ],
        );
      }
      if (qualityFailed) {
        await this.db.query(
          `UPDATE crop_scans SET status=$2,failure_code=$3,updated_at=now(),version=version+1 WHERE id=$1`,
          [
            job.data.scanId,
            CropScanStatus.NeedsFollowUp,
            [...qualityIssueCodes].join(',') || 'IMAGE_QUALITY_REJECTED',
          ],
        );
        return;
      }
      await this.status(job.data.scanId, CropScanStatus.Analysing);
      const inferenceStarted = Date.now();
      const prediction = await this.vision.predict(inputs);
      this.metrics.observe(
        'fasalguard_crop_inference_duration_seconds',
        (Date.now() - inferenceStarted) / 1000,
        { provider: this.vision.constructor.name },
      );
      if (prediction.confidence < 0 || prediction.confidence > 1)
        throw new Error('INVALID_PROVIDER_CONFIDENCE');
      const model = await this.db.query<Array<{ id: string }>>(
        `INSERT INTO model_versions(provider,model_id,model_version) VALUES($1,$2,$3) ON CONFLICT(provider,model_id,model_version) DO UPDATE SET updated_at=now() RETURNING id`,
        [this.vision.constructor.name, prediction.modelId, prediction.modelVersion],
      );
      await this.db.query(
        `INSERT INTO model_predictions(scan_id,model_version_id,predicted_condition,confidence,inference_timestamp,raw_provider_response) VALUES($1,$2,$3,$4,$5,$6)`,
        [
          job.data.scanId,
          model[0]!.id,
          prediction.predictedCondition,
          prediction.confidence,
          prediction.inferenceTimestamp,
          JSON.stringify(prediction.rawProviderResponse),
        ],
      );
      const scan = await this.db.query<
        Array<{ confidence_policy: { minimumConfidence: number; expertReviewBelow: number } }>
      >(`SELECT confidence_policy FROM crop_scans WHERE id=$1`, [job.data.scanId]);
      const policy = scan[0]!.confidence_policy;
      const unknownCondition = isUnknownCondition(prediction.predictedCondition);
      const disposition = unknownCondition
        ? 'EXPERT_REVIEW_RECOMMENDED'
        : prediction.confidence < policy.minimumConfidence
          ? 'BETTER_IMAGES_REQUIRED'
          : prediction.confidence < policy.expertReviewBelow
            ? 'EXPERT_REVIEW_RECOMMENDED'
            : 'SCREENING_COMPLETE';
      const status =
        disposition === 'BETTER_IMAGES_REQUIRED'
          ? CropScanStatus.NeedsFollowUp
          : disposition === 'EXPERT_REVIEW_RECOMMENDED'
            ? CropScanStatus.ExpertReview
            : CropScanStatus.Diagnosed;
      const diagnoses = await this.db.query<Array<{ id: string }>>(
        `INSERT INTO diagnoses(scan_id,screened_condition,confidence,disposition,is_firm_diagnosis,disclaimer) VALUES($1,$2,$3,$4,false,$5) ON CONFLICT(scan_id) DO UPDATE SET screened_condition=excluded.screened_condition,confidence=excluded.confidence,disposition=excluded.disposition,is_firm_diagnosis=false,disclaimer=excluded.disclaimer,updated_at=now() RETURNING id`,
        [
          job.data.scanId,
          prediction.predictedCondition,
          prediction.confidence,
          disposition,
          'AI image screening is not a confirmed disease diagnosis. Use follow-up evidence or expert verification before treatment.',
        ],
      );
      await this.db.query(`DELETE FROM diagnosis_alternatives WHERE diagnosis_id=$1`, [
        diagnoses[0]!.id,
      ]);
      for (const [i, x] of prediction.alternatives.entries())
        await this.db.query(
          `INSERT INTO diagnosis_alternatives(diagnosis_id,rank,condition,confidence) VALUES($1,$2,$3,$4)`,
          [diagnoses[0]!.id, i + 1, x.condition, x.confidence],
        );
      await this.status(job.data.scanId, status);
      const farmRow: Array<{ farmId: string | null }> = await this.db.query(
        `SELECT f.id "farmId" FROM crop_scans cs LEFT JOIN fields fi ON fi.id=cs.field_id LEFT JOIN farms f ON f.id=fi.farm_id WHERE cs.id=$1`,
        [job.data.scanId],
      );
      await this.aiRunLogger.record({
        userId: job.data.ownerId,
        farmId: farmRow[0]?.farmId ?? null,
        operation: AIOperation.CropAnalysis,
        provider: this.vision.constructor.name,
        model: prediction.modelId,
        status: AIRunStatus.Completed,
        startedAt: new Date(inferenceStarted),
        completedAt: new Date(),
        inputType: 'crop_scan_images',
        confidence: prediction.confidence,
        humanReviewStatus:
          disposition === 'EXPERT_REVIEW_RECOMMENDED'
            ? HumanReviewStatus.Required
            : HumanReviewStatus.NotRequired,
        sourceTable: 'crop_scans',
        sourceId: job.data.scanId,
      });
      if (status === CropScanStatus.Diagnosed)
        await this.notifyIfFirstDiagnosis(
          job.data.ownerId,
          job.data.scanId,
          prediction.predictedCondition,
        );
    } catch (error) {
      this.metrics.increment('fasalguard_queue_failed_jobs_total', { queue: CROP_SCAN_QUEUE });
      this.metrics.increment('fasalguard_external_api_failures_total', { provider: 'vision' });
      await this.db.query(
        `UPDATE crop_scans SET status=$2,failure_code=$3,updated_at=now(),version=version+1 WHERE id=$1`,
        [
          job.data.scanId,
          CropScanStatus.NeedsFollowUp,
          error instanceof Error ? error.message : 'SCREENING_FAILED',
        ],
      );
      await this.aiRunLogger.record({
        userId: job.data.ownerId,
        operation: AIOperation.CropAnalysis,
        provider: this.vision.constructor.name,
        model: 'unknown',
        status: AIRunStatus.Failed,
        startedAt: new Date(jobStarted),
        completedAt: new Date(),
        inputType: 'crop_scan_images',
        errorCode: error instanceof Error ? error.message : 'SCREENING_FAILED',
        sourceTable: 'crop_scans',
        sourceId: job.data.scanId,
      });
      throw error;
    } finally {
      this.metrics.observe(
        'fasalguard_queue_job_duration_seconds',
        (Date.now() - jobStarted) / 1000,
        { queue: CROP_SCAN_QUEUE },
      );
    }
  }
  /** "Insight ready" lifecycle email — first ever fully-screened diagnosis for this farmer.
   * Best-effort: never allowed to affect the scan's own success. */
  private async notifyIfFirstDiagnosis(
    ownerId: string,
    scanId: string,
    predictedCondition: string,
  ): Promise<void> {
    try {
      const diagnosedCount: Array<{ count: string }> = await this.db.query(
        `SELECT count(*)::text count FROM crop_scans cs JOIN diagnoses d ON d.scan_id=cs.id WHERE cs.owner_id=$1 AND d.disposition='SCREENING_COMPLETE'`,
        [ownerId],
      );
      if (Number(diagnosedCount[0]?.count ?? 0) !== 1) return;
      const context: Array<{ email: string | null; fieldName: string | null }> =
        await this.db.query(
          `SELECT u.email,fi.name "fieldName" FROM users u LEFT JOIN crop_scans cs ON cs.id=$2 LEFT JOIN fields fi ON fi.id=cs.field_id WHERE u.id=$1`,
          [ownerId, scanId],
        );
      const row = context[0];
      if (row?.email)
        await this.lifecycle.notifyInsightReady(
          ownerId,
          row.email,
          row.fieldName ?? 'your crop scan',
          predictedCondition,
          scanId,
        );
    } catch {
      /* best-effort */
    }
  }

  private async status(id: string, status: CropScanStatus): Promise<void> {
    await this.db.query(
      `UPDATE crop_scans SET status=$2,updated_at=now(),version=version+1 WHERE id=$1`,
      [id, status],
    );
  }
}

function isUnknownCondition(condition: string): boolean {
  return /(^|[\s_-])(unknown|unsupported|not[\s_-]?cotton|no[\s_-]?plant)([\s_-]|$)/i.test(
    condition,
  );
}

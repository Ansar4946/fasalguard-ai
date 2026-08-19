import type sharpFactory from 'sharp';
// eslint-disable-next-line @typescript-eslint/no-require-imports -- sharp is an export= CommonJS module
const sharp = require('sharp') as typeof sharpFactory;
import type { DataSource } from 'typeorm';
import type { ObjectStorageProvider } from '../src/domain/media/storage/object-storage.provider';
import { CropScanProcessor } from '../src/domain/crop-scans/crop-scan.processor';
import { CropScanStatus, ScanImageCategory } from '../src/domain/crop-scans/crop-scan.enums';
import type { VisionDiagnosisProvider } from '../src/domain/crop-scans/providers/vision-diagnosis.provider';
import type { Job } from 'bullmq';
import type { CropScanJob } from '../src/domain/crop-scans/crop-scan.service';
import type { LifecycleEmailService } from '../src/domain/growth/lifecycle-email.service';
import type { AIRunLogger } from '../src/domain/ai-ops/ai-run-logger.service';
describe('CropScanProcessor with fake provider', () => {
  it('stores normalized low-confidence screening and requests expert review without a firm diagnosis', async () => {
    const buffer = await sharp({
      create: { width: 640, height: 480, channels: 3, background: '#4f8a3c' },
    })
      .jpeg()
      .toBuffer();
    const queries: Array<{ sql: string; params?: unknown[] }> = [];
    const query = jest.fn((sql: string, params?: unknown[]) => {
      queries.push({ sql, params });
      if (sql.includes('FROM scan_images'))
        return Promise.resolve([
          {
            id: 'image-1',
            objectKey: 'crop-scan/private.jpg',
            contentType: 'image/jpeg',
            sizeBytes: String(buffer.length),
            category: ScanImageCategory.LeafFront,
          },
        ]);
      if (sql.includes('SELECT confidence_policy'))
        return Promise.resolve([
          { confidence_policy: { minimumConfidence: 0.65, expertReviewBelow: 0.85 } },
        ]);
      if (sql.includes('INSERT INTO model_versions'))
        return Promise.resolve([{ id: 'model-version-1' }]);
      if (sql.includes('INSERT INTO diagnoses')) return Promise.resolve([{ id: 'diagnosis-1' }]);
      return Promise.resolve([]);
    });
    const db = { query } as unknown as DataSource;
    const getPrivateObject = jest.fn().mockResolvedValue(buffer);
    const storage = {
      getPrivateObject,
    } as unknown as ObjectStorageProvider;
    const assessQuality = jest.fn().mockResolvedValue({ acceptable: true, issues: [] });
    const predict = jest.fn().mockResolvedValue({
      modelId: 'fake-cotton-screen',
      modelVersion: 'test-1',
      predictedCondition: 'possible leaf curl pattern',
      confidence: 0.72,
      alternatives: [{ condition: 'possible nutrient stress', confidence: 0.18 }],
      inferenceTimestamp: '2026-08-13T12:00:00Z',
      rawProviderResponse: { fixture: true },
    });
    const fake: VisionDiagnosisProvider = { assessQuality, predict };
    const lifecycle = { notifyInsightReady: jest.fn() } as unknown as LifecycleEmailService;
    const aiRunLogger = { record: jest.fn() } as unknown as AIRunLogger;
    const processor = new CropScanProcessor(db, storage, fake, lifecycle, aiRunLogger);
    await processor.process({ data: { scanId: 'scan-1', ownerId: 'owner-1' } } as Job<CropScanJob>);
    expect(assessQuality).toHaveBeenCalled();
    expect(predict).toHaveBeenCalled();
    const diagnosis = queries.find((x) => x.sql.includes('INSERT INTO diagnoses'));
    expect(diagnosis?.params).toContain('EXPERT_REVIEW_RECOMMENDED');
    expect(diagnosis?.sql).toContain('false');
    const finalStatus = queries
      .filter((x) => x.sql.includes('UPDATE crop_scans SET status'))
      .at(-1)?.params;
    expect(finalStatus).toContain(CropScanStatus.ExpertReview);
  });
});

/* eslint-disable @typescript-eslint/no-unsafe-argument, @typescript-eslint/no-unsafe-member-access, @typescript-eslint/explicit-function-return-type */
import {
  ConflictException,
  Logger,
  ValidationPipe,
  VersioningType,
  type INestApplication,
} from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { Test } from '@nestjs/testing';
import request = require('supertest'); // eslint-disable-line @typescript-eslint/no-require-imports
import type { DataSource } from 'typeorm';
import { CropScanService, MAX_SCAN_IMAGES } from '../src/domain/crop-scans/crop-scan.service';
import { CropScanRecoveryService } from '../src/domain/crop-scans/crop-scan-recovery.service';
import { CropScanStatus, ScanImageCategory } from '../src/domain/crop-scans/crop-scan.enums';
import { InternalCropScanEventsController } from '../src/domain/crop-scans/internal-crop-scan-events.controller';
import { InternalCropScanEventsService } from '../src/domain/crop-scans/internal-crop-scan-events.service';
import { InternalServiceTokenGuard } from '../src/domain/crop-scans/internal-service-token.guard';
import { CropScanProcessor } from '../src/domain/crop-scans/crop-scan.processor';
import type { Job } from 'bullmq';
import { LocalStorageController } from '../src/domain/media/storage/local-storage.controller';
import { signLocalUploadToken } from '../src/domain/media/storage/local-upload-token';
import type { RiskAssessmentService } from '../src/domain/risk/risk.service';

const SCAN = '0f8fad5b-d9cb-469f-a165-70867728950e';
const MEDIA = '7c9e6679-7425-40de-944b-e07fc1f90ae7';
const TOKEN = 'internal-service-token-for-tests-0123456789';

function config(values: Record<string, unknown> = {}): ConfigService {
  return {
    get: jest.fn((key: string, fallback?: unknown) => values[key] ?? fallback),
    getOrThrow: jest.fn((key: string) => values[key]),
  } as unknown as ConfigService;
}

describe('CropScanService limits and bounded queueing (D5, D7)', () => {
  function build(options: { count: number; attached?: boolean; queue?: Record<string, unknown> }) {
    const queries: Array<{ sql: string; params?: unknown[] }> = [];
    const query = jest.fn((sql: string, params?: unknown[]) => {
      queries.push({ sql, params });
      if (sql.includes('SELECT id,status FROM crop_scans'))
        return Promise.resolve([{ id: SCAN, status: CropScanStatus.Uploading }]);
      if (sql.includes('FROM media_assets')) return Promise.resolve([{ id: MEDIA }]);
      if (sql.includes('bool_or'))
        return Promise.resolve([{ count: String(options.count), attached: options.attached }]);
      if (sql.includes('count(*)::text count FROM scan_images'))
        return Promise.resolve([{ count: String(options.count) }]);
      if (sql.includes('SELECT field_id')) return Promise.resolve([{ field_id: null }]);
      return Promise.resolve([]);
    });
    const queue = {
      getJob: jest.fn().mockResolvedValue(undefined),
      add: jest.fn().mockResolvedValue(undefined),
      ...options.queue,
    };
    const risk = { enqueue: jest.fn().mockResolvedValue(undefined) };
    const service = new CropScanService(
      { query } as unknown as DataSource,
      queue as never,
      config({ cropScanQueueTimeoutMs: 60 }),
      risk as unknown as RiskAssessmentService,
    );
    return { service, queries, queue };
  }

  it('rejects a fourth image with SCAN_IMAGE_LIMIT_REACHED and writes nothing', async () => {
    const { service, queries } = build({ count: MAX_SCAN_IMAGES, attached: false });
    await expect(
      service.addImage('owner', SCAN, { mediaId: MEDIA, category: ScanImageCategory.LeafFront }),
    ).rejects.toMatchObject({ response: { code: 'SCAN_IMAGE_LIMIT_REACHED' }, status: 400 });
    expect(queries.some((q) => q.sql.includes('INSERT INTO scan_images'))).toBe(false);
  });

  it('still lets the farmer change the category of an already attached image at the cap', async () => {
    const { service, queries } = build({ count: MAX_SCAN_IMAGES, attached: true });
    await service.addImage('owner', SCAN, { mediaId: MEDIA, category: ScanImageCategory.LeafBack });
    expect(queries.some((q) => q.sql.includes('INSERT INTO scan_images'))).toBe(true);
  });

  it('answers 503 within the bound when Redis hangs and restores the previous status', async () => {
    const never = new Promise(() => undefined);
    const { service, queries } = build({ count: 1, queue: { getJob: jest.fn(() => never) } });
    const started = Date.now();
    await expect(service.analyse('owner', SCAN)).rejects.toMatchObject({
      status: 503,
      response: { code: 'ANALYSIS_QUEUE_UNAVAILABLE' },
    });
    expect(Date.now() - started).toBeLessThan(2000);
    const revert = queries.at(-1)!;
    expect(revert.sql).toContain('UPDATE crop_scans SET status=$2');
    expect(revert.params).toEqual([SCAN, CropScanStatus.Uploading, CropScanStatus.ImageValidation]);
  });

  it('maps a queue rejection to 503 as well', async () => {
    const { service } = build({
      count: 1,
      queue: { add: jest.fn().mockRejectedValue(new Error('ECONNREFUSED')) },
    });
    await expect(service.analyse('owner', SCAN)).rejects.toMatchObject({ status: 503 });
  });

  it('replaces a finished job with the same id so a retry is really queued', async () => {
    const remove = jest.fn().mockResolvedValue(undefined);
    const { service, queue } = build({
      count: 1,
      queue: { getJob: jest.fn().mockResolvedValue({ isActive: () => false, remove }) },
    });
    await service.analyse('owner', SCAN);
    expect(remove).toHaveBeenCalledTimes(1);
    expect(queue.add).toHaveBeenCalledWith(
      'crop-scan:analyse',
      { scanId: SCAN, ownerId: 'owner' },
      expect.objectContaining({ jobId: `crop-scan-${SCAN}` }),
    );
  });

  it('never removes an active job', async () => {
    const remove = jest.fn();
    const { service } = build({
      count: 1,
      queue: { getJob: jest.fn().mockResolvedValue({ isActive: () => true, remove }) },
    });
    await service.analyse('owner', SCAN);
    expect(remove).not.toHaveBeenCalled();
  });
});

describe('CropScanRecoveryService (D4)', () => {
  it('moves only leased-out IMAGE_VALIDATION/ANALYSING scans to NEEDS_FOLLOW_UP', async () => {
    const query = jest.fn().mockResolvedValue([[{ id: SCAN }], 1]);
    const service = new CropScanRecoveryService(
      { query } as unknown as DataSource,
      config({ cropScanLeaseSeconds: 600 }),
    );
    await expect(service.recoverStale()).resolves.toBe(1);
    const [sql, params] = query.mock.calls[0] as [string, unknown[]];
    expect(sql).toContain('updated_at < now() - make_interval');
    expect(sql).toContain('FOR UPDATE SKIP LOCKED');
    expect(params).toEqual([
      CropScanStatus.NeedsFollowUp,
      'ANALYSIS_TIMED_OUT',
      [CropScanStatus.ImageValidation, CropScanStatus.Analysing],
      600,
    ]);
  });

  it('the scheduled sweep swallows database errors', async () => {
    const service = new CropScanRecoveryService(
      { query: jest.fn().mockRejectedValue(new Error('down')) } as unknown as DataSource,
      config(),
    );
    await expect(service.scheduledSweep()).resolves.toBeUndefined();
  });
});

describe('Local presigned PUT after finalization (D6)', () => {
  const secret = 'integration-test-secret-at-least-32-characters';
  const objectKey = 'crop-scan/u/2026-01-01/x.jpg';
  function controller(status: string | undefined) {
    const putPrivateObject = jest.fn().mockResolvedValue(undefined);
    const db = {
      query: jest.fn().mockResolvedValue(status ? [{ status }] : []),
    } as unknown as DataSource;
    const c = new LocalStorageController(
      { putPrivateObject } as never,
      config({ jwtAccessSecret: secret }),
      db,
    );
    return { c, putPrivateObject };
  }
  const token = () => signLocalUploadToken(secret, objectKey, 'PUT', Date.now() + 60_000);
  const req = { headers: { 'content-type': 'image/jpeg' }, body: Buffer.from('x') } as never;

  it.each(['ready', 'failed', undefined])('rejects a replayed PUT when media is %s', async (s) => {
    const { c, putPrivateObject } = controller(s);
    await expect(c.upload(token(), req)).rejects.toBeInstanceOf(ConflictException);
    expect(putPrivateObject).not.toHaveBeenCalled();
  });

  it('accepts the PUT while the upload is still pending', async () => {
    const { c, putPrivateObject } = controller('pending');
    await c.upload(token(), req);
    expect(putPrivateObject).toHaveBeenCalledTimes(1);
  });
});

describe('POST /api/v1/internal/crop-scan-events', () => {
  let app: INestApplication;
  const risk = { enqueue: jest.fn().mockResolvedValue(undefined) };
  const lifecycle = { notifyInsightReady: jest.fn().mockResolvedValue(undefined) };
  const rows: Record<string, unknown[]> = {};
  const db = {
    query: jest.fn((sql: string) => {
      if (sql.includes('FROM crop_scans cs LEFT JOIN diagnoses')) return Promise.resolve(rows.scan);
      if (sql.includes('count(*)')) return Promise.resolve([{ count: '1' }]);
      if (sql.includes('FROM users u'))
        return Promise.resolve([{ email: 'f@test.invalid', fieldName: 'North' }]);
      return Promise.resolve([]);
    }),
  };
  const scanRow = (patch: Record<string, unknown> = {}) => [
    {
      ownerId: 'owner-1',
      fieldId: 'field-1',
      status: CropScanStatus.Diagnosed,
      condition: 'HealthyLeaf',
      disposition: 'SCREENING_COMPLETE',
      ...patch,
    },
  ];
  const url = '/api/v1/internal/crop-scan-events';

  // The Nest DI token for DataSource/RiskAssessmentService is class based; build explicitly instead.
  beforeAll(async () => {
    const { getDataSourceToken } = await import('@nestjs/typeorm');
    const { RiskAssessmentService: Risk } = await import('../src/domain/risk/risk.service');
    const { LifecycleEmailService: Lifecycle } =
      await import('../src/domain/growth/lifecycle-email.service');
    const moduleRef = await Test.createTestingModule({
      controllers: [InternalCropScanEventsController],
      providers: [
        InternalCropScanEventsService,
        InternalServiceTokenGuard,
        { provide: ConfigService, useValue: config({ INTERNAL_SERVICE_TOKEN: TOKEN }) },
        { provide: getDataSourceToken(), useValue: db },
        { provide: Risk, useValue: risk },
        { provide: Lifecycle, useValue: lifecycle },
      ],
    }).compile();
    app = moduleRef.createNestApplication();
    app.setGlobalPrefix('api');
    app.enableVersioning({ type: VersioningType.URI, defaultVersion: '1' });
    app.useGlobalPipes(
      new ValidationPipe({
        transform: true,
        whitelist: true,
        forbidNonWhitelisted: true,
        forbidUnknownValues: true,
      }),
    );
    await app.init();
  });

  beforeEach(() => {
    jest.clearAllMocks();
    rows.scan = scanRow();
  });
  afterAll(async () => {
    await app?.close();
  });

  const post = (body: unknown, token?: string) => {
    const r = request(app.getHttpServer()).post(url);
    return (token === undefined ? r : r.set('x-internal-token', token)).send(body as object);
  };

  it('rejects a missing token with 401 and does nothing', async () => {
    const res = await post({ event: 'ANALYSIS_REQUESTED', scanId: SCAN });
    expect(res.status).toBe(401);
    expect(risk.enqueue).not.toHaveBeenCalled();
    expect(db.query).not.toHaveBeenCalled();
  });

  it.each(['wrong', TOKEN.slice(0, -1), `${TOKEN}x`, ''])(
    'rejects token %p with 401/403',
    async (t) => {
      const res = await post({ event: 'ANALYSIS_REQUESTED', scanId: SCAN }, t);
      expect([401, 403]).toContain(res.status);
      expect(risk.enqueue).not.toHaveBeenCalled();
    },
  );

  it('answers 403 for a wrong token (not 401)', async () => {
    const res = await post({ event: 'ANALYSIS_REQUESTED', scanId: SCAN }, 'wrong-token');
    expect(res.status).toBe(403);
    expect(JSON.stringify(res.body)).not.toContain(TOKEN);
  });

  it('accepts ANALYSIS_REQUESTED with 202 and enqueues field risk', async () => {
    const res = await post({ event: 'ANALYSIS_REQUESTED', scanId: SCAN }, TOKEN);
    expect(res.status).toBe(202);
    expect(res.body).toEqual({ accepted: true, applied: true });
    expect(risk.enqueue).toHaveBeenCalledWith('field-1', expect.anything());
  });

  it('is idempotent: a replay is accepted again and only repeats idempotent effects', async () => {
    const a = await post({ event: 'SCREENING_COMPLETED', scanId: SCAN }, TOKEN);
    const b = await post({ event: 'SCREENING_COMPLETED', scanId: SCAN }, TOKEN);
    expect([a.status, b.status]).toEqual([202, 202]);
    expect(lifecycle.notifyInsightReady).toHaveBeenCalledTimes(2); // service itself sends once per user (sentOnce)
  });

  it('ignores SCREENING_COMPLETED for a scan that is not diagnosed (202, not applied)', async () => {
    rows.scan = scanRow({ status: CropScanStatus.NeedsFollowUp });
    const res = await post({ event: 'SCREENING_COMPLETED', scanId: SCAN }, TOKEN);
    expect(res.status).toBe(202);
    expect(res.body.applied).toBe(false);
    expect(lifecycle.notifyInsightReady).not.toHaveBeenCalled();
  });

  it('returns 404 for an unknown scan', async () => {
    rows.scan = [];
    const res = await post({ event: 'ANALYSIS_REQUESTED', scanId: SCAN }, TOKEN);
    expect(res.status).toBe(404);
  });

  it.each([
    [{ event: 'ANALYSIS_REQUESTED' }],
    [{ scanId: SCAN }],
    [{ event: 'DROP_TABLE', scanId: SCAN }],
    [{ event: 'ANALYSIS_REQUESTED', scanId: 'not-a-uuid' }],
    [{ event: 'ANALYSIS_REQUESTED', scanId: SCAN, extra: 1 }],
    [{ event: ['ANALYSIS_REQUESTED'], scanId: SCAN }],
  ])('rejects invalid body %j with 400', async (body) => {
    const res = await post(body, TOKEN);
    expect(res.status).toBe(400);
    expect(risk.enqueue).not.toHaveBeenCalled();
  });

  it('never logs the token, valid or not', async () => {
    const spies = (['log', 'warn', 'error', 'debug'] as const).map((m) =>
      jest.spyOn(Logger.prototype, m).mockImplementation(() => undefined),
    );
    await post({ event: 'ANALYSIS_REQUESTED', scanId: SCAN }, TOKEN);
    await post({ event: 'ANALYSIS_REQUESTED', scanId: SCAN }, 'attacker-guess');
    const logged = JSON.stringify(spies.flatMap((s) => s.mock.calls));
    expect(logged).not.toContain(TOKEN);
    expect(logged).not.toContain('attacker-guess');
    spies.forEach((s) => s.mockRestore());
  });

  it('fails closed with 503 when the service token is not configured', () => {
    const guard = new InternalServiceTokenGuard(config());
    const saved = process.env.INTERNAL_SERVICE_TOKEN;
    delete process.env.INTERNAL_SERVICE_TOKEN;
    try {
      expect(() =>
        guard.canActivate({
          switchToHttp: () => ({ getRequest: () => ({ headers: { 'x-internal-token': 'x' } }) }),
        } as never),
      ).toThrow(expect.objectContaining({ status: 503 }));
    } finally {
      if (saved !== undefined) process.env.INTERNAL_SERVICE_TOKEN = saved;
    }
  });
});

describe('CropScanProcessor object integrity (D6)', () => {
  it('refuses to analyse an object whose bytes no longer match the verified checksum', async () => {
    const queries: string[] = [];
    const db = {
      query: jest.fn((sql: string) => {
        queries.push(sql);
        if (sql.includes('FROM scan_images'))
          return Promise.resolve([
            {
              id: 'i1',
              objectKey: 'k',
              contentType: 'image/jpeg',
              sizeBytes: '3',
              checksum: 'a'.repeat(64),
              category: ScanImageCategory.LeafFront,
            },
          ]);
        return Promise.resolve([]);
      }),
    } as unknown as DataSource;
    const vision = { assessQuality: jest.fn(), predict: jest.fn() };
    const processor = new CropScanProcessor(
      db,
      { getPrivateObject: jest.fn().mockResolvedValue(Buffer.from('new')) } as never,
      vision,
      { notifyInsightReady: jest.fn() } as never,
      { record: jest.fn() } as never,
    );
    await expect(
      processor.process({
        data: { scanId: SCAN, ownerId: 'o' },
        timestamp: Date.now(),
      } as Job<never>),
    ).rejects.toThrow('MEDIA_INTEGRITY_FAILED');
    expect(vision.assessQuality).not.toHaveBeenCalled();
    expect(vision.predict).not.toHaveBeenCalled();
  });
});

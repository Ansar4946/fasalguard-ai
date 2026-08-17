/* eslint-disable @typescript-eslint/no-unsafe-argument, @typescript-eslint/no-unsafe-member-access */
import type { INestApplication } from '@nestjs/common';
import { Test } from '@nestjs/testing';
import request = require('supertest'); // eslint-disable-line @typescript-eslint/no-require-imports
import { DataSource } from 'typeorm';
import type sharpFactory from 'sharp';
// eslint-disable-next-line @typescript-eslint/no-require-imports -- sharp is an export= CommonJS module
const sharp = require('sharp') as typeof sharpFactory;
import {
  OBJECT_STORAGE_PROVIDER,
  type ObjectStorageProvider,
} from '../src/domain/media/storage/object-storage.provider';

interface Registered {
  user: { id: string };
  tokens: { accessToken: string };
}
interface PresignResponse {
  media: {
    id: string;
    status: string;
    originalFilename: string;
    metadata: Record<string, unknown>;
  };
  upload: { url: string; method: string; headers: Record<string, string>; expiresAt: string };
}

const integration = process.env.DATABASE_URL ? describe : describe.skip;

integration('Private direct media uploads', () => {
  let app: INestApplication;
  let db: DataSource;
  let storage: ObjectStorageProvider;
  let owner: Registered;
  let stranger: Registered;
  const suffix = Date.now();
  const checksum = 'a'.repeat(64);

  beforeAll(async () => {
    process.env.NODE_ENV = 'test';
    process.env.JWT_ACCESS_SECRET = 'integration-test-secret-at-least-32-characters';
    process.env.JWT_ISSUER = 'fasalguard-api';
    process.env.JWT_AUDIENCE = 'fasalguard-clients';
    process.env.REDIS_URL ??= 'redis://127.0.0.1:6379';
    process.env.OBJECT_STORAGE_PROVIDER = 'mock';
    const [{ AppModule }, { configureApp }] = await Promise.all([
      import('../src/app.module'),
      import('../src/configure-app'),
    ]);
    const testingModule = await Test.createTestingModule({ imports: [AppModule] }).compile();
    app = testingModule.createNestApplication();
    configureApp(app);
    await app.init();
    db = app.get(DataSource);
    storage = app.get<ObjectStorageProvider>(OBJECT_STORAGE_PROVIDER);
    owner = await register(
      `media-owner-${suffix}@test.invalid`,
      'Media Owner',
      'media-owner-device',
    );
    stranger = await register(
      `media-stranger-${suffix}@test.invalid`,
      'Media Stranger',
      'media-stranger-device',
    );
  }, 30_000);

  afterAll(async () => {
    if (db) {
      await db.query(`DELETE FROM media_assets WHERE owner_id IN ($1,$2)`, [
        owner?.user.id,
        stranger?.user.id,
      ]);
      await db.query(`DELETE FROM users WHERE id IN ($1,$2)`, [owner?.user.id, stranger?.user.id]);
    }
    if (app) await app.close();
  });

  it('creates short-lived direct private upload authorization and normalizes filenames', async () => {
    const body = await presign();
    expect(body.media.status).toBe('pending');
    expect(body.media.originalFilename).toBe('cotton-leaf-scan.jpg');
    expect(body.media).not.toHaveProperty('objectKey');
    expect(body.upload.method).toBe('PUT');
    expect(body.upload.url).toContain('temporary=1');
    expect(body.upload.headers['Content-Type']).toBe('image/jpeg');
    expect(new Date(body.upload.expiresAt).getTime()).toBeGreaterThan(Date.now());
    const rows: Array<{ object_key: string }> = await db.query(
      `SELECT object_key FROM media_assets WHERE id=$1`,
      [body.media.id],
    );
    expect(rows[0]!.object_key).toMatch(
      new RegExp(`^crop-scan/${owner.user.id}/\\d{4}-\\d{2}-\\d{2}/`),
    );
  });

  it('completes verified uploads and returns only temporary owner access URLs', async () => {
    const image = await sharp({
      create: { width: 8, height: 8, channels: 3, background: '#4f7d34' },
    })
      .jpeg()
      .toBuffer();
    const presigned = await presign(image.byteLength, null);
    const rows: Array<{ objectKey: string }> = await db.query(
      `SELECT object_key "objectKey" FROM media_assets WHERE id=$1`,
      [presigned.media.id],
    );
    await storage.putPrivateObject({
      objectKey: rows[0]!.objectKey,
      contentType: 'image/jpeg',
      body: image,
    });
    await request(app.getHttpServer())
      .get(`/api/v1/media/${presigned.media.id}/access-url`)
      .set(auth(owner))
      .expect(400);
    const completed = await request(app.getHttpServer())
      .post('/api/v1/uploads/complete')
      .set(auth(owner))
      .send({ mediaId: presigned.media.id })
      .expect(200);
    expect(completed.body.status).toBe('ready');
    expect(completed.body).not.toHaveProperty('objectKey');
    const access = await request(app.getHttpServer())
      .get(`/api/v1/media/${presigned.media.id}/access-url`)
      .set(auth(owner))
      .expect(200);
    expect(access.body.url).toContain('temporary=1');
    expect(access.body.url).not.toContain('public-read');
  });

  it('conceals assets from non-owners for completion and access', async () => {
    const presigned = await presign();
    await request(app.getHttpServer())
      .post('/api/v1/uploads/complete')
      .set(auth(stranger))
      .send({ mediaId: presigned.media.id, checksum })
      .expect(404);
    await request(app.getHttpServer())
      .get(`/api/v1/media/${presigned.media.id}/access-url`)
      .set(auth(stranger))
      .expect(404);
  });

  it('rejects unsupported MIME, excessive size, invalid purpose and unsafe metadata', async () => {
    const base = {
      fileName: 'leaf.exe',
      contentType: 'application/octet-stream',
      sizeBytes: 100,
      purpose: 'crop-scan',
    };
    await request(app.getHttpServer())
      .post('/api/v1/uploads/presign')
      .set(auth(owner))
      .send(base)
      .expect(400);
    await request(app.getHttpServer())
      .post('/api/v1/uploads/presign')
      .set(auth(owner))
      .send({
        ...base,
        fileName: 'leaf.jpg',
        contentType: 'image/jpeg',
        sizeBytes: 16 * 1024 * 1024,
      })
      .expect(400);
    await request(app.getHttpServer())
      .post('/api/v1/uploads/presign')
      .set(auth(owner))
      .send({ ...base, purpose: 'anything', contentType: 'image/jpeg' })
      .expect(400);
    await request(app.getHttpServer())
      .post('/api/v1/uploads/presign')
      .set(auth(owner))
      .send({ ...base, contentType: 'image/jpeg', metadata: { nested: { secret: true } } })
      .expect(400);
  });

  it('requires authentication', async () => {
    await request(app.getHttpServer()).post('/api/v1/uploads/presign').send({}).expect(401);
  });

  async function presign(
    sizeBytes = 4096,
    expectedChecksum: string | null = checksum,
  ): Promise<PresignResponse> {
    return (
      await request(app.getHttpServer())
        .post('/api/v1/uploads/presign')
        .set(auth(owner))
        .send({
          fileName: '../Cotton Leaf Scan.JPG',
          contentType: 'IMAGE/JPEG',
          sizeBytes,
          ...(expectedChecksum ? { checksum: expectedChecksum } : {}),
          purpose: 'crop-scan',
          metadata: { fieldId: 'field-alias', capture: 'camera', reviewed: false },
        })
        .expect(201)
    ).body as PresignResponse;
  }

  async function register(
    email: string,
    fullName: string,
    deviceIdentifier: string,
  ): Promise<Registered> {
    return (
      await request(app.getHttpServer())
        .post('/api/v1/auth/register')
        .send({
          email,
          password: 'A-strong-test-password-123!',
          fullName,
          device: { deviceIdentifier, platform: 'web' },
          consents: [],
        })
        .expect(201)
    ).body as Registered;
  }

  function auth(account: Registered): { Authorization: string } {
    return { Authorization: `Bearer ${account.tokens.accessToken}` };
  }
});

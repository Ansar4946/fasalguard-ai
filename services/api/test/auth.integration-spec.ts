/* eslint-disable @typescript-eslint/no-unsafe-argument, @typescript-eslint/no-unsafe-member-access, @typescript-eslint/no-unnecessary-type-assertion */
import { Controller, Get, type INestApplication } from '@nestjs/common';
import { Test } from '@nestjs/testing';
import request = require('supertest'); // eslint-disable-line @typescript-eslint/no-require-imports
import { DataSource } from 'typeorm';
import { Roles } from '../src/domain/auth/decorators/roles.decorator';
import { UserRole } from '../src/domain/identity/identity.enums';

@Controller({ path: 'test-rbac', version: '1' })
class TestRbacController {
  @Get('admin')
  @Roles(UserRole.Admin)
  admin(): { ok: true } {
    return { ok: true };
  }
}

interface AuthResponse {
  user: { id: string; role: string };
  tokens: { accessToken: string; refreshToken: string };
}

const integration = process.env.DATABASE_URL ? describe : describe.skip;

integration('Authentication and authorization API', () => {
  let app: INestApplication;
  let db: DataSource;
  const email = `auth-${Date.now()}@test.invalid`;
  const password = 'A-strong-test-password-123!';

  beforeAll(async () => {
    process.env.NODE_ENV = 'test';
    process.env.JWT_ACCESS_SECRET = 'integration-test-secret-at-least-32-characters';
    process.env.JWT_ISSUER = 'fasalguard-api';
    process.env.JWT_AUDIENCE = 'fasalguard-clients';
    process.env.REDIS_URL ??= 'redis://localhost:6379';
    process.env.OTP_PROVIDER = 'development';
    const [{ AppModule }, { configureApp }] = await Promise.all([
      import('../src/app.module'),
      import('../src/configure-app'),
    ]);
    const testingModule = await Test.createTestingModule({
      imports: [AppModule],
      controllers: [TestRbacController],
    }).compile();
    app = testingModule.createNestApplication();
    configureApp(app);
    await app.init();
    db = app.get(DataSource);
  }, 30_000);

  afterAll(async () => {
    if (db) await db.query(`DELETE FROM users WHERE email=$1`, [email]);
    if (app) await app.close();
  });

  it('registers only a farmer and records versioned consent', async () => {
    const response = await request(app.getHttpServer())
      .post('/api/v1/auth/register')
      .send({
        email,
        password,
        fullName: 'Integration Farmer',
        device: { deviceIdentifier: 'integration-browser-001', platform: 'web' },
        consents: [
          { type: 'LOCATION_PROCESSING', policyVersion: '2026-08', granted: true },
          { type: 'AI_IMAGE_ANALYSIS', policyVersion: '2026-08', granted: false },
        ],
      })
      .expect(201);
    const body = response.body as AuthResponse;
    expect(body.user.role).toBe('FARMER');
    expect(body.tokens.accessToken).toBeTruthy();
    const rows = (await db.query(
      `SELECT type,policy_version,granted,recorded_at FROM consents WHERE user_id=$1 ORDER BY type`,
      [body.user.id],
    )) as Array<{ type: string; policy_version: string; granted: boolean; recorded_at: Date }>;
    expect(rows).toHaveLength(2);
    expect(rows.every((row) => row.policy_version === '2026-08' && row.recorded_at)).toBe(true);
    const subscriptions = (await db.query(
      `SELECT plan_code,status FROM subscriptions WHERE user_id=$1`,
      [body.user.id],
    )) as Array<{ plan_code: string; status: string }>;
    expect(subscriptions).toEqual([{ plan_code: 'FREE', status: 'ACTIVE' }]);
  });

  it('authenticates, returns the current user, and enforces RBAC', async () => {
    await request(app.getHttpServer()).get('/api/v1/auth/me').expect(401);
    const login = await request(app.getHttpServer())
      .post('/api/v1/auth/login')
      .send({
        identifier: email,
        device: { deviceIdentifier: 'integration-browser-002', platform: 'web' },
      })
      .expect(200);
    const body = login.body as AuthResponse;
    await request(app.getHttpServer())
      .get('/api/v1/auth/me')
      .set('Authorization', `Bearer ${body.tokens.accessToken}`)
      .expect(200)
      .expect(({ body: me }) => expect(me.email).toBe(email));
    await request(app.getHttpServer())
      .get('/api/v1/test-rbac/admin')
      .set('Authorization', `Bearer ${body.tokens.accessToken}`)
      .expect(403);
    await db.query(`UPDATE users SET role='ADMIN' WHERE email=$1`, [email]);
    await request(app.getHttpServer())
      .get('/api/v1/test-rbac/admin')
      .set('Authorization', `Bearer ${body.tokens.accessToken}`)
      .expect(200, { ok: true });
    await db.query(`UPDATE users SET role='FARMER' WHERE email=$1`, [email]);
  });

  it('rotates refresh tokens and revokes the family on reuse', async () => {
    const login = (
      await request(app.getHttpServer())
        .post('/api/v1/auth/login')
        .send({
          identifier: email,
          device: { deviceIdentifier: 'integration-browser-003', platform: 'web' },
        })
        .expect(200)
    ).body as AuthResponse;
    const rotated = (
      await request(app.getHttpServer())
        .post('/api/v1/auth/refresh')
        .send({ refreshToken: login.tokens.refreshToken })
        .expect(200)
    ).body as AuthResponse['tokens'];
    expect(rotated.refreshToken).not.toBe(login.tokens.refreshToken);
    await request(app.getHttpServer())
      .post('/api/v1/auth/refresh')
      .send({ refreshToken: login.tokens.refreshToken })
      .expect(401);
    await request(app.getHttpServer())
      .post('/api/v1/auth/refresh')
      .send({ refreshToken: rotated.refreshToken })
      .expect(401);
  });

  it('lists, revokes one, and revokes all device sessions', async () => {
    const login = (
      await request(app.getHttpServer())
        .post('/api/v1/auth/login')
        .send({
          identifier: email,
          device: { deviceIdentifier: 'integration-browser-004', platform: 'web' },
        })
        .expect(200)
    ).body as AuthResponse;
    const sessions = (
      await request(app.getHttpServer())
        .get('/api/v1/auth/sessions')
        .set('Authorization', `Bearer ${login.tokens.accessToken}`)
        .expect(200)
    ).body as Array<{ id: string; revokedAt: string | null }>;
    const active = sessions.find((item) => !item.revokedAt);
    expect(active).toBeTruthy();
    await request(app.getHttpServer())
      .delete(`/api/v1/auth/sessions/${active!.id}`)
      .set('Authorization', `Bearer ${login.tokens.accessToken}`)
      .expect(204);
    const second = (
      await request(app.getHttpServer())
        .post('/api/v1/auth/login')
        .send({
          identifier: email,
          device: { deviceIdentifier: 'integration-browser-005', platform: 'web' },
        })
        .expect(200)
    ).body as AuthResponse;
    await request(app.getHttpServer())
      .delete('/api/v1/auth/sessions')
      .set('Authorization', `Bearer ${second.tokens.accessToken}`)
      .expect(200)
      .expect(({ body }) => expect(body.revoked).toBeGreaterThan(0));
  });
});

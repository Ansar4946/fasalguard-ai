/* eslint-disable @typescript-eslint/no-unsafe-argument, @typescript-eslint/no-unsafe-member-access */
import type { INestApplication } from '@nestjs/common';
import { Test } from '@nestjs/testing';
import request = require('supertest'); // eslint-disable-line @typescript-eslint/no-require-imports
import { DataSource } from 'typeorm';

// Own app instance on purpose: login is limited to 5 per minute per client and the limit store
// is per app, so these negative cases must not share a budget with the main auth spec.
const integration = process.env.DATABASE_URL ? describe : describe.skip;

integration('Login requires a valid password', () => {
  let app: INestApplication;
  let db: DataSource;
  const email = `login-creds-${Date.now()}@test.invalid`;
  const password = 'A-strong-test-password-123!';
  const device = { deviceIdentifier: 'integration-login-creds', platform: 'web' };

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
    const testingModule = await Test.createTestingModule({ imports: [AppModule] }).compile();
    app = testingModule.createNestApplication();
    configureApp(app);
    await app.init();
    db = app.get(DataSource);
    await request(app.getHttpServer())
      .post('/api/v1/auth/register')
      .send({
        email,
        password,
        fullName: 'Login Credentials Farmer',
        device,
        consents: [{ type: 'LOCATION_PROCESSING', policyVersion: '2026-08', granted: true }],
      })
      .expect(201);
  }, 30_000);

  afterAll(async () => {
    if (db) await db.query(`DELETE FROM users WHERE email=$1`, [email]);
    if (app) await app.close();
  });

  it('rejects identifier-only, wrong-password and unknown-account logins without issuing tokens', async () => {
    const attempts = [
      { identifier: email, device },
      { identifier: email, password: 'wrong-password-123!', device },
      { identifier: `nobody-${Date.now()}@test.invalid`, password, device },
    ];
    for (const body of attempts) {
      const response = await request(app.getHttpServer()).post('/api/v1/auth/login').send(body);
      expect([400, 401]).toContain(response.status);
      expect(JSON.stringify(response.body)).not.toContain('accessToken');
      expect(JSON.stringify(response.body)).not.toContain('refreshToken');
    }
  });

  it('accepts the correct password', async () => {
    const response = await request(app.getHttpServer())
      .post('/api/v1/auth/login')
      .send({ identifier: email, password, device })
      .expect(200);
    expect(response.body.tokens.accessToken).toBeTruthy();
  });
});

/* eslint-disable @typescript-eslint/no-unsafe-argument, @typescript-eslint/no-unsafe-member-access */
import type { INestApplication } from '@nestjs/common';
import { Test } from '@nestjs/testing';
import request = require('supertest'); // eslint-disable-line @typescript-eslint/no-require-imports
import { DataSource } from 'typeorm';

interface Registered {
  user: { id: string };
  tokens: { accessToken: string };
}

const integration = process.env.DATABASE_URL ? describe : describe.skip;

integration('Billing, subscriptions and entitlement enforcement', () => {
  let app: INestApplication;
  let db: DataSource;
  let farmer: Registered;
  let admin: Registered;
  const suffix = Date.now();
  const password = 'A-strong-test-password-123!';
  const farmBoundary = {
    type: 'Polygon',
    coordinates: [
      [
        [71.6, 30.2],
        [71.62, 30.2],
        [71.62, 30.22],
        [71.6, 30.22],
        [71.6, 30.2],
      ],
    ],
  };

  beforeAll(async () => {
    process.env.NODE_ENV = 'test';
    process.env.JWT_ACCESS_SECRET = 'integration-test-secret-at-least-32-characters';
    process.env.JWT_ISSUER = 'fasalguard-api';
    process.env.JWT_AUDIENCE = 'fasalguard-clients';
    process.env.REDIS_URL ??= 'redis://localhost:6379';
    const [{ AppModule }, { configureApp }] = await Promise.all([
      import('../src/app.module'),
      import('../src/configure-app'),
    ]);
    const testingModule = await Test.createTestingModule({ imports: [AppModule] }).compile();
    app = testingModule.createNestApplication();
    configureApp(app);
    await app.init();
    db = app.get(DataSource);
    farmer = await register(
      `billing-farmer-${suffix}@test.invalid`,
      'Billing Farmer',
      'billing-farmer-device',
    );
    admin = await register(
      `billing-admin-${suffix}@test.invalid`,
      'Billing Admin',
      'billing-admin-device',
    );
    await db.query(`UPDATE users SET role='SUPER_ADMIN' WHERE id=$1`, [admin.user.id]);
  }, 30_000);

  afterAll(async () => {
    if (db) {
      await db.query(
        `DELETE FROM farms WHERE farmer_id IN (SELECT id FROM farmer_profiles WHERE user_id=$1)`,
        [farmer?.user.id],
      );
      await db.query(`DELETE FROM users WHERE id IN ($1,$2)`, [farmer?.user.id, admin?.user.id]);
    }
    if (app) await app.close();
  });

  it('lists active plans publicly, without authentication', async () => {
    const response = await request(app.getHttpServer()).get('/api/v1/billing/plans').expect(200);
    const codes = (response.body as Array<{ code: string }>).map((p) => p.code);
    expect(codes).toEqual(
      expect.arrayContaining(['FREE', 'FARMER_PRO', 'FARM_BUSINESS', 'COOPERATIVE']),
    );
  });

  it('gives every newly registered farmer a real, active FREE subscription', async () => {
    const response = await request(app.getHttpServer())
      .get('/api/v1/billing/subscription')
      .set(auth(farmer))
      .expect(200);
    expect(response.body.subscription.status).toBe('ACTIVE');
    expect(response.body.plan.code).toBe('FREE');
  });

  it('reports live usage against the FREE plan limits', async () => {
    const response = await request(app.getHttpServer())
      .get('/api/v1/billing/usage')
      .set(auth(farmer))
      .expect(200);
    expect(response.body.plan.code).toBe('FREE');
    expect(response.body.usage.maxFarms).toBe(0);
    expect(response.body.plan.limits.maxFarms).toBe(1);
  });

  it('enforces the FREE plan maxFarms=1 limit and rejects the next farm with a real 403', async () => {
    await request(app.getHttpServer())
      .post('/api/v1/farms')
      .set(auth(farmer))
      .send({ name: `Only Farm ${suffix}`, boundary: farmBoundary })
      .expect(201);
    const rejected = await request(app.getHttpServer())
      .post('/api/v1/farms')
      .set(auth(farmer))
      .send({ name: `Second Farm ${suffix}`, boundary: farmBoundary })
      .expect(403);
    expect(rejected.body.error.message).toMatch(/ENTITLEMENT_LIMIT_REACHED|does not allow/i);
  });

  it('records a real upgrade request as PENDING, never trusting the client, and activates only after admin verification', async () => {
    const upgrade = await request(app.getHttpServer())
      .post('/api/v1/billing/upgrade-request')
      .set(auth(farmer))
      .send({
        planCode: 'FARMER_PRO',
        provider: 'MANUAL_BANK_TRANSFER',
        providerPaymentReference: `TXN-${suffix}`,
      })
      .expect(202);
    expect(upgrade.body.status).toBe('PENDING');
    const paymentId = upgrade.body.paymentId as string;

    const stillFree = await request(app.getHttpServer())
      .get('/api/v1/billing/subscription')
      .set(auth(farmer))
      .expect(200);
    expect(stillFree.body.plan.code).toBe('FREE');

    await request(app.getHttpServer())
      .get('/api/v1/admin/billing/payments?status=PENDING')
      .set(auth(farmer))
      .expect(403);

    const pending = await request(app.getHttpServer())
      .get('/api/v1/admin/billing/payments?status=PENDING')
      .set(auth(admin))
      .expect(200);
    expect((pending.body as Array<{ id: string }>).some((p) => p.id === paymentId)).toBe(true);

    await request(app.getHttpServer())
      .post(`/api/v1/admin/billing/payments/${paymentId}/verify`)
      .set(auth(admin))
      .send({})
      .expect(201);

    const upgraded = await request(app.getHttpServer())
      .get('/api/v1/billing/subscription')
      .set(auth(farmer))
      .expect(200);
    expect(upgraded.body.plan.code).toBe('FARMER_PRO');
    expect(upgraded.body.recentPayments[0].status).toBe('PAID');

    const revenue = await request(app.getHttpServer())
      .get('/api/v1/admin/billing/revenue')
      .set(auth(admin))
      .expect(200);
    expect(revenue.body.totalRevenueByCurrency.PKR).toBeGreaterThanOrEqual(99900);
    expect(revenue.body.successfulPaymentsCount).toBeGreaterThanOrEqual(1);
  });

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
          password,
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

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

integration('Growth: referrals, pilot leads, landing views, admin funnel', () => {
  let app: INestApplication;
  let db: DataSource;
  let referrer: Registered;
  let referred: Registered;
  let admin: Registered;
  const suffix = Date.now();
  const password = 'A-strong-test-password-123!';

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
    referrer = await register(
      `growth-referrer-${suffix}@test.invalid`,
      'Referrer Farmer',
      'growth-referrer-device',
    );
    admin = await register(
      `growth-admin-${suffix}@test.invalid`,
      'Growth Admin',
      'growth-admin-device',
    );
    await db.query(`UPDATE users SET role='SUPER_ADMIN' WHERE id=$1`, [admin.user.id]);
  }, 30_000);

  afterAll(async () => {
    if (db) {
      const ids = [referrer?.user.id, referred?.user.id, admin?.user.id].filter(Boolean);
      if (ids.length) await db.query(`DELETE FROM users WHERE id = ANY($1::uuid[])`, [ids]);
    }
    if (app) await app.close();
  });

  it('attributes a referral at registration and increments the referrer real invite count', async () => {
    const codeRow: Array<{ code: string }> = await db.query(
      `SELECT referral_code "code" FROM farmer_profiles WHERE user_id=$1`,
      [referrer.user.id],
    );
    const referralCode = codeRow[0].code;

    const before = await request(app.getHttpServer())
      .get('/api/v1/growth/referral')
      .set(auth(referrer))
      .expect(200);
    expect(before.body.code).toBe(referralCode);
    const beforeCount = before.body.invitesCount as number;

    referred = await register(
      `growth-referred-${suffix}@test.invalid`,
      'Referred Farmer',
      'growth-referred-device',
      referralCode,
    );
    const profile: Array<{ source: string; referredBy: string }> = await db.query(
      `SELECT acquisition_source "source", referred_by_user_id "referredBy" FROM farmer_profiles WHERE user_id=$1`,
      [referred.user.id],
    );
    expect(profile[0].source).toBe('REFERRAL');
    expect(profile[0].referredBy).toBe(referrer.user.id);

    const after = await request(app.getHttpServer())
      .get('/api/v1/growth/referral')
      .set(auth(referrer))
      .expect(200);
    expect(after.body.invitesCount).toBe(beforeCount + 1);
  });

  it('records a real pilot lead visible to admin funnel evidence', async () => {
    await request(app.getHttpServer())
      .post('/api/v1/growth/pilot-leads')
      .send({
        name: `Pilot Lead ${suffix}`,
        email: `pilot-lead-${suffix}@test.invalid`,
        country: 'Pakistan',
        mainCrop: 'Wheat',
      })
      .expect(202);
    const funnel = await request(app.getHttpServer())
      .get('/api/v1/admin/funnel')
      .set(auth(admin))
      .expect(200);
    expect(funnel.body.funnel.pilotLeads).toBeGreaterThanOrEqual(1);
    expect(funnel.body.policy.excludesTestAccounts).toBe(true);
  });

  it('records a real landing view via the public beacon endpoint', async () => {
    const rows: Array<{ total: string }> = await db.query(
      `SELECT COALESCE(sum(count),0)::text total FROM landing_page_views`,
    );
    const before = Number(rows[0].total);
    await request(app.getHttpServer()).post('/api/v1/growth/landing-view').expect(204);
    const afterRows: Array<{ total: string }> = await db.query(
      `SELECT COALESCE(sum(count),0)::text total FROM landing_page_views`,
    );
    expect(Number(afterRows[0].total)).toBeGreaterThan(before);
  });

  async function register(
    email: string,
    fullName: string,
    deviceIdentifier: string,
    referralCode?: string,
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
          ...(referralCode ? { referralCode } : {}),
        })
        .expect(201)
    ).body as Registered;
  }

  function auth(account: Registered): { Authorization: string } {
    return { Authorization: `Bearer ${account.tokens.accessToken}` };
  }
});

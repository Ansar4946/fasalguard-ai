/* eslint-disable @typescript-eslint/no-unsafe-argument, @typescript-eslint/no-unsafe-member-access */
import type { INestApplication } from '@nestjs/common';
import { Test } from '@nestjs/testing';
import request = require('supertest'); // eslint-disable-line @typescript-eslint/no-require-imports
import { DataSource } from 'typeorm';

const integration = process.env.DATABASE_URL ? describe : describe.skip;

interface Account {
  user: { id: string };
  tokens: { accessToken: string };
}

integration('Farm digital twin API', () => {
  let app: INestApplication;
  let db: DataSource;
  let owner: Account;
  let stranger: Account;
  let farmId: string;
  let fieldId: string;
  const suffix = Date.now();

  beforeAll(async () => {
    process.env.NODE_ENV = 'test';
    process.env.JWT_ACCESS_SECRET = 'digital-twin-test-secret-at-least-32-characters';
    process.env.REDIS_URL ??= 'redis://localhost:6379';
    const [{ AppModule }, { configureApp }] = await Promise.all([
      import('../src/app.module'),
      import('../src/configure-app'),
    ]);
    const module = await Test.createTestingModule({ imports: [AppModule] }).compile();
    app = module.createNestApplication();
    configureApp(app);
    await app.init();
    db = app.get(DataSource);
    owner = await register(`twin-owner-${suffix}@test.invalid`, 'Twin Owner');
    stranger = await register(`twin-stranger-${suffix}@test.invalid`, 'Twin Stranger');
    farmId = (
      await request(app.getHttpServer())
        .post('/api/v1/farms')
        .set(auth(owner))
        .send({ name: 'Twin Farm', boundary: polygon(71.4, 30.1, 0.02) })
        .expect(201)
    ).body.id as string;
    fieldId = (
      await request(app.getHttpServer())
        .post(`/api/v1/farms/${farmId}/fields`)
        .set(auth(owner))
        .send({ name: 'Twin Field', boundary: polygon(71.405, 30.105, 0.005) })
        .expect(201)
    ).body.id as string;
    await db.query(
      `INSERT INTO field_inspections(user_id,field_id,notes,observed_at) VALUES($1,$2,$3,$4)`,
      [owner.user.id, fieldId, 'Yellowing observed near the canal edge', new Date()],
    );
  }, 90_000);

  afterAll(async () => {
    if (db && owner && stranger) {
      await db.query(`DELETE FROM field_inspections WHERE field_id=$1`, [fieldId]);
      await db.query(`DELETE FROM fields WHERE farm_id=$1`, [farmId]);
      await db.query(`DELETE FROM farms WHERE id=$1`, [farmId]);
      await db.query(`DELETE FROM users WHERE id IN($1,$2)`, [owner.user.id, stranger.user.id]);
    }
    if (app) await app.close();
  });

  it('returns an owner snapshot with missing-data freshness instead of fabricated values', async () => {
    await request(app.getHttpServer())
      .get(`/api/v1/farms/${farmId}/digital-twin`)
      .set(auth(owner))
      .expect(200)
      .expect(({ body }) => {
        expect(body.farm.id).toBe(farmId);
        expect(body.farmerObservations[0].source).toBe('FARMER');
        expect(body.dataFreshness.satellite.status).toBe('missing');
      });
  });

  it('returns a chronological timeline with traceable provenance', async () => {
    await request(app.getHttpServer())
      .get(`/api/v1/farms/${farmId}/timeline`)
      .set(auth(owner))
      .expect(200)
      .expect(({ body }) => {
        expect(body.events[0].type).toBe('FARMER_OBSERVATION');
        expect(body.events[0].evidence[0].sourceIdentifier).toBe(body.events[0].id);
      });
  });

  it('does not reveal the farm to another tenant or for an invalid identifier', async () => {
    await request(app.getHttpServer())
      .get(`/api/v1/farms/${farmId}/digital-twin`)
      .set(auth(stranger))
      .expect(404);
    await request(app.getHttpServer())
      .get('/api/v1/farms/00000000-0000-4000-8000-000000000000/digital-twin')
      .set(auth(owner))
      .expect(404);
  });

  it('persists a bounded Farm Brain run and evidence manifest before model processing', async () => {
    const queued = await request(app.getHttpServer())
      .post(`/api/v1/farms/${farmId}/farm-brain/investigations`)
      .set(auth(owner))
      .send({ fieldId })
      .expect(202);
    const runId = queued.body.id as string;
    const rows: Array<{ input_manifest: Record<string, unknown> }> = await db.query(
      `SELECT input_manifest FROM farm_brain_runs WHERE id=$1`,
      [runId],
    );
    expect(rows[0]?.input_manifest).toMatchObject({
      safetyContext: { satelliteIsNonDiagnostic: true, farmerTextIsUntrustedData: true },
    });
    expect(JSON.stringify(rows[0]?.input_manifest)).not.toMatch(/"boundary"|"centroid"|"email"/);
    const evidence: Array<{ count: string }> = await db.query(
      `SELECT count(*)::text count FROM farm_brain_run_evidence WHERE run_id=$1`,
      [runId],
    );
    expect(Number(evidence[0]?.count)).toBeGreaterThan(0);
    await request(app.getHttpServer())
      .get(`/api/v1/farm-brain/runs/${runId}`)
      .set(auth(stranger))
      .expect(404);
  });

  async function register(email: string, fullName: string): Promise<Account> {
    return (
      await request(app.getHttpServer())
        .post('/api/v1/auth/register')
        .send({
          email,
          password: 'A-strong-test-password-123!',
          fullName,
          device: { deviceIdentifier: `${email}-device`, platform: 'web' },
          consents: [],
        })
        .expect(201)
    ).body as Account;
  }

  function auth(account: Account): { Authorization: string } {
    return { Authorization: `Bearer ${account.tokens.accessToken}` };
  }

  function polygon(lng: number, lat: number, size: number): Record<string, unknown> {
    return {
      type: 'Polygon',
      coordinates: [
        [
          [lng, lat],
          [lng + size, lat],
          [lng + size, lat + size],
          [lng, lat + size],
          [lng, lat],
        ],
      ],
    };
  }
});

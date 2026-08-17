/* eslint-disable @typescript-eslint/no-unsafe-argument, @typescript-eslint/no-unsafe-member-access */
import type { INestApplication } from '@nestjs/common';
import { Test } from '@nestjs/testing';
import request = require('supertest'); // eslint-disable-line @typescript-eslint/no-require-imports
import { DataSource } from 'typeorm';

interface Registered {
  user: { id: string };
  tokens: { accessToken: string };
}
interface FarmResponse {
  id: string;
  areaHectares: number;
  centroid: { type: string };
  soilType: string;
}
interface FieldResponse {
  id: string;
  areaHectares: number;
  currentCropCycle: { cropId: string };
}

const integration = process.env.DATABASE_URL ? describe : describe.skip;

integration('Farmer farm and field ownership API', () => {
  let app: INestApplication;
  let db: DataSource;
  let owner: Registered;
  let stranger: Registered;
  let cropId: string;
  const suffix = Date.now();
  const password = 'A-strong-test-password-123!';
  const farmBoundary = {
    type: 'Polygon',
    coordinates: [
      [
        [71.4, 30.1],
        [71.42, 30.1],
        [71.42, 30.12],
        [71.4, 30.12],
        [71.4, 30.1],
      ],
    ],
  };
  const fieldBoundary = {
    type: 'Polygon',
    coordinates: [
      [
        [71.405, 30.105],
        [71.41, 30.105],
        [71.41, 30.11],
        [71.405, 30.11],
        [71.405, 30.105],
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
    const crops: Array<{ id: string }> = await db.query(`SELECT id FROM crops WHERE slug='cotton'`);
    cropId = crops[0]!.id;
    owner = await register(
      `farm-owner-${suffix}@test.invalid`,
      'Owner Farmer',
      'phase4-owner-device',
    );
    stranger = await register(
      `farm-stranger-${suffix}@test.invalid`,
      'Other Farmer',
      'phase4-stranger-device',
    );
  }, 30_000);

  afterAll(async () => {
    if (db) {
      await db.query(
        `DELETE FROM crop_cycles WHERE field_id IN (SELECT fi.id FROM fields fi JOIN farms f ON f.id=fi.farm_id JOIN farmer_profiles fp ON fp.id=f.farmer_id WHERE fp.user_id IN ($1,$2))`,
        [owner?.user.id, stranger?.user.id],
      );
      await db.query(
        `DELETE FROM fields WHERE farm_id IN (SELECT f.id FROM farms f JOIN farmer_profiles fp ON fp.id=f.farmer_id WHERE fp.user_id IN ($1,$2))`,
        [owner?.user.id, stranger?.user.id],
      );
      await db.query(
        `DELETE FROM farms WHERE farmer_id IN (SELECT id FROM farmer_profiles WHERE user_id IN ($1,$2))`,
        [owner?.user.id, stranger?.user.id],
      );
      await db.query(`DELETE FROM users WHERE id IN ($1,$2)`, [owner?.user.id, stranger?.user.id]);
    }
    if (app) await app.close();
  });

  it('creates owner-scoped farms and derives geometry metrics server-side', async () => {
    await request(app.getHttpServer())
      .post('/api/v1/farms')
      .set(auth(owner))
      .send({ name: 'Rejected acreage', boundary: farmBoundary, areaHectares: 999 })
      .expect(400);
    const farm = await createFarm();
    expect(farm.areaHectares).toBeGreaterThan(1);
    expect(farm.areaHectares).not.toBe(999);
    expect(farm.centroid.type).toBe('Point');
    expect(farm.soilType).toBe('Loam');

    await request(app.getHttpServer()).get('/api/v1/farms').set(auth(owner)).expect(200);
    await request(app.getHttpServer())
      .get(`/api/v1/farms/${farm.id}/geojson`)
      .set(auth(owner))
      .expect(200)
      .expect(({ body }) => expect(body.geometry.type).toBe('Polygon'));
  });

  it('hides owned resources from every other farmer', async () => {
    const farm = await createFarm();
    await request(app.getHttpServer())
      .get(`/api/v1/farms/${farm.id}`)
      .set(auth(stranger))
      .expect(404);
    await request(app.getHttpServer())
      .patch(`/api/v1/farms/${farm.id}`)
      .set(auth(stranger))
      .send({ name: 'Stolen' })
      .expect(404);
    await request(app.getHttpServer())
      .post(`/api/v1/farms/${farm.id}/fields`)
      .set(auth(stranger))
      .send({ name: 'Foreign Field', boundary: fieldBoundary })
      .expect(404);
    await request(app.getHttpServer())
      .get(`/api/v1/farms/${farm.id}/geojson`)
      .set(auth(stranger))
      .expect(404);
  });

  it('validates field geometry, containment and current crop cycles', async () => {
    const farm = await createFarm();
    const invalid = {
      type: 'Polygon',
      coordinates: [
        [
          [71.4, 30.1],
          [71.4, 30.1],
        ],
      ],
    };
    await request(app.getHttpServer())
      .post(`/api/v1/farms/${farm.id}/fields`)
      .set(auth(owner))
      .send({ name: 'Invalid Field', boundary: invalid })
      .expect(400);
    const outside = {
      type: 'Polygon',
      coordinates: [
        [
          [72, 31],
          [72.01, 31],
          [72.01, 31.01],
          [72, 31.01],
          [72, 31],
        ],
      ],
    };
    await request(app.getHttpServer())
      .post(`/api/v1/farms/${farm.id}/fields`)
      .set(auth(owner))
      .send({ name: 'Outside Field', boundary: outside })
      .expect(400);

    const field = (
      await request(app.getHttpServer())
        .post(`/api/v1/farms/${farm.id}/fields`)
        .set(auth(owner))
        .send({
          name: `North Field ${suffix}-${Math.random()}`,
          boundary: fieldBoundary,
          currentCropCycle: {
            cropId,
            sowingDate: '2026-08-01',
            expectedHarvestDate: '2026-12-01',
            growthStage: 'germination',
            status: 'active',
          },
        })
        .expect(201)
    ).body as FieldResponse;
    expect(field.areaHectares).toBeGreaterThan(0);
    expect(field.currentCropCycle.cropId).toBe(cropId);

    await request(app.getHttpServer())
      .get(`/api/v1/fields/${field.id}/summary`)
      .set(auth(owner))
      .expect(200)
      .expect(({ body }) => expect(body.boundary).toBeUndefined());
    await request(app.getHttpServer())
      .patch(`/api/v1/fields/${field.id}`)
      .set(auth(owner))
      .send({ name: 'North Cotton Field' })
      .expect(200)
      .expect(({ body }) => expect(body.name).toBe('North Cotton Field'));
    await request(app.getHttpServer())
      .get(`/api/v1/fields/${field.id}/geojson`)
      .set(auth(owner))
      .expect(200)
      .expect(({ body }) => expect(body.geometry.type).toBe('Polygon'));
    await request(app.getHttpServer())
      .get(`/api/v1/fields/${field.id}`)
      .set(auth(stranger))
      .expect(404);
    await request(app.getHttpServer())
      .delete(`/api/v1/fields/${field.id}`)
      .set(auth(stranger))
      .expect(404);
    await request(app.getHttpServer())
      .delete(`/api/v1/fields/${field.id}`)
      .set(auth(owner))
      .expect(204);
  });

  it('updates owned farms and soft-deletes their fields and crop cycles transactionally', async () => {
    const farm = await createFarm();
    await request(app.getHttpServer())
      .patch(`/api/v1/farms/${farm.id}`)
      .set(auth(owner))
      .send({ name: 'Updated Green Farm', waterSource: 'Tube well' })
      .expect(200)
      .expect(({ body }) => {
        expect(body.name).toBe('Updated Green Farm');
        expect(body.waterSource).toBe('Tube well');
      });
    const field = (
      await request(app.getHttpServer())
        .post(`/api/v1/farms/${farm.id}/fields`)
        .set(auth(owner))
        .send({ name: `Disposable Field ${Math.random()}`, boundary: fieldBoundary })
        .expect(201)
    ).body as FieldResponse;
    await request(app.getHttpServer())
      .delete(`/api/v1/farms/${farm.id}`)
      .set(auth(owner))
      .expect(204);
    await request(app.getHttpServer()).get(`/api/v1/farms/${farm.id}`).set(auth(owner)).expect(404);
    await request(app.getHttpServer())
      .get(`/api/v1/fields/${field.id}`)
      .set(auth(owner))
      .expect(404);
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

  async function createFarm(): Promise<FarmResponse> {
    return (
      await request(app.getHttpServer())
        .post('/api/v1/farms')
        .set(auth(owner))
        .send({
          name: `Green Farm ${suffix}-${Math.random()}`,
          boundary: farmBoundary,
          province: 'Punjab',
          district: 'Multan',
          tehsil: 'Multan City',
          soilType: 'Loam',
          irrigationType: 'Canal',
          waterSource: 'Chenab canal',
        })
        .expect(201)
    ).body as FarmResponse;
  }

  function auth(account: Registered): { Authorization: string } {
    return { Authorization: `Bearer ${account.tokens.accessToken}` };
  }
});

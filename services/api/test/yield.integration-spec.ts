/* F13 PostgreSQL integration. Needs a disposable database named yield_test with ALL migrations applied
 * (YIELD_TEST_DATABASE_URL). Every CSV is a SYNTHETIC TEST FIXTURE with invented numbers and a fake
 * source; nothing here is real yield data and nothing is seeded outside this test. */
/* eslint-disable @typescript-eslint/no-unsafe-member-access, @typescript-eslint/no-unsafe-assignment, @typescript-eslint/explicit-function-return-type */
import 'reflect-metadata';
import type { Server } from 'node:http';
import { randomUUID } from 'node:crypto';
import { DataSource } from 'typeorm';
import { ConfigService } from '@nestjs/config';
import { Reflector } from '@nestjs/core';
import { JwtService } from '@nestjs/jwt';
import { Test } from '@nestjs/testing';
import { ValidationPipe, type INestApplication } from '@nestjs/common';
// eslint-disable-next-line @typescript-eslint/no-require-imports
import request = require('supertest');
import { JwtAuthGuard } from '../src/domain/auth/guards/jwt-auth.guard';
import { RolesGuard } from '../src/domain/auth/guards/roles.guard';
import { YieldController } from '../src/domain/yield/yield.controller';
import { YieldImportService } from '../src/domain/yield/yield-import.service';
import { YieldService } from '../src/domain/yield/yield.service';

const url = process.env.YIELD_TEST_DATABASE_URL;
if (url && new URL(url).pathname.slice(1) !== 'yield_test')
  throw new Error('F13 integration requires the disposable yield_test database.');
const integration = url ? describe : describe.skip;

const HEADER =
  'crop,province,district,season,year,value,unit,source_name,source_url,licence_status';
const line = (district: string, year: number, value: number, unit = 'kg_per_ha', season = 'RABI') =>
  `wheat,Punjab,${district},${season},${year},${value},${unit},SYNTHETIC TEST FIXTURE,https://example.invalid/fixture,UNVERIFIED`;
const file = (...lines: string[]) => [HEADER, ...lines].join('\n');

integration('F13 yield reference on PostgreSQL', () => {
  const user = randomUUID(),
    sid = randomUUID(),
    ngo = randomUUID(),
    ngoSid = randomUUID();
  let db: DataSource, app: INestApplication<Server>, importer: YieldImportService;
  const jwt = new JwtService();
  const secret = 'synthetic-f13-jwt-secret-at-least-32';
  const token = (sub: string, s: string, role: string) =>
    jwt.sign(
      { sub, sid: s, role, type: 'access' },
      { secret, issuer: 'f13-test', audience: 'f13-test', expiresIn: '5m' },
    );
  const get = (path: string, tok?: string) => {
    const r = request(app.getHttpServer()).get(path);
    return tok ? r.set('authorization', `Bearer ${tok}`) : r;
  };
  const farmer = () => token(user, sid, 'FARMER');
  const counts = async () =>
    (
      await db.query(
        `SELECT (SELECT count(*)::int FROM yield_observations) o,(SELECT count(*)::int FROM yield_reference_statistics) s`,
      )
    )[0] as { o: number; s: number };

  beforeAll(async () => {
    db = new DataSource({ type: 'postgres', url, connectTimeoutMS: 5000 });
    await db.initialize();
    await db.query(`DELETE FROM yield_reference_statistics`);
    await db.query(`DELETE FROM yield_observations`);
    for (const [id, s, role] of [
      [user, sid, 'FARMER'],
      [ngo, ngoSid, 'NGO_VIEWER'],
    ] as const) {
      await db.query(
        `INSERT INTO users(id,email,role,status,is_test_account) VALUES($1,$2,$3,'active',true)`,
        [id, `${id}@f13.test`, role],
      );
      await db.query(
        `INSERT INTO auth_sessions(id,user_id,refresh_token_hash,token_family,last_used_at,expires_at) VALUES($1,$2,$3,$4,now(),now()+interval '1 day')`,
        [s, id, (randomUUID() + randomUUID()).replace(/-/g, '').slice(0, 64), randomUUID()],
      );
    }
    importer = new YieldImportService(db);
    const module = await Test.createTestingModule({
      controllers: [YieldController],
      providers: [{ provide: YieldService, useValue: new YieldService(db) }],
    }).compile();
    app = module.createNestApplication();
    app.useGlobalPipes(
      new ValidationPipe({ transform: true, whitelist: true, forbidNonWhitelisted: true }),
    );
    const config = new ConfigService({
      jwtAccessSecret: secret,
      jwtIssuer: 'f13-test',
      jwtAudience: 'f13-test',
    });
    app.useGlobalGuards(
      new JwtAuthGuard(new Reflector(), jwt, config, db),
      new RolesGuard(new Reflector()),
    );
    await app.init();
  });
  afterAll(async () => {
    await db.query(`DELETE FROM yield_reference_statistics`);
    await db.query(`DELETE FROM yield_observations`);
    await db.query(`DELETE FROM auth_sessions WHERE user_id = ANY($1)`, [[user, ngo]]);
    await db.query(`DELETE FROM users WHERE id = ANY($1)`, [[user, ngo]]);
    await app?.close();
    await db?.destroy();
  });

  it('runtime starts empty: nothing is seeded by migrations', async () => {
    expect(await counts()).toEqual({ o: 0, s: 0 });
  });

  it('requires authentication and an allowed role', async () => {
    await get('/yield/reference?crop=wheat&district=a').expect(401);
    await get('/yield/reference?crop=wheat&district=a', token(ngo, ngoSid, 'NGO_VIEWER')).expect(
      403,
    );
  });

  it('rejects missing or oversized query parameters', async () => {
    await get('/yield/reference?crop=wheat', farmer()).expect(400);
    await get(`/yield/reference?crop=wheat&district=${'x'.repeat(65)}`, farmer()).expect(400);
  });

  it('unknown district returns insufficient_data with no prediction', async () => {
    const res = await get('/yield/reference?crop=wheat&district=nowhere', farmer()).expect(200);
    expect(res.body).toMatchObject({
      status: 'insufficient_data',
      predictionAvailable: false,
      seasons: [],
      minimumYears: 5,
    });
    expect(res.body.predictionReason).toMatch(
      /temporal and spatial hold-out validation.*district-average baseline/,
    );
  });

  it('rejects the whole file when any row lacks provenance and writes nothing', async () => {
    const bad = file(
      line('alpha', 2010, 2000),
      `${line('alpha', 2011, 2100).replace('https://example.invalid/fixture', '')}`,
    );
    const r = await importer.importCsv(bad, 'f13-test');
    expect(r.ok).toBe(false);
    expect(r.errors[0]?.line).toBe(3);
    expect(await counts()).toEqual({ o: 0, s: 0 });
  });

  it('imports with conversion, aggregates, and re-import is idempotent', async () => {
    const rows = [2010, 2011, 2012, 2013, 2014].map((y, i) => line('alpha', y, 2000 + i * 100));
    rows.push(line('alpha', 2015, 30, 'maund_per_acre'));
    rows.push(line('beta', 2010, 1500), line('beta', 2011, 1600));
    const csv = file(...rows);
    const first = await importer.importCsv(csv, 'f13-test');
    expect(first).toMatchObject({ ok: true, inserted: 8, unchanged: 0 });
    const again = await importer.importCsv(csv, 'f13-test');
    expect(again).toMatchObject({ ok: true, inserted: 0, unchanged: 8, batchId: null });
    expect((await counts()).o).toBe(8);
    const stored = await db.query(
      `SELECT published_value::float pv,published_unit pu,yield_kg_per_ha::float kg,created_by,import_batch_id FROM yield_observations WHERE district='alpha' AND year=2015`,
    );
    expect(stored[0]).toMatchObject({
      pv: 30,
      pu: 'maund_per_acre',
      kg: 2965.159,
      created_by: 'f13-test',
      import_batch_id: first.batchId,
    });
  });

  it('serves reference ranges for n>=5 with provenance and licence caveat', async () => {
    const res = await get('/yield/reference?crop=Wheat&district=%20Alpha%20', farmer()).expect(200);
    expect(res.body).toMatchObject({ status: 'reference_available', predictionAvailable: false });
    const s = res.body.seasons[0];
    expect(s).toMatchObject({ season: 'RABI', n: 6, minKgPerHa: 2000, maxKgPerHa: 2965.159 });
    expect(s.medianKgPerHa).toBeCloseTo(2250, 3);
    expect(s.p25KgPerHa).toBeCloseTo(2125, 3);
    expect(s.p75KgPerHa).toBeCloseTo(2425, 3);
    expect(s.yearsCovered).toEqual([2010, 2011, 2012, 2013, 2014, 2015]);
    expect(s.provenance.sourceNames).toEqual(['SYNTHETIC TEST FIXTURE']);
    expect(s.provenance.licenceNote).toMatch(/unverified/);
  });

  it('returns insufficient_data without any range when n < 5', async () => {
    const res = await get('/yield/reference?crop=wheat&district=beta', farmer()).expect(200);
    expect(res.body.status).toBe('insufficient_data');
    expect(res.body.predictionAvailable).toBe(false);
    expect(res.body.seasons[0]).toEqual({
      season: 'RABI',
      status: 'insufficient_data',
      n: 2,
      minimumYears: 5,
      yearsCovered: [2010, 2011],
    });
  });

  it('never overwrites: a different value for an existing key rejects the whole file', async () => {
    const r = await importer.importCsv(
      file(line('gamma', 2010, 1000), line('alpha', 2010, 9999)),
      'f13-test',
    );
    expect(r.ok).toBe(false);
    expect(r.errors[0]?.message).toMatch(/never overwritten/);
    expect((await counts()).o).toBe(8);
    const gamma = await db.query(`SELECT 1 FROM yield_observations WHERE district='gamma'`);
    expect(gamma).toHaveLength(0);
  });

  it('database constraints independently refuse rows without provenance', async () => {
    await expect(
      db.query(
        `INSERT INTO yield_observations(crop,province,district,season,year,published_value,published_unit,yield_kg_per_ha,source_name,source_url,licence_status,import_batch_id,created_by)
         VALUES('wheat','p','d','RABI',2000,1,'kg_per_ha',1,'','https://x.invalid','UNVERIFIED',$1,'t')`,
        [randomUUID()],
      ),
    ).rejects.toThrow(/ck_yield_obs_provenance/);
  });
});

/* Test helpers infer their mock signatures; assertions inspect mock references. */
/* eslint-disable @typescript-eslint/explicit-function-return-type */
import 'reflect-metadata';
import type { Server } from 'node:http';
import { randomUUID } from 'node:crypto';
import { DataSource } from 'typeorm';
import { ConfigService } from '@nestjs/config';
import { Reflector } from '@nestjs/core';
import { JwtService } from '@nestjs/jwt';
import { Test } from '@nestjs/testing';
import { ValidationPipe, type INestApplication } from '@nestjs/common';
// supertest is an export= CommonJS module; this API compiles without esModuleInterop.
// eslint-disable-next-line @typescript-eslint/no-require-imports
import request = require('supertest');
import { MarketIntelligence1755000033000 } from '../src/infrastructure/database/migrations/1755000033000-market-intelligence';
import { MarketService } from '../src/domain/market/market.service';
import { MarketProcessor } from '../src/domain/market/market.processor';
import { MarketController } from '../src/domain/market/market.controller';
import { JwtAuthGuard } from '../src/domain/auth/guards/jwt-auth.guard';
import { RolesGuard } from '../src/domain/auth/guards/roles.guard';
import type { RedisService } from '../src/infrastructure/redis/redis.service';
import { pakistanDate } from '../src/domain/market/market-data-policy';

// Never auto-load .env or use DATABASE_URL: an explicit disposable test DB is required.
const url = process.env.F07_TEST_DATABASE_URL;
if (url && !['f07_test', 'f03_test', 'f03_runtime_test'].includes(new URL(url).pathname.slice(1)))
  throw new Error('F07 integration requires an explicitly allowed disposable test database.');
const integration = url ? describe : describe.skip;
integration('F07 actual PostgreSQL and authenticated API workflow', () => {
  const schema = `f07_test_${randomUUID().replaceAll('-', '')}`;
  let db: DataSource, admin: DataSource, app: INestApplication<Server>, service: MarketService;
  const userId = randomUUID(),
    sessionId = randomUUID();
  const config = new ConfigService({
    jwtAccessSecret: 'synthetic-f07-test-key-only',
    jwtIssuer: 'f07-test',
    jwtAudience: 'f07-test',
    marketMaxAgeDays: 1,
  });
  const jwt = new JwtService();
  const quote = {
    crop: 'Wheat',
    market: 'Synthetic F07 Test Market',
    district: 'Unknown',
    province: 'Punjab',
    minimumPrice: 9900,
    maximumPrice: 10100,
    averagePrice: 10000,
    quantity: 100,
    unit: 'KG',
    source: 'AMIS',
    sourceUrl: 'http://www.amis.pk/ViewPrices.aspx?commodityId=1',
    sourceIdentifier: 'AMIS:Wheat:Synthetic F07 Test Market',
    priceDate: pakistanDate(),
  };
  const token = () =>
    jwt.sign(
      { sub: userId, sid: sessionId, type: 'access' },
      {
        secret: 'synthetic-f07-test-key-only',
        issuer: 'f07-test',
        audience: 'f07-test',
        expiresIn: '5m',
      },
    );
  beforeAll(async () => {
    admin = new DataSource({ type: 'postgres', url, connectTimeoutMS: 5000 });
    await admin.initialize();
    await admin.query('CREATE EXTENSION IF NOT EXISTS "uuid-ossp"');
    await admin.query(`CREATE SCHEMA "${schema}"`);
    db = new DataSource({
      type: 'postgres',
      url,
      connectTimeoutMS: 5000,
      extra: { options: `-c search_path=${schema},public` },
    });
    await db.initialize();
    const runner = db.createQueryRunner();
    await runner.connect();
    try {
      await new MarketIntelligence1755000033000().up(runner);
    } finally {
      await runner.release();
    }
    await db.query(`CREATE TABLE integration_usage(provider text,operation text,request_count integer,duration_ms integer,success boolean,error_code text);
      CREATE TABLE users(id uuid PRIMARY KEY,role text,status text,deleted_at timestamptz);
      CREATE TABLE auth_sessions(id uuid PRIMARY KEY,user_id uuid,revoked_at timestamptz,expires_at timestamptz)`);
    await db.query("INSERT INTO users VALUES($1,'FARMER','active',NULL)", [userId]);
    await db.query("INSERT INTO auth_sessions VALUES($1,$2,NULL,now()+interval '1 hour')", [
      sessionId,
      userId,
    ]);
    const redis = {
      get: jest.fn().mockResolvedValue(null),
      setJson: jest.fn().mockResolvedValue(undefined),
    } as unknown as RedisService;
    service = new MarketService(db, redis, config);
    const module = await Test.createTestingModule({
      controllers: [MarketController],
      providers: [{ provide: MarketService, useValue: service }],
    }).compile();
    app = module.createNestApplication();
    app.useGlobalPipes(
      new ValidationPipe({ transform: true, whitelist: true, forbidNonWhitelisted: true }),
    );
    app.useGlobalGuards(
      new JwtAuthGuard(new Reflector(), jwt, config, db),
      new RolesGuard(new Reflector()),
    );
    await app.init();
  }, 30000);
  afterAll(async () => {
    await app?.close();
    if (db?.isInitialized) await db.destroy();
    if (admin?.isInitialized) {
      if (/^f07_test_[a-f0-9]{32}$/.test(schema))
        await admin.query(`DROP SCHEMA IF EXISTS "${schema}" CASCADE`);
      await admin.destroy();
    }
  }, 30000);
  const worker = (observations = [quote]) =>
    new MarketProcessor(db, { fetchCurrentPrices: () => Promise.resolve(observations) }, service);
  it('concurrent identical retries persist one observation', async () => {
    const results = await Promise.all([
      worker().process({ name: 'sync_mandi_rates' } as never),
      worker().process({ name: 'sync_mandi_rates' } as never),
    ]);
    expect(results.reduce((sum, r) => sum + r.inserted, 0)).toBe(1);
    const response = await request(app.getHttpServer())
      .get('/market/prices?crop=Wheat')
      .set('Authorization', `Bearer ${token()}`)
      .expect(200);
    expect(response.body).toMatchObject({
      records: [
        { averagePrice: 10000, quantity: 100, currency: 'PKR', district: null, source: 'AMIS' },
      ],
    });
  });
  it('a sync that parses zero records fails and is logged as a failure, never as success', async () => {
    const before = await db.query<Array<{ n: number }>>(
      `SELECT count(*)::int n FROM integration_usage WHERE provider='AMIS' AND operation='MARKET_SYNC' AND success=true`,
    );
    await expect(worker([]).process({ name: 'sync_mandi_rates' } as never)).rejects.toMatchObject({
      code: 'AMIS_NO_RECORDS',
    });
    const failed = await db.query<Array<{ success: boolean; error_code: string }>>(
      `SELECT success,error_code FROM integration_usage WHERE provider='AMIS' AND operation='MARKET_SYNC' AND error_code='AMIS_NO_RECORDS'`,
    );
    expect(failed).toEqual([{ success: false, error_code: 'AMIS_NO_RECORDS' }]);
    const after = await db.query<Array<{ n: number }>>(
      `SELECT count(*)::int n FROM integration_usage WHERE provider='AMIS' AND operation='MARKET_SYNC' AND success=true`,
    );
    expect(after[0]?.n).toBe(before[0]?.n);
  });
  it('conflicts are explicit and leave the original persisted quote unchanged', async () => {
    await expect(
      worker([{ ...quote, averagePrice: 10001 }]).process({ name: 'sync_mandi_rates' } as never),
    ).rejects.toMatchObject({ code: 'AMIS_OBSERVATION_CONFLICT' });
    expect(await service.history({ crop: 'Wheat', days: 7, limit: 50 })).toMatchObject({
      records: [{ averagePrice: 10000 }],
    });
  });
  it('an invalid second record rolls back the entire batch', async () => {
    await expect(
      worker([
        { ...quote, market: 'New Synthetic Market' },
        { ...quote, quantity: 40 },
      ]).process({ name: 'sync_mandi_rates' } as never),
    ).rejects.toMatchObject({ code: 'AMIS_INVALID_OBSERVATION' });
    expect(
      await db.query("SELECT id FROM mandi_prices WHERE market_name='New Synthetic Market'"),
    ).toHaveLength(0);
  });
  it('unauthenticated, disallowed and revoked sessions cannot read prices', async () => {
    await request(app.getHttpServer()).get('/market/prices').expect(401);
    await db.query("UPDATE users SET role='AGRICULTURE_EXPERT' WHERE id=$1", [userId]);
    await request(app.getHttpServer())
      .get('/market/prices')
      .set('Authorization', `Bearer ${token()}`)
      .expect(403);
    await db.query("UPDATE users SET role='FARMER' WHERE id=$1", [userId]);
    await db.query('UPDATE auth_sessions SET revoked_at=now() WHERE id=$1', [sessionId]);
    await request(app.getHttpServer())
      .get('/market/prices')
      .set('Authorization', `Bearer ${token()}`)
      .expect(401);
    await db.query('UPDATE auth_sessions SET revoked_at=NULL WHERE id=$1', [sessionId]);
  });
  it('bad limits reject and unknown crops have a truthful empty response', async () => {
    await request(app.getHttpServer())
      .get('/market/prices?limit=101')
      .set('Authorization', `Bearer ${token()}`)
      .expect(400);
    const response = await request(app.getHttpServer())
      .get('/market/prices?crop=Missing')
      .set('Authorization', `Bearer ${token()}`)
      .expect(200);
    expect(response.body).toMatchObject({ records: [], freshness: 'UNAVAILABLE' });
  });
});

/* Isolated contract-adapter evidence. This is not a live Pakistan gateway test. */
/* eslint-disable @typescript-eslint/no-unsafe-member-access, @typescript-eslint/explicit-function-return-type */
import 'reflect-metadata';
import { createHmac, randomUUID } from 'node:crypto';
import type { Server } from 'node:http';
import * as argon2 from 'argon2';
import { ConfigService } from '@nestjs/config';
import { Reflector } from '@nestjs/core';
import { JwtService } from '@nestjs/jwt';
import { Test } from '@nestjs/testing';
import { ValidationPipe, type INestApplication } from '@nestjs/common';
import { DataSource } from 'typeorm';
// eslint-disable-next-line @typescript-eslint/no-require-imports
import request = require('supertest');
import { FarmFinanceController } from '../src/domain/farm-finance/farm-finance.controller';
import { FarmLedgerService } from '../src/domain/farm-finance/farm-ledger.service';
import { UssdGatewayVerifier } from '../src/domain/farm-finance/ussd-gateway-verifier';
import { UssdPinService } from '../src/domain/farm-finance/ussd-pin.service';
import { UssdService } from '../src/domain/farm-finance/ussd.service';
import { JwtAuthGuard } from '../src/domain/auth/guards/jwt-auth.guard';
import { RolesGuard } from '../src/domain/auth/guards/roles.guard';
import { UssdFarmLedger1755000043000 } from '../src/infrastructure/database/migrations/1755000043000-ussd-farm-ledger';

const url = process.env.F09_TEST_DATABASE_URL ?? process.env.F08_TEST_DATABASE_URL;
if (
  url &&
  !['f03_runtime_test', 'f07_test', 'f08_test', 'f09_test'].includes(new URL(url).pathname.slice(1))
)
  throw new Error('F09 integration requires an explicitly allowed disposable test database.');
const integration = url ? describe : describe.skip;

integration('F09 signed USSD expense workflow', () => {
  const schema = `f09_test_${randomUUID().replaceAll('-', '')}`;
  const userId = randomUUID(),
    farmerId = randomUUID(),
    farmId = randomUUID();
  const fieldId = randomUUID(),
    seasonId = randomUUID(),
    cropId = randomUUID(),
    authSessionId = randomUUID();
  const secret = 'synthetic-f09-signature-secret-at-least-32';
  let admin: DataSource, db: DataSource, app: INestApplication<Server>, token: string;
  const config = new ConfigService({
    ussdEnabled: true,
    ussdDemoEnabled: true,
    ussdGateway: 'contract-test',
    ussdCallbackSecret: secret,
    ussdSessionTtlSeconds: 300,
    ussdPinMaxAttempts: 3,
    ussdPinLockSeconds: 60,
    ussdMaxAmountMinor: 100_000_000,
    jwtAccessSecret: 'synthetic-f09-jwt-secret-at-least-32',
    jwtIssuer: 'f09-test',
    jwtAudience: 'f09-test',
  });
  const jwt = new JwtService();

  beforeAll(async () => {
    admin = new DataSource({ type: 'postgres', url, connectTimeoutMS: 5000 });
    await admin.initialize();
    await admin.query(`CREATE SCHEMA "${schema}"`);
    db = new DataSource({
      type: 'postgres',
      url,
      connectTimeoutMS: 5000,
      extra: { options: `-c search_path=${schema},public` },
    });
    await db.initialize();
    await db.query(`
      CREATE TABLE users(id uuid PRIMARY KEY,phone text,password_hash text,role text,status text,deleted_at timestamptz);
      CREATE TABLE farmer_profiles(id uuid PRIMARY KEY,user_id uuid UNIQUE REFERENCES users(id));
      CREATE TABLE farms(id uuid PRIMARY KEY,farmer_id uuid REFERENCES farmer_profiles(id),name text,status text,deleted_at timestamptz);
      CREATE TABLE crops(id uuid PRIMARY KEY,name text);
      CREATE TABLE fields(id uuid PRIMARY KEY,farm_id uuid REFERENCES farms(id),deleted_at timestamptz);
      CREATE TABLE crop_cycles(id uuid PRIMARY KEY,field_id uuid REFERENCES fields(id),crop_id uuid REFERENCES crops(id),status text,sowing_date date,deleted_at timestamptz);
      CREATE TABLE auth_sessions(id uuid PRIMARY KEY,user_id uuid,revoked_at timestamptz,expires_at timestamptz);
    `);
    const runner = db.createQueryRunner();
    await runner.connect();
    try {
      await new UssdFarmLedger1755000043000().up(runner);
    } finally {
      await runner.release();
    }
    const passwordHash = await argon2.hash('account-password');
    const pinHash = await argon2.hash('4826');
    await db.query(`INSERT INTO users VALUES($1,'+923001234567',$2,'FARMER','active',NULL)`, [
      userId,
      passwordHash,
    ]);
    await db.query(`INSERT INTO farmer_profiles VALUES($1,$2)`, [farmerId, userId]);
    await db.query(`INSERT INTO farms VALUES($1,$2,'Test Farm','active',NULL)`, [farmId, farmerId]);
    await db.query(`INSERT INTO crops VALUES($1,'Wheat')`, [cropId]);
    await db.query(`INSERT INTO fields VALUES($1,$2,NULL)`, [fieldId, farmId]);
    await db.query(`INSERT INTO crop_cycles VALUES($1,$2,$3,'active','2026-10-01',NULL)`, [
      seasonId,
      fieldId,
      cropId,
    ]);
    await db.query(`INSERT INTO auth_sessions VALUES($1,$2,NULL,now()+interval '1 hour')`, [
      authSessionId,
      userId,
    ]);
    await db.query(`INSERT INTO ussd_credentials(user_id,pin_hash) VALUES($1,$2)`, [
      userId,
      pinHash,
    ]);
    token = jwt.sign(
      { sub: userId, sid: authSessionId, role: 'FARMER', type: 'access' },
      {
        secret: 'synthetic-f09-jwt-secret-at-least-32',
        issuer: 'f09-test',
        audience: 'f09-test',
        expiresIn: '5m',
      },
    );
    const verifier = new UssdGatewayVerifier(config);
    const ussd = new UssdService(db, config, verifier);
    const module = await Test.createTestingModule({
      controllers: [FarmFinanceController],
      providers: [
        { provide: UssdPinService, useValue: new UssdPinService(db) },
        { provide: UssdService, useValue: ussd },
        { provide: FarmLedgerService, useValue: new FarmLedgerService(db) },
      ],
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
      if (/^f09_test_[a-f0-9]{32}$/.test(schema))
        await admin.query(`DROP SCHEMA IF EXISTS "${schema}" CASCADE`);
      await admin.destroy();
    }
  }, 30000);

  const send = (
    eventId: string,
    sessionId: string,
    input: string,
    phoneNumber = '+923001234567',
  ) => {
    const body = { eventId, sessionId, phoneNumber, input };
    const timestamp = String(Date.now());
    const canonical = UssdGatewayVerifier.canonical(body);
    const signature = createHmac('sha256', secret)
      .update(`${timestamp}.${canonical}`)
      .digest('hex');
    return request(app.getHttpServer())
      .post('/channels/ussd/callback')
      .set('x-ussd-timestamp', timestamp)
      .set('x-ussd-signature', signature)
      .send(body);
  };

  const sendDemo = (sessionId: string, input: string) =>
    request(app.getHttpServer())
      .post('/ussd/demo/callback')
      .set('authorization', `Bearer ${token}`)
      .send({ eventId: randomUUID(), sessionId, input });

  it('rejects unsigned callbacks and does not write a ledger entry', async () => {
    await request(app.getHttpServer())
      .post('/channels/ussd/callback')
      .send({ eventId: 'bad', sessionId: 'bad', phoneNumber: '+923001234567', input: '' })
      .expect(401);
    expect(
      Number((await db.query(`SELECT count(*) count FROM farm_ledger_entries`))[0].count),
    ).toBe(0);
    await request(app.getHttpServer()).get('/farm-ledger').expect(401);
  });

  it('replays an identical callback and rejects event-id payload substitution', async () => {
    const first = await send('replay-event', 'replay-session', '').expect(200);
    const replay = await send('replay-event', 'replay-session', '').expect(200);
    expect(replay.text).toBe(first.text);
    await send('replay-event', 'replay-session', '4826').expect(409);
    expect(
      Number((await db.query(`SELECT count(*) count FROM ussd_security_events`))[0].count),
    ).toBe(1);
    expect(
      Number((await db.query(`SELECT count(*) count FROM farm_ledger_entries`))[0].count),
    ).toBe(0);
  });

  it('persists exactly one confirmed expense and exposes the same receipt to its owner', async () => {
    const session = 'expense-session';
    const steps = ['', '4826', '1', '1', '1', '2500', '1'];
    for (let i = 0; i < steps.length; i++) await send(`step-${i}`, session, steps[i]!).expect(200);
    const confirmations = await Promise.all(
      Array.from({ length: 10 }, (_, i) => send(`confirm-${i}`, session, '1')),
    );
    expect(confirmations.map((x) => x.status)).toEqual(Array(10).fill(200));
    const receipts = new Set(confirmations.map((x) => String(x.text).match(/[a-f0-9-]{36}$/)?.[0]));
    expect(receipts.size).toBe(1);
    expect(
      Number((await db.query(`SELECT count(*) count FROM farm_ledger_entries`))[0].count),
    ).toBe(1);
    expect(Number((await db.query(`SELECT count(*) count FROM farm_ledger_events`))[0].count)).toBe(
      1,
    );
    await expect(
      db.query(`UPDATE farm_ledger_entries SET amount_minor=1 WHERE id=$1`, [[...receipts][0]]),
    ).rejects.toThrow('append-only');
    await expect(
      db.query(`DELETE FROM farm_ledger_events WHERE ledger_entry_id=$1`, [[...receipts][0]]),
    ).rejects.toThrow('append-only');
    await request(app.getHttpServer())
      .get('/farm-ledger')
      .set('authorization', `Bearer ${token}`)
      .expect(200)
      .expect(({ body }) => {
        expect(body).toHaveLength(1);
        expect(body[0].amountMinor).toBe('250000');
      });
  }, 30000);

  it('cancels and expires sessions without creating an expense', async () => {
    await send('cancel-start', 'cancel-session', '').expect(200);
    await send('cancel-finish', 'cancel-session', '0')
      .expect(200)
      .expect('END Cancelled. No expense saved.');
    await send('expiry-start', 'expiry-session', '').expect(200);
    await db.query(
      `UPDATE ussd_sessions SET expires_at=now()-interval '1 second' WHERE provider_session_id='expiry-session'`,
    );
    await send('expiry-finish', 'expiry-session', '4826')
      .expect(200)
      .expect('END Session expired.');
    expect(
      Number((await db.query(`SELECT count(*) count FROM farm_ledger_entries`))[0].count),
    ).toBe(1);
  });

  it('audits phone mismatch and invalidates confirmation after a PIN change', async () => {
    const mismatchSession = 'phone-mismatch-session';
    await send('mismatch-start', mismatchSession, '').expect(200);
    await send('mismatch-attempt', mismatchSession, '', '+923111234567')
      .expect(200)
      .expect('END Unable to continue this session.');

    const session = 'credential-change-session';
    const steps = ['', '4826', '1', '1', '1', '100', '1'];
    for (let i = 0; i < steps.length; i++)
      await send(`credential-${i}`, session, steps[i]!).expect(200);
    await db.query(
      `UPDATE ussd_credentials SET version=version+1,pin_changed_at=now() WHERE user_id=$1`,
      [userId],
    );
    await send('credential-confirm', session, '1')
      .expect(200)
      .expect('END Authorization changed. Nothing saved.');
    expect(
      Number((await db.query(`SELECT count(*) count FROM farm_ledger_entries`))[0].count),
    ).toBe(1);
    expect(
      Number((await db.query(`SELECT count(*) count FROM ussd_security_events`))[0].count),
    ).toBe(2);
  }, 30000);

  it('runs the authenticated web simulator through the same state machine and ledger', async () => {
    await request(app.getHttpServer())
      .post('/ussd/demo/callback')
      .send({ eventId: randomUUID(), sessionId: randomUUID(), input: '' })
      .expect(401);

    const session = randomUUID();
    const steps = ['', '4826', '1', '1', '1', '321', '1', '1'];
    let terminal = '';
    for (const input of steps) {
      const response = await sendDemo(session, input).expect(201);
      terminal = String(response.body.text);
    }
    const receipt = terminal.match(/[a-f0-9-]{36}$/)?.[0];
    expect(terminal).toMatch(/^END Expense saved\. Receipt /);
    expect(receipt).toBeDefined();
    await request(app.getHttpServer())
      .get('/farm-ledger')
      .set('authorization', `Bearer ${token}`)
      .expect(200)
      .expect(({ body }: { body: Array<{ id: string; amountMinor: string }> }) => {
        expect(body).toHaveLength(2);
        expect(
          body.some(
            (entry: { id: string; amountMinor: string }) =>
              entry.id === receipt && entry.amountMinor === '32100',
          ),
        ).toBe(true);
      });
  }, 30000);

  it('locks repeated wrong PIN attempts without writing an expense', async () => {
    const session = 'wrong-pin-session';
    await send('wrong-start', session, '').expect(200);
    await send('wrong-1', session, '1111').expect(200);
    await send('wrong-2', session, '1111').expect(200);
    const locked = await send('wrong-3', session, '1111').expect(200);
    expect(locked.text).toBe('END Unable to authenticate.');
    expect(
      Number((await db.query(`SELECT count(*) count FROM farm_ledger_entries`))[0].count),
    ).toBe(2);
  }, 30000);
  it('returns the stored receipt, not a 500, when a confirm outwaits the session lock', async () => {
    // Earlier tests may have locked the PIN; start from a clean credential.
    await db.query(`UPDATE ussd_credentials SET failed_attempts=0,locked_until=NULL`);
    const session = 'lock-session';
    const steps = ['', '4826', '1', '1', '1', '700', '1'];
    for (let i = 0; i < steps.length; i++)
      await send(`lock-step-${i}`, session, steps[i]!).expect(200);
    const before = Number(
      (await db.query(`SELECT count(*) count FROM farm_ledger_entries`))[0].count,
    );
    // Hold the session row lock longer than the service's 3 s lock_timeout, then release it.
    const holder = db.createQueryRunner();
    await holder.connect();
    await holder.startTransaction();
    await holder.query(`SELECT 1 FROM ussd_sessions WHERE provider_session_id=$1 FOR UPDATE`, [
      session,
    ]);
    const release = setTimeout(() => void holder.commitTransaction(), 3500);
    try {
      const parallel = await Promise.all(
        Array.from({ length: 6 }, (_, i) => send(`lock-confirm-${i}`, session, '1')),
      );
      expect(parallel.map((x) => x.status)).toEqual(Array(6).fill(200));
      expect(new Set(parallel.map((x) => x.text)).size).toBe(1);
      expect(String(parallel[0]!.text)).toMatch(/[a-f0-9-]{36}$/);
    } finally {
      clearTimeout(release);
      if (holder.isTransactionActive) await holder.commitTransaction();
      await holder.release();
    }
    expect(
      Number((await db.query(`SELECT count(*) count FROM farm_ledger_entries`))[0].count),
    ).toBe(before + 1);
  }, 30000);
});

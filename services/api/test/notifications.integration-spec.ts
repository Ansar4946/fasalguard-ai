/* F12 PostgreSQL integration. Needs a disposable database named f12_test with ALL migrations applied.
 * The queue is a stub that records jobs; push delivery itself is covered by notification-processor.spec.ts.
 * Nothing here proves delivery to a real phone. */
/* eslint-disable @typescript-eslint/no-unsafe-member-access, @typescript-eslint/no-unsafe-call, @typescript-eslint/no-unsafe-assignment, @typescript-eslint/no-unsafe-argument, @typescript-eslint/explicit-function-return-type */
import 'reflect-metadata';
import type { Server } from 'node:http';
import { randomUUID } from 'node:crypto';
import { DataSource } from 'typeorm';
import { ConfigService } from '@nestjs/config';
import { Reflector } from '@nestjs/core';
import { JwtService } from '@nestjs/jwt';
import { Test } from '@nestjs/testing';
import { BadRequestException, ValidationPipe, type INestApplication } from '@nestjs/common';
// eslint-disable-next-line @typescript-eslint/no-require-imports
import request = require('supertest');
import { JwtAuthGuard } from '../src/domain/auth/guards/jwt-auth.guard';
import { RolesGuard } from '../src/domain/auth/guards/roles.guard';
import { NotificationController } from '../src/domain/notifications/notification.controller';
import { NotificationCategory } from '../src/domain/notifications/notification.enums';
import { NotificationSafetyPolicy } from '../src/domain/notifications/notification.policy';
import { NotificationService } from '../src/domain/notifications/notification.service';

const url = process.env.F12_TEST_DATABASE_URL;
if (url && new URL(url).pathname.slice(1) !== 'f12_test')
  throw new Error('F12 integration requires the disposable f12_test database.');
const integration = url ? describe : describe.skip;

integration('F12 notifications on PostgreSQL', () => {
  const mk = () => ({ user: randomUUID(), sid: randomUUID() });
  const A = mk(),
    B = mk(),
    C = mk(); // C never granted notification consent
  let db: DataSource, app: INestApplication<Server>, service: NotificationService;
  const queueAdd = jest.fn().mockResolvedValue(undefined);
  const config = new ConfigService({
    jwtAccessSecret: 'synthetic-f12-jwt-secret-at-least-32',
    jwtIssuer: 'f12-test',
    jwtAudience: 'f12-test',
  });
  const jwt = new JwtService();
  const token = (who: { user: string; sid: string }) =>
    jwt.sign(
      { sub: who.user, sid: who.sid, role: 'FARMER', type: 'access' },
      {
        secret: 'synthetic-f12-jwt-secret-at-least-32',
        issuer: 'f12-test',
        audience: 'f12-test',
        expiresIn: '5m',
      },
    );
  const api = (who = A) => {
    const auth = { authorization: `Bearer ${token(who)}` };
    return {
      get: (path: string) => request(app.getHttpServer()).get(path).set(auth),
      post: (path: string, body?: object) =>
        request(app.getHttpServer())
          .post(path)
          .set(auth)
          .send(body ?? {}),
      put: (path: string, body: object) =>
        request(app.getHttpServer()).put(path).set(auth).send(body),
      patch: (path: string) => request(app.getHttpServer()).patch(path).set(auth),
      delete: (path: string) => request(app.getHttpServer()).delete(path).set(auth),
    };
  };
  const notify = (who: { user: string }, over: Record<string, unknown> = {}) =>
    service.createNotification({
      userId: who.user,
      category: NotificationCategory.Weather,
      title: 'Inspect field',
      body: 'Inspection priority is raised.',
      ...over,
    });
  const deliveries = (notificationId: string) =>
    db.query<Array<{ status: string; scheduledAt: Date }>>(
      `SELECT status,scheduled_at "scheduledAt" FROM notification_deliveries WHERE notification_id=$1`,
      [notificationId],
    );
  const hhmm = (date: Date) => date.toISOString().slice(11, 16);

  beforeAll(async () => {
    db = new DataSource({ type: 'postgres', url, connectTimeoutMS: 5000 });
    await db.initialize();
    for (const [who, consent] of [
      [A, true],
      [B, true],
      [C, false],
    ] as const) {
      await db.query(
        `INSERT INTO users(id,email,role,status,is_test_account) VALUES($1,$2,'FARMER','active',true)`,
        [who.user, `${who.user}@f12.test`],
      );
      await db.query(
        `INSERT INTO auth_sessions(id,user_id,refresh_token_hash,token_family,last_used_at,expires_at) VALUES($1,$2,$3,$4,now(),now()+interval '1 day')`,
        [
          who.sid,
          who.user,
          (randomUUID() + randomUUID()).replace(/-/g, '').slice(0, 64),
          randomUUID(),
        ],
      );
      await db.query(
        `INSERT INTO consents(user_id,type,policy_version,granted,recorded_at) VALUES($1,'NOTIFICATIONS','test-v1',$2,now())`,
        [who.user, consent],
      );
    }
    service = new NotificationService(
      db,
      { add: queueAdd } as never,
      new NotificationSafetyPolicy(),
      config,
    );
    const module = await Test.createTestingModule({
      controllers: [NotificationController],
      providers: [{ provide: NotificationService, useValue: service }],
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
    // A has two active devices; C has one (to prove consent, not tokens, is what blocks delivery).
    for (const [who, count] of [
      [A, 2],
      [C, 1],
    ] as const)
      for (let i = 0; i < count; i += 1)
        await api(who)
          .post('/devices/push-token', {
            token: `${randomUUID()}-${randomUUID()}`,
            platform: 'ANDROID',
          })
          .expect(201);
  });

  beforeEach(() => queueAdd.mockClear());

  afterAll(async () => {
    await app?.close();
    if (db?.isInitialized) {
      const ids = [A.user, B.user, C.user];
      await db.query(`DELETE FROM notifications WHERE user_id = ANY($1)`, [ids]);
      await db.query(`DELETE FROM device_tokens WHERE user_id = ANY($1)`, [ids]);
      await db.query(`DELETE FROM notification_preferences WHERE user_id = ANY($1)`, [ids]);
      await db.query(`DELETE FROM consents WHERE user_id = ANY($1)`, [ids]);
      await db.query(`DELETE FROM auth_sessions WHERE user_id = ANY($1)`, [ids]);
      await db.query(`DELETE FROM users WHERE id = ANY($1)`, [ids]);
      await db.destroy();
    }
  });

  it.each([
    ['get', '/notifications'],
    ['get', '/notifications/unread-count'],
    ['post', '/notifications/read-all'],
    ['get', '/notifications/preferences'],
    ['put', '/notifications/preferences/WEATHER'],
  ])('rejects an unauthenticated %s %s', async (method, path) => {
    const agent = request(app.getHttpServer()) as unknown as Record<
      string,
      (p: string) => request.Test
    >;
    await agent[method]!(path).send({}).expect(401);
  });

  it('starts empty, then lists only the caller notifications newest first with a delivery summary', async () => {
    expect((await api(A).get('/notifications').expect(200)).body).toEqual([]);
    expect((await api(A).get('/notifications/unread-count').expect(200)).body).toEqual({
      count: 0,
    });
    const first = await notify(A, { title: 'First', deduplicationKey: 'k1' });
    const second = await notify(A, { title: 'Second', deduplicationKey: 'k2' });
    await notify(B, { title: 'Belongs to B' });
    expect(first).toMatchObject({ scheduled: 2 });
    const list = (await api(A).get('/notifications').expect(200)).body as Array<{
      title: string;
      delivery: Record<string, number>;
    }>;
    expect(list.map((n) => n.title)).toEqual(['Second', 'First']);
    expect(list[0]!.delivery).toEqual({ SCHEDULED: 2 });
    expect(JSON.stringify(list)).not.toContain('Belongs to B');
    expect(second).toMatchObject({ scheduled: 2 });
  });

  it('counts, marks one and marks all as read; owners cannot touch each other', async () => {
    const before = (await api(A).get('/notifications').expect(200)).body as Array<{ id: string }>;
    expect((await api(A).get('/notifications/unread-count')).body).toEqual({
      count: before.length,
    });
    await api(B).patch(`/notifications/${before[0]!.id}/read`).expect(404);
    expect((await api(A).get('/notifications/unread-count')).body.count).toBe(before.length);
    await api(A).patch(`/notifications/${before[0]!.id}/read`).expect(200);
    await api(A).patch(`/notifications/${before[0]!.id}/read`).expect(200); // idempotent
    expect((await api(A).get('/notifications/unread-count')).body.count).toBe(before.length - 1);
    expect((await api(A).get('/notifications?unreadOnly=true')).body).toHaveLength(
      before.length - 1,
    );
    expect((await api(B).get('/notifications/unread-count')).body.count).toBe(1);
    const all = await api(A).post('/notifications/read-all').expect(201);
    expect(all.body.updated).toBe(before.length - 1);
    expect((await api(A).post('/notifications/read-all')).body.updated).toBe(0);
    expect((await api(A).get('/notifications/unread-count')).body.count).toBe(0);
    expect((await api(B).get('/notifications/unread-count')).body.count).toBe(1);
  });

  it('bounds the list limit and rejects malformed query values', async () => {
    for (let i = 0; i < 3; i += 1)
      await notify(A, { title: `Bulk ${i}`, deduplicationKey: `bulk${i}` });
    expect((await api(A).get('/notifications?limit=2').expect(200)).body).toHaveLength(2);
    await api(A).get('/notifications?limit=abc').expect(400);
    await api(A).get('/notifications?limit=0').expect(400);
    await api(A).get('/notifications?limit=101').expect(400);
    await api(A).get('/notifications?limit=100').expect(200);
    await api(A).get('/notifications?limit=1').expect(200);
    await api(A).get('/notifications?unreadOnly=maybe').expect(400);
  });

  it('suppresses duplicate notifications by deduplication key', async () => {
    expect(await notify(A, { deduplicationKey: 'dup-1' })).not.toBeNull();
    expect(await notify(A, { deduplicationKey: 'dup-1' })).toBeNull();
    const rows = await db.query(
      `SELECT 1 FROM notifications WHERE user_id=$1 AND deduplication_key='dup-1'`,
      [A.user],
    );
    expect(rows).toHaveLength(1);
  });

  it('stores a notification but creates no delivery without notification consent', async () => {
    const result = await notify(C, { title: 'No consent' });
    expect(result).toMatchObject({ scheduled: 0 });
    expect(queueAdd).not.toHaveBeenCalled();
    expect((await api(C).get('/notifications').expect(200)).body).toHaveLength(1);
    const prefs = (await api(C).get('/notifications/preferences').expect(200)).body;
    expect(prefs.consentGranted).toBe(false);
    expect((await api(A).get('/notifications/preferences')).body.consentGranted).toBe(true);
  });

  it('returns every category with defaults and saves preferences per user', async () => {
    const defaults = (await api(A).get('/notifications/preferences').expect(200)).body;
    expect(defaults.categories.map((c: { category: string }) => c.category).sort()).toEqual(
      Object.values(NotificationCategory).sort(),
    );
    expect(defaults.categories[0]).toMatchObject({
      pushEnabled: true,
      quietHoursStart: null,
      timezone: 'Asia/Karachi',
    });
    const saved = await api(A)
      .put('/notifications/preferences/TASK', {
        pushEnabled: false,
        quietHoursStart: '22:00',
        quietHoursEnd: '06:00',
        timezone: 'Asia/Karachi',
      })
      .expect(200);
    expect(saved.body).toMatchObject({
      category: 'TASK',
      pushEnabled: false,
      quietHoursStart: '22:00',
      quietHoursEnd: '06:00',
    });
    const again = (await api(A).get('/notifications/preferences')).body.categories.find(
      (c: { category: string }) => c.category === 'TASK',
    );
    expect(again).toMatchObject({ pushEnabled: false, quietHoursStart: '22:00' });
    const other = (await api(B).get('/notifications/preferences')).body.categories.find(
      (c: { category: string }) => c.category === 'TASK',
    );
    expect(other.pushEnabled).toBe(true);
  });

  it.each([
    ['only a start', { pushEnabled: true, quietHoursStart: '22:00' }],
    [
      'identical start and end',
      { pushEnabled: true, quietHoursStart: '22:00', quietHoursEnd: '22:00' },
    ],
    ['a malformed time', { pushEnabled: true, quietHoursStart: '25:00', quietHoursEnd: '06:00' }],
    [
      'an unknown time zone',
      {
        pushEnabled: true,
        quietHoursStart: '22:00',
        quietHoursEnd: '06:00',
        timezone: 'Mars/Base',
      },
    ],
    ['a missing pushEnabled', { quietHoursStart: '22:00', quietHoursEnd: '06:00' }],
    ['an unexpected field', { pushEnabled: true, admin: true }],
  ])('rejects preferences with %s', async (_name, body) => {
    await api(A).put('/notifications/preferences/SYSTEM', body).expect(400);
  });

  it('rejects an unknown category', async () => {
    await api(A).put('/notifications/preferences/GOSSIP', { pushEnabled: true }).expect(400);
  });

  it('does not schedule delivery for a category the farmer turned off, but still stores it', async () => {
    await api(A).put('/notifications/preferences/EXPERT', { pushEnabled: false }).expect(200);
    const off = await notify(A, { category: NotificationCategory.Expert, title: 'Expert off' });
    expect(off).toMatchObject({ scheduled: 0 });
    const on = await notify(A, { category: NotificationCategory.Outbreak, title: 'Outbreak on' });
    expect(on).toMatchObject({ scheduled: 2 });
  });

  it('delays delivery to the end of the farmer quiet hours, and urgent notifications bypass them', async () => {
    const now = new Date();
    const start = hhmm(new Date(now.getTime() - 60 * 60_000));
    const end = hhmm(new Date(now.getTime() + 60 * 60_000));
    await api(A)
      .put('/notifications/preferences/SATELLITE', {
        pushEnabled: true,
        quietHoursStart: start,
        quietHoursEnd: end,
        timezone: 'UTC',
      })
      .expect(200);
    const quiet = await notify(A, {
      category: NotificationCategory.Satellite,
      title: 'During quiet hours',
    });
    expect(quiet!.delayedMs).toBeGreaterThan(30 * 60_000);
    expect(quiet!.delayedMs).toBeLessThanOrEqual(60 * 60_000);
    const delays = queueAdd.mock.calls.map((call) => (call[2] as { delay: number }).delay);
    expect(delays).toHaveLength(2);
    expect(delays.every((d) => d === quiet!.delayedMs)).toBe(true);
    const rows = await deliveries(quiet!.id);
    expect(
      rows.every(
        (r) => r.status === 'SCHEDULED' && r.scheduledAt.getTime() > now.getTime() + 30 * 60_000,
      ),
    ).toBe(true);
    // The notification is visible immediately even though the push waits.
    expect(
      (await api(A).get('/notifications')).body.some(
        (n: { title: string }) => n.title === 'During quiet hours',
      ),
    ).toBe(true);
    queueAdd.mockClear();
    const urgent = await notify(A, {
      category: NotificationCategory.Satellite,
      title: 'Urgent',
      urgent: true,
    });
    expect(urgent!.delayedMs).toBe(0);
    expect((queueAdd.mock.calls[0]![2] as { delay: number }).delay).toBe(0);
    // A window that does not contain now never delays.
    await api(A)
      .put('/notifications/preferences/SATELLITE', {
        pushEnabled: true,
        quietHoursStart: hhmm(new Date(now.getTime() + 3 * 3_600_000)),
        quietHoursEnd: hhmm(new Date(now.getTime() + 4 * 3_600_000)),
        timezone: 'UTC',
      })
      .expect(200);
    expect(
      (await notify(A, { category: NotificationCategory.Satellite, title: 'Outside window' }))!
        .delayedMs,
    ).toBe(0);
  });

  it('registers a phone token, lets only its owner remove it, and stops scheduling pushes to it', async () => {
    const pushToken = `phone-${randomUUID()}-${randomUUID()}`;
    const registered = await api(B)
      .post('/devices/push-token', { token: pushToken, platform: 'ANDROID' })
      .expect(201);
    expect(registered.body).toMatchObject({ platform: 'ANDROID', active: true });
    expect(registered.body.id).toMatch(/^[0-9a-f-]{36}$/);
    const before = await notify(B, { title: 'With a device', deduplicationKey: 'tok-1' });
    expect(before).toMatchObject({ scheduled: 1 });
    await api(A).delete(`/devices/push-token/${registered.body.id}`).expect(404);
    expect(
      (await db.query(`SELECT active FROM device_tokens WHERE id=$1`, [registered.body.id]))[0]
        .active,
    ).toBe(true);
    const removed = await api(B).delete(`/devices/push-token/${registered.body.id}`).expect(200);
    expect(removed.body).toEqual({ id: registered.body.id, revoked: true });
    await api(B).delete(`/devices/push-token/${registered.body.id}`).expect(404);
    const after = await notify(B, { title: 'After removal', deduplicationKey: 'tok-2' });
    expect(after).toMatchObject({ scheduled: 0 });
    // The raw token is never returned by any read.
    expect(JSON.stringify((await api(B).get('/notifications')).body)).not.toContain(pushToken);
  });

  it('rejects malformed token registrations before touching the database', async () => {
    const count = async (): Promise<number> =>
      (
        await db.query<Array<{ n: number }>>(
          `SELECT count(*)::int n FROM device_tokens WHERE user_id=$1`,
          [B.user],
        )
      )[0]!.n;
    const before = await count();
    await api(B).post('/devices/push-token', { token: 'short', platform: 'ANDROID' }).expect(400);
    await api(B)
      .post('/devices/push-token', { token: 'x'.repeat(40), platform: 'PLAYSTATION' })
      .expect(400);
    await api(B)
      .post('/devices/push-token', { token: 'x'.repeat(5000), platform: 'ANDROID' })
      .expect(400);
    await api(B)
      .post('/devices/push-token', { token: 'x'.repeat(40), platform: 'ANDROID', admin: true })
      .expect(400);
    await api(B).delete('/devices/push-token/not-a-uuid').expect(400);
    expect(await count()).toBe(before);
  });

  it('rebinds a token to the farmer who registers it last, so a handed-over phone stops serving the old account', async () => {
    const pushToken = `shared-${randomUUID()}-${randomUUID()}`;
    const first = await api(A)
      .post('/devices/push-token', { token: pushToken, platform: 'ANDROID' })
      .expect(201);
    const second = await api(B)
      .post('/devices/push-token', { token: pushToken, platform: 'ANDROID' })
      .expect(201);
    expect(second.body.id).toBe(first.body.id);
    expect(
      (await db.query(`SELECT user_id FROM device_tokens WHERE id=$1`, [first.body.id]))[0].user_id,
    ).toBe(B.user);
    await api(A).delete(`/devices/push-token/${first.body.id}`).expect(404);
    await api(B).delete(`/devices/push-token/${first.body.id}`).expect(200);
  });

  it('still enforces the emergency-wording safety policy', async () => {
    await expect(
      notify(A, { title: 'Critical emergency', body: 'Act now', confirmedEvidence: false }),
    ).rejects.toBeInstanceOf(BadRequestException);
    expect(
      await notify(A, {
        title: 'Critical emergency',
        body: 'Act now',
        confirmedEvidence: true,
        aiConfidence: 0.95,
        deduplicationKey: 'safe-1',
      }),
    ).not.toBeNull();
  });
});

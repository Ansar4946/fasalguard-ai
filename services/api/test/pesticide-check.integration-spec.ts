/* Dawai Check on PostgreSQL. Needs a disposable database named qa10_test with ALL migrations applied
 * (including 1755000047000 and 1755000048000), e.g. a postgis/postgis container. The REAL DPP CSVs
 * (seed/dpp/) are seeded: 26 banned ingredients, 9 banned pre-mixture brands, 139 notified products. The label reader is the deterministic
 * Fake reader and media access is a stub: this proves migration, seed idempotency, fuzzy matching, the
 * HTTP contract, ownership isolation and the flag-off behaviour, not OCR quality (see label-ocr spec). */
/* eslint-disable @typescript-eslint/no-unsafe-member-access, @typescript-eslint/no-unsafe-assignment, @typescript-eslint/no-unsafe-call, @typescript-eslint/explicit-function-return-type */
import 'reflect-metadata';
import { join } from 'node:path';
import type { Server } from 'node:http';
import { randomUUID } from 'node:crypto';
import { DataSource } from 'typeorm';
import { ConfigModule, ConfigService } from '@nestjs/config';
import { Global, Module } from '@nestjs/common';
import { getDataSourceToken } from '@nestjs/typeorm';
import { PesticideCheckModule } from '../src/domain/pesticide-check/pesticide-check.module';
import { LABEL_READER_PROVIDER } from '../src/domain/pesticide-check/providers/label-reader.provider';
import { TesseractLabelReaderProvider } from '../src/domain/pesticide-check/providers/tesseract-label-reader.provider';
import { Reflector } from '@nestjs/core';
import { JwtService } from '@nestjs/jwt';
import { Test } from '@nestjs/testing';
import { ValidationPipe, type INestApplication } from '@nestjs/common';
// eslint-disable-next-line @typescript-eslint/no-require-imports
import request = require('supertest');
import { AIRunLogger } from '../src/domain/ai-ops/ai-run-logger.service';
import { JwtAuthGuard } from '../src/domain/auth/guards/jwt-auth.guard';
import { RolesGuard } from '../src/domain/auth/guards/roles.guard';
import type { MediaService } from '../src/domain/media/media.service';
import {
  PesticideCheckController,
  PesticideProductController,
} from '../src/domain/pesticide-check/pesticide-check.controller';
import { PesticideCheckService } from '../src/domain/pesticide-check/pesticide-check.service';
import { seedPesticideData } from '../src/domain/pesticide-check/pesticide-seed';
import { DppReferenceData1755000048000 } from '../src/infrastructure/database/migrations/1755000048000-dpp-reference-data';
import { FakeLabelReaderProvider } from '../src/domain/pesticide-check/providers/fake-label-reader.provider';

const url = process.env.QA10_TEST_DATABASE_URL;
if (url && new URL(url).pathname.slice(1) !== 'qa10_test')
  throw new Error('Dawai Check integration requires the disposable qa10_test database.');
const integration = url ? describe : describe.skip;
jest.setTimeout(60_000);
const SEED_DIR = join(__dirname, '..', 'src', 'domain', 'pesticide-check', 'seed');

integration('Dawai Check on PostgreSQL', () => {
  const mk = () => ({ user: randomUUID(), sid: randomUUID() });
  const A = mk(),
    B = mk();
  const mediaUrl = new Map<string, string>();
  const media = {
    ready: randomUUID(),
    banned: randomUUID(),
    dpp: randomUUID(),
    dppExpired: randomUUID(),
    premix: randomUUID(),
    unlisted: randomUUID(),
    expired: randomUUID(),
    unreadable: randomUUID(),
    pending: randomUUID(),
    cropScan: randomUUID(),
    ofB: randomUUID(),
  };
  let db: DataSource, app: INestApplication<Server>, bare: INestApplication<Server>;
  const config = new ConfigService({
    jwtAccessSecret: 'synthetic-qa10-jwt-secret-at-least-32',
    jwtIssuer: 'qa10-test',
    jwtAudience: 'qa10-test',
  });
  const jwt = new JwtService();
  const token = (who: { user: string; sid: string }) =>
    jwt.sign(
      { sub: who.user, sid: who.sid, role: 'FARMER', type: 'access' },
      {
        secret: 'synthetic-qa10-jwt-secret-at-least-32',
        issuer: 'qa10-test',
        audience: 'qa10-test',
        expiresIn: '5m',
      },
    );
  const post = (path: string, body: object, who = A) =>
    request(app.getHttpServer())
      .post(path)
      .set('authorization', `Bearer ${token(who)}`)
      .send(body);
  const get = (path: string, who = A) =>
    request(app.getHttpServer())
      .get(path)
      .set('authorization', `Bearer ${token(who)}`);

  beforeAll(async () => {
    db = new DataSource({ type: 'postgres', url, connectTimeoutMS: 5000 });
    await db.initialize();
    for (const who of [A, B]) {
      await db.query(
        `INSERT INTO users(id,email,role,status,is_test_account) VALUES($1,$2,'FARMER','active',true)`,
        [who.user, `${who.user}@dawai.test`],
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
    }
    const asset = (id: string, owner: string, purpose: string, status: string, hint: string) => {
      mediaUrl.set(id, `mem://${hint}/${id}`);
      return db.query(
        `INSERT INTO media_assets(id,owner_id,object_key,original_filename,content_type,size_bytes,purpose,status) VALUES($1,$2,$3,'label.jpg','image/jpeg',1000,$4,$5)`,
        [id, owner, `${purpose}/${owner}/${id}`, purpose, status],
      );
    };
    await asset(media.ready, A.user, 'pesticide-label', 'ready', 'ok');
    await asset(media.banned, A.user, 'pesticide-label', 'ready', 'banned');
    await asset(media.dpp, A.user, 'pesticide-label', 'ready', 'dpp');
    await asset(media.dppExpired, A.user, 'pesticide-label', 'ready', 'dppexpired');
    await asset(media.premix, A.user, 'pesticide-label', 'ready', 'premix');
    await asset(media.unlisted, A.user, 'pesticide-label', 'ready', 'unlisted');
    await asset(media.expired, A.user, 'pesticide-label', 'ready', 'expired');
    await asset(media.unreadable, A.user, 'pesticide-label', 'ready', 'unreadable');
    await asset(media.pending, A.user, 'pesticide-label', 'pending', 'ok');
    await asset(media.cropScan, A.user, 'crop-scan', 'ready', 'ok');
    await asset(media.ofB, B.user, 'pesticide-label', 'ready', 'ok');
    await seedPesticideData(db, SEED_DIR);

    const mediaStub = {
      accessUrl: (_owner: string, id: string) =>
        Promise.resolve({ mediaId: id, url: mediaUrl.get(id)!, expiresAt: new Date() }),
    } as unknown as MediaService;
    const service = new PesticideCheckService(
      db,
      mediaStub,
      new AIRunLogger(db, config),
      new FakeLabelReaderProvider(),
    );
    const guards = () => [
      new JwtAuthGuard(new Reflector(), jwt, config, db),
      new RolesGuard(new Reflector()),
    ];
    const build = async (withModule: boolean) => {
      const moduleRef = await Test.createTestingModule({
        controllers: withModule ? [PesticideCheckController, PesticideProductController] : [],
        providers: [{ provide: PesticideCheckService, useValue: service }],
      }).compile();
      const nest = moduleRef.createNestApplication();
      nest.useGlobalPipes(
        new ValidationPipe({ transform: true, whitelist: true, forbidNonWhitelisted: true }),
      );
      nest.useGlobalGuards(...guards());
      await nest.init();
      return nest;
    };
    app = await build(true);
    // What AppModule composes when DAWAI_CHECK_ENABLED is not "true": the module is simply absent.
    bare = await build(false);
  }, 120_000);

  afterAll(async () => {
    await app?.close();
    await bare?.close();
    if (db?.isInitialized) {
      for (const who of [A, B]) {
        await db.query(`DELETE FROM ai_runs WHERE user_id=$1`, [who.user]);
        await db.query(`DELETE FROM pesticide_checks WHERE user_id=$1`, [who.user]);
        await db.query(`DELETE FROM media_assets WHERE owner_id=$1`, [who.user]);
        await db.query(`DELETE FROM auth_sessions WHERE user_id=$1`, [who.user]);
        await db.query(`DELETE FROM users WHERE id=$1`, [who.user]);
      }
      await db.destroy();
    }
  });

  it('migration created the schema, pg_trgm and the extended purpose constraint', async () => {
    const ext = await db.query(`SELECT 1 FROM pg_extension WHERE extname='pg_trgm'`);
    expect(ext).toHaveLength(1);
    const idx = await db.query(
      `SELECT indexdef FROM pg_indexes WHERE indexname='idx_pesticide_products_brand_trgm'`,
    );
    expect(idx[0].indexdef).toMatch(/gin/i);
    const cols = await db.query(
      `SELECT column_name FROM information_schema.columns WHERE table_name='pesticide_checks'`,
    );
    for (const c of [
      'user_id',
      'media_asset_id',
      'input_mode',
      'extracted',
      'matched_product_id',
      'verdict',
      'score',
      'checks',
      'language',
      'provider',
      'model',
      'latency_ms',
      'created_at',
    ])
      expect(cols.map((r: { column_name: string }) => r.column_name)).toContain(c);
  });

  it('seed loads the real DPP lists with provenance, is idempotent, and demo products stay demo', async () => {
    const count = async () =>
      Number((await db.query(`SELECT count(*)::int c FROM pesticide_products`))[0].c) +
      Number((await db.query(`SELECT count(*)::int c FROM banned_pesticide_ingredients`))[0].c) +
      Number((await db.query(`SELECT count(*)::int c FROM banned_pesticide_products`))[0].c) +
      Number((await db.query(`SELECT count(*)::int c FROM dpp_notified_products`))[0].c);
    const before = await count();
    expect(before).toBe(20 + 26 + 9 + 139);
    const again = await seedPesticideData(db, SEED_DIR);
    expect(await count()).toBe(before);
    expect(again).toMatchObject({
      products: 20,
      banned: 26,
      bannedPremixes: 9,
      notified: 139,
      removedDemoBanned: 0,
      skipped: [],
    });
    expect(await db.query(`SELECT 1 FROM pesticide_products WHERE NOT is_demo`)).toHaveLength(0);
    const names = (
      await db.query(`SELECT ingredient_normalized n FROM banned_pesticide_ingredients`)
    ).map((r: { n: string }) => r.n);
    expect(names).toEqual(expect.arrayContaining(['ddt', 'endosulfan', 'monocrotophos', 'bhc']));
    // Placeholder demo rows that are not on the DPP list are gone and everything left is official.
    expect(names).not.toContain('aldrin');
    expect(names).not.toContain('lindane');
    expect(await db.query(`SELECT 1 FROM banned_pesticide_ingredients WHERE is_demo`)).toHaveLength(
      0,
    );
    const endo = (
      await db.query(
        `SELECT notification_number,to_char(notification_date,'YYYY-MM-DD') d,to_char(retrieved_on,'YYYY-MM-DD') r,position_in_pakistan p
         FROM banned_pesticide_ingredients WHERE ingredient_normalized='endosulfan'`,
      )
    )[0];
    expect(endo).toMatchObject({
      notification_number: 'S.R.O. 1329(I)/2012',
      d: '2012-10-22',
      r: '2026-10-23',
    });
    expect(endo.p).toMatch(/ban its use in Pakistan/);
    const bhc = (
      await db.query(
        `SELECT notification_number,position_in_pakistan p FROM banned_pesticide_ingredients WHERE ingredient_normalized='bhc'`,
      )
    )[0];
    expect(bhc.notification_number).toBeNull();
    expect(bhc.p).toMatch(/Deregistered/);
    const premix = (
      await db.query(
        `SELECT brand_normalized,ingredients_normalized i,notification_number n,to_char(notification_date,'YYYY-MM-DD') d
         FROM banned_pesticide_products WHERE brand_normalized='tombel'`,
      )
    )[0];
    expect(premix).toMatchObject({
      i: ['quinalphos', 'thiometon'],
      n: 'SRO 624(I)/96',
      d: '1996-07-15',
    });
    const abam = (
      await db.query(
        `SELECT ingredients_normalized i,concentration_text c,formulations f,category,who_class,notification FROM dpp_notified_products WHERE serial=1`,
      )
    )[0];
    expect(abam).toMatchObject({
      i: ['abamectin'],
      c: '1.8%',
      f: ['EC'],
      category: 'Ins.',
      who_class: 'III',
      notification: 'S.R.O. 636(I)/2005 dated 22.06.2005',
    });
    const withClass = Number(
      (
        await db.query(
          `SELECT count(*)::int c FROM dpp_notified_products WHERE who_class IS NOT NULL`,
        )
      )[0].c,
    );
    expect(withClass).toBeGreaterThanOrEqual(120);
    // A leftover demo banned row (e.g. from an older seed) is removed on the next seed run.
    await db.query(
      `INSERT INTO banned_pesticide_ingredients(ingredient,ingredient_normalized,source,is_demo) VALUES('Aldrin','aldrin','old demo',true)`,
    );
    const cleaned = await seedPesticideData(db, SEED_DIR);
    expect(cleaned.removedDemoBanned).toBe(1);
    expect(await count()).toBe(before);
  });

  it('pg_trgm fuzzy matching tolerates spelling noise on normalised brand names', async () => {
    const rows = await db.query(
      `SELECT brand_name, similarity(brand_normalized,$1)::float8 sim FROM pesticide_products WHERE brand_normalized % $1 ORDER BY sim DESC LIMIT 1`,
      ['demoimidaclopird20sl'],
    );
    expect(rows[0].brand_name).toBe('DEMO Imidacloprid 20% SL');
    expect(rows[0].sim).toBeGreaterThan(0.6);
  });

  it('photo screening returns the full response contract (VERIFIED against the demo list)', async () => {
    const res = await post('/pesticide-checks', {
      mediaAssetId: media.ready,
      language: 'en',
    }).expect(201);
    const b = res.body;
    expect(b).toMatchObject({
      inputMode: 'photo',
      language: 'en',
      verdict: 'VERIFIED',
      demoDataset: true,
      provider: 'fake',
      model: 'fake-label-reader',
    });
    expect(b.id).toMatch(/^[0-9a-f-]{36}$/);
    expect(typeof b.score).toBe('number');
    expect(b.extracted.brandName).toBe('DEMO Imidacloprid 20% SL');
    expect(b.extracted.expiryDate).toBe('03/2028');
    expect(b.extracted.rawText).toContain('Imidacloprid');
    expect(b.extracted.confidence).toBeDefined();
    expect(b.matchedProduct).toMatchObject({
      brandName: 'DEMO Imidacloprid 20% SL',
      similarity: 1,
    });
    expect(b.checks.map((c: { code: string }) => c.code)).toContain('banned_ingredient');
    expect(b.checks[0]).toEqual(
      expect.objectContaining({
        code: expect.any(String),
        status: expect.any(String),
        titleEn: expect.any(String),
        titleUr: expect.any(String),
        detailEn: expect.any(String),
        detailUr: expect.any(String),
      }),
    );
    expect(b.explanation).toMatch(/DEMO list/);
    expect(b.explanation).not.toMatch(/genuine/i);
    // Additive DPP fields: a matched demo product keeps the DEMO flag even though the DPP lists are loaded.
    expect(b.listCoverage).toBe('DPP_PARTIAL');
    expect(b.dataSources).toHaveLength(2);
    expect(b.matchedNotified).toMatchObject({
      productText: expect.stringMatching(/^Imidacloprid/),
    });
    expect(b.bannedMatch).toBeNull();
    expect(b.disclaimer.en).toMatch(/not a laboratory test/);
    expect(b.disclaimer.ur).toMatch(/[؀-ۿ]/);
    expect(typeof b.latencyMs).toBe('number');
    const logged = await db.query(
      `SELECT operation,status FROM ai_runs WHERE user_id=$1 AND source_id=$2`,
      [A.user, b.id],
    );
    expect(logged[0]).toMatchObject({ operation: 'LABEL_READING', status: 'COMPLETED' });
  });

  it('Urdu language yields an Urdu explanation', async () => {
    const res = await post('/pesticide-checks', {
      mediaAssetId: media.ready,
      language: 'ur',
    }).expect(201);
    expect(res.body.language).toBe('ur');
    expect(res.body.explanation).toMatch(/[؀-ۿ]/);
  });

  it('DPP notified: Abamectin 1.8% EC is consistent with the list, with WHO class, VERIFIED, not a demo result', async () => {
    const b = (await post('/pesticide-checks', { mediaAssetId: media.dpp }).expect(201)).body;
    expect(b.verdict).toBe('VERIFIED');
    expect(b.demoDataset).toBe(false);
    expect(b.listCoverage).toBe('DPP_PARTIAL');
    expect(b.dataSources.map((d: { asOf: string }) => d.asOf)).toEqual([
      '2026-10-23',
      '2026-10-23',
    ]);
    expect(b.dataSources[0].url).toMatch(/^https:\/\/plantprotection\.gov\.pk\//);
    const notified = b.checks.find((c: { code: string }) => c.code === 'ingredient_notified');
    expect(notified.status).toBe('pass');
    expect(notified.detailEn).toMatch(/WHO class III/);
    expect(b.matchedNotified).toEqual({
      productText: 'Abamectin 1.8% EC.',
      category: 'Ins.',
      whoClass: 'III',
      notification: 'S.R.O. 636(I)/2005 dated 22.06.2005',
    });
    expect(b.matchedProduct).toBeNull();
    const brand = b.checks.find((c: { code: string }) => c.code === 'product_registered');
    expect(brand.status).toBe('unknown');
    expect(brand.detailEn).toMatch(/brand names are not part of the DPP lists we hold/);
    expect(b.explanation).toMatch(/consistent with the DPP notified list/);
    expect(b.explanation).not.toMatch(/genuine|authentic|approved/i);
    // A saved result re-presents identically.
    const again = (await get(`/pesticide-checks/${b.id}`).expect(200)).body;
    expect(again.matchedNotified).toEqual(b.matchedNotified);
    expect(again.listCoverage).toBe('DPP_PARTIAL');
    expect(again.dataSources).toEqual(b.dataSources);
  });

  it('DPP banned pre-mixture: an Ammo-phos 450 EC label is HIGH_RISK through the brand check alone', async () => {
    const b = (await post('/pesticide-checks', { mediaAssetId: media.premix }).expect(201)).body;
    expect(b.extracted.brandName).toBe('Ammo-phos 450 EC');
    expect(b.verdict).toBe('HIGH_RISK');
    expect(b.score).toBe(100);
    const code = (c: string): { status: string; detailEn: string } =>
      b.checks.find((x: { code: string }) => x.code === c) as { status: string; detailEn: string };
    expect(code('banned_ingredient').status).toBe('pass');
    expect(code('banned_premix_brand').status).toBe('fail');
    expect(code('banned_premix_brand').detailEn).toMatch(
      /listed as a banned pre-mixture \(SRO 624\(I\)\/96/,
    );
    expect(b.bannedMatch).toMatchObject({
      kind: 'premix',
      notificationNumber: 'SRO 624(I)/96',
      notificationDate: '1996-07-15',
    });
    expect(b.demoDataset).toBe(false);
    const again = (await get(`/pesticide-checks/${b.id}`).expect(200)).body;
    expect(again.bannedMatch).toEqual(b.bannedMatch);
  });

  it('DPP banned ingredient: Endosulfan is HIGH_RISK and the detail cites S.R.O. 1329(I)/2012', async () => {
    const b = (await post('/pesticide-checks', { mediaAssetId: media.banned }).expect(201)).body;
    expect(b.verdict).toBe('HIGH_RISK');
    const c = b.checks.find((x: { code: string }) => x.code === 'banned_ingredient');
    expect(c.status).toBe('fail');
    expect(c.detailEn).toMatch(/Listed in the DPP banned pesticides list/);
    expect(c.detailEn).toMatch(/S\.R\.O\. 1329\(I\)\/2012/);
    expect(b.bannedMatch).toMatchObject({
      kind: 'ingredient',
      name: 'Endosulfan',
      notificationNumber: 'S.R.O. 1329(I)/2012',
      notificationDate: '2012-10-22',
    });
    expect(b.demoDataset).toBe(false);
  });

  it('an ingredient that is not on the partial list is unknown (never warn/fail) and never called unregistered', async () => {
    const b = (await post('/pesticide-checks', { mediaAssetId: media.unlisted }).expect(201)).body;
    const c = b.checks.find((x: { code: string }) => x.code === 'ingredient_notified');
    expect(c.status).toBe('unknown');
    expect(c.detailEn).toMatch(/does not mean it is unregistered/);
    expect(
      b.checks.filter((x: { status: string }) => x.status === 'warn' || x.status === 'fail'),
    ).toEqual([]);
    expect(b.verdict).toBe('SUSPICIOUS');
    expect(b.score).toBe(25);
    expect(b.matchedNotified).toBeNull();
    expect(b.explanation).toMatch(/could not confirm/i);
    expect(b.explanation).toMatch(/does not mean it is fake or unregistered/);
    // The only mention of "unregistered"/"fake" is the negation.
    const stripped = JSON.stringify([b.explanation, b.checks]).replace(
      /does not mean it is (?:fake or )?unregistered/g,
      '',
    );
    expect(stripped).not.toMatch(/unregistered|not registered|\bfake\b/i);
  });

  it('an expired label fails even when its ingredient is on the DPP list', async () => {
    const b = (await post('/pesticide-checks', { mediaAssetId: media.dppExpired }).expect(201))
      .body;
    const code = (c: string): { status: string; detailEn: string } =>
      b.checks.find((x: { code: string }) => x.code === c) as { status: string; detailEn: string };
    expect(code('expiry_date').status).toBe('fail');
    expect(code('ingredient_notified').status).toBe('pass');
    expect(b.verdict).toBe('SUSPICIOUS');
  });

  it('a banned ingredient forces HIGH_RISK; an expired label fails; noise is UNREADABLE', async () => {
    const banned = (await post('/pesticide-checks', { mediaAssetId: media.banned }).expect(201))
      .body;
    expect(banned.verdict).toBe('HIGH_RISK');
    expect(banned.score).toBe(100);
    expect(banned.checks.find((c: { code: string }) => c.code === 'banned_ingredient').status).toBe(
      'fail',
    );
    const expired = (await post('/pesticide-checks', { mediaAssetId: media.expired }).expect(201))
      .body;
    expect(expired.checks.find((c: { code: string }) => c.code === 'expiry_date').status).toBe(
      'fail',
    );
    expect(expired.verdict).not.toBe('VERIFIED');
    const noise = (await post('/pesticide-checks', { mediaAssetId: media.unreadable }).expect(201))
      .body;
    expect(noise.verdict).toBe('UNREADABLE');
  });

  it('manual screening: fuzzy found, unknown brand, banned ingredient, cheap price', async () => {
    const found = (
      await post('/pesticide-checks/manual', {
        brandName: 'demo imidacloprid 20 SL',
        expiryDate: '12/2030',
      }).expect(201)
    ).body;
    expect(found.inputMode).toBe('manual');
    expect(found.matchedProduct.brandName).toBe('DEMO Imidacloprid 20% SL');
    expect(found.verdict).toBe('VERIFIED');
    const unknown = (
      await post('/pesticide-checks/manual', { brandName: 'Totally Unknown Brand' }).expect(201)
    ).body;
    expect(unknown.matchedProduct).toBeNull();
    expect(unknown.verdict).toBe('SUSPICIOUS');
    const banned = (
      await post('/pesticide-checks/manual', {
        brandName: 'Old Dust',
        activeIngredient: 'DDT',
      }).expect(201)
    ).body;
    expect(banned.verdict).toBe('HIGH_RISK');
    // price: give the demo product a reference price (is_demo kept) and screen a very cheap offer.
    await db.query(
      `UPDATE pesticide_products SET reference_price_rs=1000 WHERE brand_normalized='demoglyphosate41sl'`,
    );
    const cheap = (
      await post('/pesticide-checks/manual', {
        brandName: 'DEMO Glyphosate 41% SL',
        priceRs: 300,
        expiryDate: '12/2030',
      }).expect(201)
    ).body;
    expect(cheap.checks.find((c: { code: string }) => c.code === 'price_sanity').status).toBe(
      'warn',
    );
    await db.query(
      `UPDATE pesticide_products SET reference_price_rs=NULL WHERE brand_normalized='demoglyphosate41sl'`,
    );
  });

  it('validates input', async () => {
    await post('/pesticide-checks', { mediaAssetId: 'nope' }).expect(400);
    await post('/pesticide-checks', { mediaAssetId: media.ready, language: 'fr' }).expect(400);
    await post('/pesticide-checks', { mediaAssetId: media.ready, hack: 1 }).expect(400);
    await post('/pesticide-checks/manual', { brandName: 'x' }).expect(400);
    await post('/pesticide-checks/manual', { brandName: 'Valid Brand', priceRs: -5 }).expect(400);
  });

  it("media must be the caller's own, purpose pesticide-label and ready", async () => {
    await post('/pesticide-checks', { mediaAssetId: media.ofB }).expect(404);
    await post('/pesticide-checks', { mediaAssetId: randomUUID() }).expect(404);
    await post('/pesticide-checks', { mediaAssetId: media.cropScan }).expect(400);
    await post('/pesticide-checks', { mediaAssetId: media.pending }).expect(400);
    await post('/pesticide-checks', { mediaAssetId: media.ready }, B).expect(404);
  });

  it('results are owner scoped: list is limited to 20 and B cannot read A', async () => {
    const mine = (await post('/pesticide-checks', { mediaAssetId: media.ready }).expect(201)).body;
    await get(`/pesticide-checks/${mine.id}`, B).expect(404);
    await get(`/pesticide-checks/${mine.id}`).expect(200);
    await get(`/pesticide-checks/${randomUUID()}`).expect(404);
    await get('/pesticide-checks/not-a-uuid').expect(400);
    const theirs = (await post('/pesticide-checks', { mediaAssetId: media.ofB }, B).expect(201))
      .body;
    const listB = (await get('/pesticide-checks', B).expect(200)).body;
    expect(listB.map((r: { id: string }) => r.id)).toEqual([theirs.id]);
    expect(listB[0]).toEqual({
      id: theirs.id,
      createdAt: expect.any(String),
      verdict: expect.any(String),
      score: expect.any(Number),
      demoDataset: true,
      brandName: 'DEMO Imidacloprid 20% SL',
    });
    for (let i = 0; i < 22; i += 1)
      await post('/pesticide-checks/manual', { brandName: 'Bulk Brand ' + i }).expect(201);
    const listA = (await get('/pesticide-checks').expect(200)).body;
    expect(listA).toHaveLength(20);
    expect(listA.map((r: { id: string }) => r.id)).not.toContain(theirs.id);
    const dates = listA.map((r: { createdAt: string }) => Date.parse(r.createdAt));
    expect([...dates].sort((x, y) => y - x)).toEqual(dates);
  });

  it('product autocomplete returns at most 10 matches', async () => {
    const hits = (await get('/pesticide-products?search=demo').expect(200)).body;
    expect(hits).toHaveLength(10);
    const one = (await get('/pesticide-products?search=mancoz').expect(200)).body;
    expect(one[0].brandName).toBe('DEMO Mancozeb 80% WP');
    expect((await get('/pesticide-products?search=a').expect(200)).body).toEqual([]);
    expect((await get('/pesticide-products').expect(200)).body).toEqual([]);
  });

  it('requires authentication', async () => {
    await request(app.getHttpServer()).get('/pesticide-checks').expect(401);
  });

  it('migration 1755000048000 is reversible: down drops the DPP tables and columns, up restores them', async () => {
    const qr = db.createQueryRunner();
    const exists = async (t: string) =>
      (await qr.query(`SELECT to_regclass($1) r`, [t]))[0].r !== null;
    try {
      expect(await exists('dpp_notified_products')).toBe(true);
      await new DppReferenceData1755000048000().down(qr);
      expect(await exists('dpp_notified_products')).toBe(false);
      expect(await exists('banned_pesticide_products')).toBe(false);
      const cols = await qr.query(
        `SELECT column_name FROM information_schema.columns WHERE table_name IN('banned_pesticide_ingredients','pesticide_checks')`,
      );
      const names = cols.map((c: { column_name: string }) => c.column_name);
      for (const gone of [
        'position_in_pakistan',
        'notification_number',
        'list_coverage',
        'banned_match',
      ])
        expect(names).not.toContain(gone);
      // The demo tables keep working while the DPP tables are absent.
      expect(Number((await qr.query(`SELECT count(*)::int c FROM pesticide_products`))[0].c)).toBe(
        20,
      );
      await new DppReferenceData1755000048000().up(qr);
      expect(await exists('dpp_notified_products')).toBe(true);
      const idx = await qr.query(
        `SELECT indexdef FROM pg_indexes WHERE indexname='idx_banned_products_brand_trgm'`,
      );
      expect(idx[0].indexdef).toMatch(/gin/i);
    } finally {
      await qr.release();
    }
    const reseeded = await seedPesticideData(db, SEED_DIR);
    expect(reseeded).toMatchObject({ notified: 139, banned: 26, bannedPremixes: 9, skipped: [] });
    // Saving works again after the round trip.
    const old = (
      await post('/pesticide-checks/manual', { brandName: 'DEMO Imidacloprid 20% SL' }).expect(201)
    ).body;
    expect(old.listCoverage).toBe('DPP_PARTIAL');
  });

  it('flag off: the routes do not exist', async () => {
    await request(bare.getHttpServer())
      .get('/pesticide-checks')
      .set('authorization', `Bearer ${token(A)}`)
      .expect(404);
    await request(bare.getHttpServer())
      .post('/pesticide-checks/manual')
      .set('authorization', `Bearer ${token(A)}`)
      .send({ brandName: 'Valid Brand' })
      .expect(404);
  });

  it('PesticideCheckModule wires up with the real providers and selects the reader from config', async () => {
    @Global()
    @Module({
      providers: [{ provide: getDataSourceToken(), useValue: db }],
      exports: [getDataSourceToken()],
    })
    class DbStub {}
    const build = async (provider: string) => {
      const ref = await Test.createTestingModule({
        imports: [
          ConfigModule.forRoot({
            isGlobal: true,
            ignoreEnvFile: true,
            load: [
              () => ({
                labelReaderProvider: provider,
                objectStorageProvider: 'mock',
                nodeEnv: 'test',
              }),
            ],
          }),
          DbStub,
          PesticideCheckModule,
        ],
      }).compile();
      return ref;
    };
    const tess = await build('tesseract');
    expect(tess.get(LABEL_READER_PROVIDER)).toBeInstanceOf(TesseractLabelReaderProvider);
    expect(tess.get(PesticideCheckService)).toBeDefined();
    const fake = await build('fake');
    expect(fake.get(LABEL_READER_PROVIDER)).toBeInstanceOf(FakeLabelReaderProvider);
    await tess.close();
    await fake.close();
  });
});

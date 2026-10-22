/* Disposable PostgreSQL integration: provider output is an explicit contract stub, not model evidence. */
/* eslint-disable @typescript-eslint/no-unsafe-member-access, @typescript-eslint/explicit-function-return-type */
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
import { AssistantController } from '../src/domain/assistant/assistant.controller';
import { AssistantService } from '../src/domain/assistant/assistant.service';
import { JwtAuthGuard } from '../src/domain/auth/guards/jwt-auth.guard';
import { RolesGuard } from '../src/domain/auth/guards/roles.guard';
import type { AgricultureAssistantProvider } from '../src/domain/assistant/providers/agriculture-assistant.provider';
import type {
  SpeechToTextProvider,
  TextToSpeechProvider,
} from '../src/domain/assistant/providers/speech.provider';
import { VOICE_CONSENT_VERSION } from '../src/domain/assistant/providers/speech.provider';
import type { MediaService } from '../src/domain/media/media.service';
import { MetricsService } from '../src/observability/metrics.service';
import { VoiceProcessingConsent1755000042000 } from '../src/infrastructure/database/migrations/1755000042000-voice-processing-consent';

const url = process.env.F08_TEST_DATABASE_URL;
if (
  url &&
  !['f07_test', 'f03_test', 'f03_runtime_test', 'f08_test'].includes(new URL(url).pathname.slice(1))
)
  throw new Error('F08 integration requires an explicitly allowed disposable test database.');
const integration = url ? describe : describe.skip;

integration('F08 authenticated PostgreSQL voice workflow', () => {
  const schema = `f08_test_${randomUUID().replaceAll('-', '')}`;
  const userId = randomUUID(),
    otherUserId = randomUUID(),
    sessionId = randomUUID();
  let admin: DataSource, db: DataSource, app: INestApplication<Server>;
  const config = new ConfigService({
    jwtAccessSecret: 'synthetic-f08-test-key-only',
    jwtIssuer: 'f08-test',
    jwtAudience: 'f08-test',
  });
  const jwt = new JwtService();
  const capabilities = {
    available: true,
    provider: 'CONTRACT_STUB',
    sttLanguages: ['en', 'ur', 'hi'] as const,
    ttsLanguages: ['en', 'ur', 'hi'] as const,
    acceptedContentTypes: ['audio/wav'],
    maxRecordingSeconds: 120,
    consentVersion: VOICE_CONSENT_VERSION as typeof VOICE_CONSENT_VERSION,
  };
  const providerCapabilities = () => ({
    ...capabilities,
    sttLanguages: [...capabilities.sttLanguages],
    ttsLanguages: [...capabilities.ttsLanguages],
  });
  const stt: SpeechToTextProvider = {
    capabilities: providerCapabilities,
    transcribe: jest.fn().mockResolvedValue({
      text: 'human labelled contract transcript',
      provider: 'CONTRACT_STUB',
      modelId: 'stub',
      modelVersion: 'test',
    }),
  };
  const tts: TextToSpeechProvider = {
    capabilities: providerCapabilities,
    synthesize: jest.fn().mockResolvedValue({
      audioBase64: 'AQID',
      contentType: 'audio/mpeg',
      provider: 'CONTRACT_STUB',
      modelId: 'stub',
      modelVersion: 'test',
    }),
  };
  const token = () =>
    jwt.sign(
      { sub: userId, sid: sessionId, type: 'access' },
      {
        secret: 'synthetic-f08-test-key-only',
        issuer: 'f08-test',
        audience: 'f08-test',
        expiresIn: '5m',
      },
    );

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
    await db.query(
      `CREATE TABLE users(id uuid PRIMARY KEY,role text,status text,deleted_at timestamptz); CREATE TABLE auth_sessions(id uuid PRIMARY KEY,user_id uuid,revoked_at timestamptz,expires_at timestamptz); CREATE TABLE media_assets(id uuid PRIMARY KEY,owner_id uuid,purpose text,content_type text,size_bytes bigint,status text); CREATE TABLE consents(id uuid PRIMARY KEY DEFAULT gen_random_uuid(),user_id uuid,type text,policy_version text,granted boolean,recorded_at timestamptz,revoked_at timestamptz,created_at timestamptz DEFAULT now(),CONSTRAINT ck_consents_type CHECK(type IN ('LOCATION_PROCESSING','ANONYMOUS_COMMUNITY_REPORTING','AI_IMAGE_ANALYSIS','NOTIFICATIONS','RESEARCH_DATA_USE','PRIVACY_POLICY','TERMS_OF_SERVICE')))`,
    );
    const runner = db.createQueryRunner();
    await runner.connect();
    try {
      await new VoiceProcessingConsent1755000042000().up(runner);
    } finally {
      await runner.release();
    }
    await db.query("INSERT INTO users VALUES($1,'FARMER','active',NULL)", [userId]);
    await db.query("INSERT INTO auth_sessions VALUES($1,$2,NULL,now()+interval '1 hour')", [
      sessionId,
      userId,
    ]);
    const assistant = { respond: jest.fn() } as unknown as AgricultureAssistantProvider;
    const media = {
      accessUrl: jest.fn().mockResolvedValue({
        mediaId: 'test',
        url: 'https://private.invalid/audio.wav',
        expiresAt: new Date(),
      }),
    } as unknown as MediaService;
    const service = new AssistantService(db, assistant, stt, tts, media, new MetricsService());
    const module = await Test.createTestingModule({
      controllers: [AssistantController],
      providers: [{ provide: AssistantService, useValue: service }],
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
      if (/^f08_test_[a-f0-9]{32}$/.test(schema))
        await admin.query(`DROP SCHEMA IF EXISTS "${schema}" CASCADE`);
      await admin.destroy();
    }
  }, 30000);

  it('requires authentication for capability discovery', async () => {
    await request(app.getHttpServer()).get('/assistant/speech/capabilities').expect(401);
    await request(app.getHttpServer())
      .get('/assistant/speech/capabilities')
      .set('authorization', `Bearer ${token()}`)
      .expect(200)
      .expect(({ body }) => expect(body.available).toBe(true));
  });

  it('rejects wrong-purpose and cross-owner media', async () => {
    const wrong = randomUUID(),
      foreign = randomUUID();
    await db.query(
      "INSERT INTO media_assets VALUES($1,$2,'crop-scan','audio/wav',100,'ready'),($3,$4,'voice-note','audio/wav',100,'ready')",
      [wrong, userId, foreign, otherUserId],
    );
    const payload = { language: 'ur', consent: true, consentVersion: VOICE_CONSENT_VERSION };
    await request(app.getHttpServer())
      .post('/assistant/speech/transcribe')
      .set('authorization', `Bearer ${token()}`)
      .send({ ...payload, mediaAssetId: wrong })
      .expect(400);
    await request(app.getHttpServer())
      .post('/assistant/speech/transcribe')
      .set('authorization', `Bearer ${token()}`)
      .send({ ...payload, mediaAssetId: foreign })
      .expect(404);
  });

  it('records consent, transcribes owned ready voice media, and gates synthesis', async () => {
    const mediaId = randomUUID();
    await request(app.getHttpServer())
      .post('/assistant/speech/consent')
      .set('authorization', `Bearer ${token()}`)
      .send({ granted: true, consentVersion: VOICE_CONSENT_VERSION })
      .expect(201);
    await db.query("INSERT INTO media_assets VALUES($1,$2,'voice-note','audio/wav',100,'ready')", [
      mediaId,
      userId,
    ]);
    await request(app.getHttpServer())
      .post('/assistant/speech/transcribe')
      .set('authorization', `Bearer ${token()}`)
      .send({
        mediaAssetId: mediaId,
        language: 'ur',
        consent: true,
        consentVersion: VOICE_CONSENT_VERSION,
      })
      .expect(201)
      .expect(({ body }) => expect(body.transcript).toBe('human labelled contract transcript'));
    expect(
      Number(
        (
          await db.query(
            "SELECT count(*) count FROM consents WHERE user_id=$1 AND type='VOICE_PROCESSING' AND granted=true",
            [userId],
          )
        )[0].count,
      ),
    ).toBe(1);
    await request(app.getHttpServer())
      .post('/assistant/speech/synthesize')
      .set('authorization', `Bearer ${token()}`)
      .send({ text: 'kapas ki fasal', language: 'ur', consentVersion: VOICE_CONSENT_VERSION })
      .expect(201);
    await request(app.getHttpServer())
      .post('/assistant/speech/consent')
      .set('authorization', `Bearer ${token()}`)
      .send({ granted: false, consentVersion: VOICE_CONSENT_VERSION })
      .expect(201);
    await request(app.getHttpServer())
      .post('/assistant/speech/synthesize')
      .set('authorization', `Bearer ${token()}`)
      .send({ text: 'kapas ki fasal', language: 'ur', consentVersion: VOICE_CONSENT_VERSION })
      .expect(403);
  });

  it('reuses the active consent grant and reports the stored state in capabilities', async () => {
    const consent = (granted: boolean) =>
      request(app.getHttpServer())
        .post('/assistant/speech/consent')
        .set('authorization', `Bearer ${token()}`)
        .send({ granted, consentVersion: VOICE_CONSENT_VERSION });
    const rows = async (granted: boolean): Promise<number> =>
      Number(
        (
          await db.query(
            "SELECT count(*) count FROM consents WHERE user_id=$1 AND type='VOICE_PROCESSING' AND granted=$2",
            [userId, granted],
          )
        )[0].count,
      );
    const consentGranted = async (): Promise<unknown> =>
      (
        await request(app.getHttpServer())
          .get('/assistant/speech/capabilities')
          .set('authorization', `Bearer ${token()}`)
          .expect(200)
      ).body.consentGranted;
    const grantsBefore = await rows(true);
    const revokesBefore = await rows(false);
    expect(await consentGranted()).toBe(false);
    const parallel = await Promise.all(Array.from({ length: 5 }, () => consent(true)));
    expect(parallel.map((x) => x.status)).toEqual(Array(5).fill(201));
    await consent(true).expect(201);
    expect(await rows(true)).toBe(grantsBefore + 1);
    expect(await consentGranted()).toBe(true);
    await consent(false).expect(201);
    await consent(false).expect(201);
    expect(await rows(false)).toBe(revokesBefore + 1);
    expect(await consentGranted()).toBe(false);
    await consent(true).expect(201);
    expect(await rows(true)).toBe(grantsBefore + 2);
    expect(await consentGranted()).toBe(true);
  });
});

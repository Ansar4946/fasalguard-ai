import {
  BadRequestException,
  ForbiddenException,
  Inject,
  Injectable,
  NotFoundException,
  ServiceUnavailableException,
} from '@nestjs/common';
import { InjectDataSource } from '@nestjs/typeorm';
import { DataSource } from 'typeorm';
import { MediaService } from '../media/media.service';
import {
  CreateConversationDto,
  SendAssistantMessageDto,
  SynthesizeSpeechDto,
  TranscribeVoiceDto,
  VoiceConsentDto,
} from './dto/assistant.dto';
import { AssistantAction, AssistantRole } from './assistant.enums';
import { MetricsService } from '../../observability/metrics.service';
import {
  AGRICULTURE_ASSISTANT_PROVIDER,
  ASSISTANT_LANGUAGES,
  type ActionProposal,
  type AgricultureAssistantProvider,
  type AssistantLanguage,
  type AssistantProviderResult,
} from './providers/agriculture-assistant.provider';
import { ConfigService } from '@nestjs/config';
import { ABSTENTION, ASSISTANT_PROMPT_VERSION, citationsAreGrounded } from './grounding';
import { KnowledgeRetrievalService } from './knowledge-retrieval.service';
import { PersonalContextService, type PersonalAnswer } from './personal-context.service';
import { detectPersonalIntent, scriptLanguage } from './personal-intent';
import type { AccountSource } from './personal-answers';
import {
  SPEECH_TO_TEXT_PROVIDER,
  TEXT_TO_SPEECH_PROVIDER,
  type SpeechToTextProvider,
  type TextToSpeechProvider,
} from './providers/speech.provider';
import { VOICE_CONSENT_VERSION, type SpeechLanguage } from './providers/speech.provider';
const ALLOWED_ACTIONS = Object.freeze(Object.values(AssistantAction));
/* TypeORM raw query results are constrained by the explicit projections in this service. */
/* eslint-disable @typescript-eslint/no-unsafe-assignment, @typescript-eslint/no-unsafe-member-access */
interface Outcome {
  answer: string;
  citations: string[];
  proposals: ActionProposal[];
  grounding: 'GROUNDED' | 'ABSTAINED' | 'ACCOUNT_DATA';
  provider?: AssistantProviderResult;
  /** Set only for answers built from the farmer's own account data. */
  accountSources?: AccountSource[];
}
interface Conversation {
  id: string;
  userId: string;
  farmId: string | null;
  fieldId: string | null;
}
@Injectable()
export class AssistantService {
  constructor(
    @InjectDataSource() private readonly db: DataSource,
    @Inject(AGRICULTURE_ASSISTANT_PROVIDER)
    private readonly assistant: AgricultureAssistantProvider,
    @Inject(SPEECH_TO_TEXT_PROVIDER) private readonly stt: SpeechToTextProvider,
    @Inject(TEXT_TO_SPEECH_PROVIDER) private readonly tts: TextToSpeechProvider,
    private readonly media: MediaService,
    private readonly metrics: MetricsService = new MetricsService(),
    retrieval?: KnowledgeRetrievalService,
    private readonly config?: ConfigService,
    private readonly personal?: PersonalContextService,
  ) {
    this.retrieval = retrieval ?? new KnowledgeRetrievalService(db);
  }
  private readonly retrieval: KnowledgeRetrievalService;
  async create(userId: string, d: CreateConversationDto): Promise<unknown> {
    await this.assertSelection(userId, d.farmId, d.fieldId);
    const r = await this.db.query<Array<Record<string, unknown>>>(
      `INSERT INTO assistant_conversations(user_id,farm_id,field_id,title,status)VALUES($1,$2,$3,$4,'ACTIVE')RETURNING id,farm_id "farmId",field_id "fieldId",title,status,updated_at "updatedAt"`,
      [userId, d.farmId ?? null, d.fieldId ?? null, d.title ?? 'Agriculture assistant'],
    );
    return r[0]!;
  }
  list(userId: string): Promise<unknown[]> {
    return this.db.query(
      `SELECT id,farm_id "farmId",field_id "fieldId",title,status,updated_at "updatedAt" FROM assistant_conversations WHERE user_id=$1 ORDER BY updated_at DESC LIMIT 50`,
      [userId],
    );
  }
  async get(userId: string, id: string): Promise<unknown> {
    await this.conversation(userId, id);
    const rows = await this.db.query<Array<Record<string, unknown>>>(
      `SELECT id,role,content,language,grounding,citations,media_asset_id "mediaAssetId",proposals,provider,model_id "modelId",model_version "modelVersion",created_at "createdAt" FROM assistant_messages WHERE conversation_id=$1 ORDER BY created_at,(role='ASSISTANT')`,
      [id],
    );
    return rows.map((r) => this.present(r));
  }
  async message(userId: string, id: string, d: SendAssistantMessageDto): Promise<unknown> {
    const c = await this.conversation(userId, id);
    if (d.idempotencyKey) {
      const existing = await this.replay(id, d.idempotencyKey);
      if (existing) return existing;
    }
    let language = await this.language(userId, d.language);
    // Personal context: questions about the farmer's own farms, fields, crop seasons, confirmed
    // expenses and unread notifications are answered from owner-scoped queries, with no model.
    const detection = this.personal ? detectPersonalIntent(d.message) : null;
    const external = this.assistant.external === true;
    let account: PersonalAnswer | null = null;
    if (this.personal && detection && (detection.mode === 'direct' || !external)) {
      language = scriptLanguage(d.message) ?? language;
      account =
        detection.mode === 'direct'
          ? await this.personal.answer(userId, detection.intent, language)
          : await this.personal.factsWithNote(userId, detection.entities, language);
    }
    const sources = account
      ? []
      : await this.retrieval.retrieve(
          d.message,
          language,
          this.config?.get<number>('assistantRetrievalLimit', 4) ?? 4,
        );
    let outcome: Outcome;
    if (account) {
      outcome = {
        answer: account.content,
        citations: [],
        proposals: [],
        grounding: 'ACCOUNT_DATA',
        accountSources: account.sources,
      };
    } else if (!sources.length) {
      // Nothing approved to answer from: do not call a model, and never improvise an answer.
      outcome = {
        answer: ABSTENTION[language],
        citations: [],
        proposals: [],
        grounding: 'ABSTAINED',
      };
    } else {
      const context = await this.context(c);
      if (this.personal && external) {
        // Mixed advice question on a real model: names and titles only, never finance or identifiers.
        context.farmer_account_context = await this.personal.redactedContext(userId);
      }
      // Account-data answers (names, amounts, titles) are never replayed to a model: drop each one
      // together with the question that triggered it.
      const recent = await this.db.query<
        Array<{ role: string; content: string; grounding: string | null }>
      >(
        `SELECT lower(role) role,content,grounding FROM assistant_messages WHERE conversation_id=$1 ORDER BY created_at DESC,(role='ASSISTANT') DESC LIMIT $2`,
        [id, this.config?.get<number>('assistantMaxContextMessages', 10) ?? 10],
      );
      const history: Array<{ role: string; content: string }> = [];
      let dropNextUser = false;
      for (const m of recent) {
        if (m.grounding === 'ACCOUNT_DATA') {
          dropNextUser = true;
          continue;
        }
        if (dropNextUser && m.role === 'user') {
          dropNextUser = false;
          continue;
        }
        dropNextUser = false;
        history.push({ role: m.role, content: m.content });
      }
      const result = await this.callProvider({
        message: d.message,
        language,
        context,
        sources,
        history: history.reverse(),
        allowedActions: ALLOWED_ACTIONS,
      });
      this.metrics.observe('fasalguard_provider_latency_seconds', result.latencyMs / 1000, {
        provider: result.provider,
        operation: 'assistant',
      });
      this.metrics.increment(
        'fasalguard_qwen_tokens_total',
        { direction: 'input' },
        result.inputTokens ?? 0,
      );
      this.metrics.increment(
        'fasalguard_qwen_tokens_total',
        { direction: 'output' },
        result.outputTokens ?? 0,
      );
      outcome = citationsAreGrounded(result.citations, sources)
        ? {
            answer: result.answer,
            citations: result.citations,
            proposals: result.proposals,
            grounding: 'GROUNDED',
            provider: result,
          }
        : // Missing or forged citations: discard the model text rather than show an unsupported answer.
          {
            answer: ABSTENTION[language],
            citations: [],
            proposals: [],
            grounding: 'ABSTAINED',
            provider: result,
          };
    }
    const cited: unknown[] = outcome.accountSources
      ? outcome.accountSources
      : outcome.citations.map((sid) => {
          const source = sources.find((x) => x.id === sid)!;
          return { id: source.id, title: source.title, revision: source.revision };
        });
    const q = this.db.createQueryRunner();
    await q.connect();
    await q.startTransaction();
    try {
      await q.query(
        `INSERT INTO assistant_messages(conversation_id,role,content,language)VALUES($1,$2,$3,$4)`,
        [id, AssistantRole.User, d.message, language],
      );
      const rows = (await q.query(
        `INSERT INTO assistant_messages(conversation_id,role,content,proposals,provider,model_id,model_version,prompt_version,input_tokens,output_tokens,latency_ms,language,citations,grounding,idempotency_key)VALUES($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14,$15)RETURNING id`,
        [
          id,
          AssistantRole.Assistant,
          outcome.answer,
          JSON.stringify(outcome.proposals),
          outcome.provider?.provider ?? null,
          outcome.provider?.modelId ?? null,
          outcome.provider?.modelVersion ?? null,
          ASSISTANT_PROMPT_VERSION,
          outcome.provider?.inputTokens ?? null,
          outcome.provider?.outputTokens ?? null,
          outcome.provider?.latencyMs ?? null,
          language,
          JSON.stringify(cited),
          outcome.grounding,
          d.idempotencyKey ?? null,
        ],
      )) as Array<{ id: string }>;
      await q.query(
        `UPDATE assistant_conversations SET updated_at=now(),version=version+1 WHERE id=$1`,
        [id],
      );
      await q.commitTransaction();
      return {
        id: rows[0]!.id,
        role: AssistantRole.Assistant,
        content: outcome.answer,
        language,
        grounding: outcome.grounding,
        citations: outcome.accountSources ? [] : cited,
        ...(outcome.accountSources ? { sources: outcome.accountSources } : {}),
        proposals: outcome.proposals,
        requiresExplicitConfirmation: true,
      };
    } catch (e) {
      await q.rollbackTransaction();
      if ((e as { code?: string }).code === '23505' && d.idempotencyKey) {
        // A concurrent identical send won the race; return its stored result.
        const existing = await this.replay(id, d.idempotencyKey);
        if (existing) return existing;
      }
      throw e;
    } finally {
      await q.release();
    }
  }
  private async replay(conversationId: string, key: string): Promise<unknown> {
    const rows = await this.db.query<Array<Record<string, unknown>>>(
      `SELECT id,role,content,language,grounding,citations,proposals FROM assistant_messages WHERE conversation_id=$1 AND idempotency_key=$2 AND role='ASSISTANT'`,
      [conversationId, key],
    );
    const r = rows[0];
    return r ? { ...this.present(r), requiresExplicitConfirmation: true } : null;
  }
  /** Account-data rows keep their {type,label} sources in `citations`; expose them as `sources`. */
  private present(row: Record<string, unknown>): Record<string, unknown> {
    return row.grounding === 'ACCOUNT_DATA'
      ? { ...row, citations: [], sources: row.citations }
      : row;
  }
  /** Owner-scoped unread-warning digest for the proactive card; read-only. */
  briefing(userId: string): Promise<unknown> {
    if (!this.personal) throw new ServiceUnavailableException('Account briefing is unavailable.');
    return this.personal.briefing(userId);
  }
  /** Explicit request language, else the farmer's saved preference, else English. */
  private async language(userId: string, requested?: string): Promise<AssistantLanguage> {
    if (requested && (ASSISTANT_LANGUAGES as readonly string[]).includes(requested))
      return requested as AssistantLanguage;
    const rows = await this.db.query<Array<{ lang: string }>>(
      `SELECT preferred_language lang FROM farmer_profiles WHERE user_id=$1`,
      [userId],
    );
    const saved = rows[0]?.lang;
    return saved && (ASSISTANT_LANGUAGES as readonly string[]).includes(saved)
      ? (saved as AssistantLanguage)
      : 'en';
  }
  private async callProvider(
    input: Parameters<AgricultureAssistantProvider['respond']>[0],
  ): Promise<AssistantProviderResult> {
    const started = process.hrtime.bigint();
    try {
      return await this.assistant.respond(input);
    } catch (error) {
      this.metrics.observe(
        'fasalguard_provider_latency_seconds',
        Number(process.hrtime.bigint() - started) / 1e9,
        { provider: 'assistant', operation: 'assistant' },
      );
      this.metrics.increment('fasalguard_external_api_failures_total', {
        provider: 'assistant',
        operation: 'assistant',
      });
      throw error;
    }
  }
  async transcribe(userId: string, d: TranscribeVoiceDto): Promise<unknown> {
    const assets = await this.db.query<
      Array<{ purpose: string; contentType: string; sizeBytes: string; status: string }>
    >(
      `SELECT purpose,content_type "contentType",size_bytes "sizeBytes",status FROM media_assets WHERE id=$1 AND owner_id=$2`,
      [d.mediaAssetId, userId],
    );
    const asset = assets[0];
    if (!asset)
      throw new NotFoundException({ code: 'MEDIA_NOT_FOUND', message: 'Media was not found.' });
    if (
      asset.status !== 'ready' ||
      asset.purpose !== 'voice-note' ||
      !asset.contentType.startsWith('audio/')
    )
      throw new BadRequestException({
        code: 'INVALID_VOICE_MEDIA',
        message: 'A completed voice-note audio upload is required.',
      });
    if (Number(asset.sizeBytes) > 25 * 1024 * 1024)
      throw new BadRequestException({
        code: 'VOICE_MEDIA_TOO_LARGE',
        message: 'Voice recording exceeds the supported limit.',
      });
    if (!this.stt.capabilities().sttLanguages.includes(d.language as SpeechLanguage))
      throw new ServiceUnavailableException({
        code: 'SPEECH_LANGUAGE_UNAVAILABLE',
        message: 'Transcription is unavailable for this language.',
      });
    await this.assertVoiceConsent(userId, d.consentVersion);
    const access = await this.media.accessUrl(userId, d.mediaAssetId);
    const result = await this.stt.transcribe({
      audioUrl: access.url,
      language: d.language as SpeechLanguage,
    });
    return {
      transcript: result.text,
      provider: result.provider,
      modelId: result.modelId,
      modelVersion: result.modelVersion,
      usage: result.usage ?? {},
    };
  }
  async synthesize(userId: string, d: SynthesizeSpeechDto): Promise<unknown> {
    await this.assertVoiceConsent(userId, d.consentVersion);
    if (!this.tts.capabilities().ttsLanguages.includes(d.language as SpeechLanguage))
      throw new ServiceUnavailableException({
        code: 'SPEECH_LANGUAGE_UNAVAILABLE',
        message: 'Speech playback is unavailable for this language.',
      });
    return this.tts.synthesize({ text: d.text, language: d.language as SpeechLanguage });
  }
  /** Recording comes from the speech-to-text provider, playback from the text-to-speech provider. */
  async speechCapabilities(userId: string): Promise<unknown> {
    const stt = this.stt.capabilities();
    const tts = this.tts.capabilities();
    return {
      ...stt,
      /** Server-side state of the caller's current-version consent, so the UI can show it after a reload. */
      consentGranted: await this.hasVoiceConsent(userId, VOICE_CONSENT_VERSION),
      ttsLanguages: tts.ttsLanguages,
      provider: stt.provider === tts.provider ? stt.provider : `${stt.provider}+${tts.provider}`,
    };
  }
  async setVoiceConsent(
    userId: string,
    d: VoiceConsentDto,
  ): Promise<{ granted: boolean; consentVersion: string }> {
    if (d.consentVersion !== VOICE_CONSENT_VERSION)
      throw new ForbiddenException('Current voice processing consent is required.');
    // Idempotent: a repeat of the current state reuses the active row (grant) or adds nothing (revoke).
    // The per-user advisory lock makes concurrent identical requests collapse into one row.
    await this.db.transaction(async (m) => {
      await m.query(`SELECT pg_advisory_xact_lock(hashtext($1))`, [
        `voice-consent:${userId}:${d.consentVersion}`,
      ]);
      const rows = await m.query<Array<{ granted: boolean; revokedAt: Date | null }>>(
        `SELECT granted,revoked_at "revokedAt" FROM consents WHERE user_id=$1 AND type='VOICE_PROCESSING' AND policy_version=$2 ORDER BY recorded_at DESC,created_at DESC LIMIT 1`,
        [userId, d.consentVersion],
      );
      const active = rows[0]?.granted === true && rows[0].revokedAt === null;
      if (active === d.granted) return;
      await m.query(
        `INSERT INTO consents(user_id,type,policy_version,granted,recorded_at,revoked_at) VALUES($1,'VOICE_PROCESSING',$2,$3,now(),CASE WHEN $3 THEN NULL ELSE now() END)`,
        [userId, d.consentVersion, d.granted],
      );
    });
    return { granted: d.granted, consentVersion: d.consentVersion };
  }
  private async hasVoiceConsent(userId: string, version: string): Promise<boolean> {
    const rows = await this.db.query<Array<{ granted: boolean; revokedAt: Date | null }>>(
      `SELECT granted,revoked_at "revokedAt" FROM consents WHERE user_id=$1 AND type='VOICE_PROCESSING' AND policy_version=$2 ORDER BY recorded_at DESC,created_at DESC LIMIT 1`,
      [userId, version],
    );
    return rows[0]?.granted === true && rows[0].revokedAt === null;
  }
  private async assertVoiceConsent(userId: string, version: string): Promise<void> {
    if (!(await this.hasVoiceConsent(userId, version)))
      throw new ForbiddenException('Current voice processing consent is required.');
  }
  private async conversation(userId: string, id: string): Promise<Conversation> {
    const r = await this.db.query<Conversation[]>(
      `SELECT id,user_id "userId",farm_id "farmId",field_id "fieldId" FROM assistant_conversations WHERE id=$1 AND user_id=$2`,
      [id, userId],
    );
    if (!r[0]) throw new NotFoundException('Assistant conversation was not found.');
    return r[0];
  }
  private async assertSelection(userId: string, farmId?: string, fieldId?: string): Promise<void> {
    if (fieldId && !farmId) throw new BadRequestException('A selected field requires its farm.');
    if (!farmId) return;
    const r = await this.db.query(
      `SELECT 1 FROM farms fa JOIN farmer_profiles fp ON fp.id=fa.farmer_id LEFT JOIN fields fi ON fi.farm_id=fa.id AND fi.id=$3 AND fi.deleted_at IS NULL WHERE fa.id=$1 AND fp.user_id=$2 AND fa.deleted_at IS NULL AND ($3::uuid IS NULL OR fi.id IS NOT NULL)`,
      [farmId, userId, fieldId ?? null],
    );
    if (!r.length) throw new NotFoundException('Selected farm or field was not found.');
  }
  private async context(c: Conversation): Promise<Record<string, unknown>> {
    const selected =
      (
        await this.db.query<Array<Record<string, unknown>>>(
          `SELECT fa.id "farmId",fa.name "farmName",fi.id "fieldId",fi.name "fieldName",cr.name crop,cc.growth_stage "growthStage" FROM farms fa LEFT JOIN fields fi ON fi.id=$2 AND fi.farm_id=fa.id LEFT JOIN LATERAL(SELECT * FROM crop_cycles x WHERE x.field_id=fi.id AND x.status='active' AND x.deleted_at IS NULL ORDER BY x.created_at DESC LIMIT 1)cc ON true LEFT JOIN crops cr ON cr.id=cc.crop_id WHERE fa.id=$1`,
          [c.farmId, c.fieldId],
        )
      )[0] ?? null;
    if (!c.fieldId) return { selection: selected };
    const [satellite, weather, scan, tasks, outbreaks] = await Promise.all([
      this.db.query(
        `SELECT processing_status "status",data_quality "dataQuality",acquisition_date "acquisitionDate" FROM satellite_captures WHERE field_id=$1 ORDER BY acquisition_date DESC LIMIT 1`,
        [c.fieldId],
      ),
      this.db.query(
        `SELECT overall_suitability "suitability",risks,assessed_at "assessedAt" FROM weather_risk_assessments WHERE field_id=$1 ORDER BY assessed_at DESC LIMIT 1`,
        [c.fieldId],
      ),
      this.db.query(
        `SELECT cs.status,d.screened_condition "screenedCondition",d.confidence,cs.created_at "createdAt" FROM crop_scans cs LEFT JOIN diagnoses d ON d.scan_id=cs.id WHERE cs.field_id=$1 AND cs.owner_id=$2 ORDER BY cs.created_at DESC LIMIT 1`,
        [c.fieldId, c.userId],
      ),
      this.db.query(
        `SELECT id,title,status,due_at "dueAt" FROM farmer_tasks WHERE user_id=$1 AND (field_id=$2 OR field_id IS NULL)AND deleted_at IS NULL AND status='PENDING' ORDER BY due_at NULLS LAST LIMIT 20`,
        [c.userId, c.fieldId],
      ),
      this.db.query(
        `SELECT oc.id,oc.status,cr.name crop,oc.condition_family "conditionFamily",round(ST_Distance(oc.private_centroid::geography,(SELECT centroid::geography FROM fields WHERE id=$1))/5000)*5 "approximateDistanceKm" FROM outbreak_clusters oc JOIN crops cr ON cr.id=oc.crop_id WHERE oc.status IN('MONITORING','SUSPECTED','EXPERT_REVIEW','CONFIRMED') AND ST_DWithin(oc.private_centroid::geography,(SELECT centroid::geography FROM fields WHERE id=$1),25000) ORDER BY oc.updated_at DESC LIMIT 10`,
        [c.fieldId],
      ),
    ]);
    return {
      selection: selected,
      latestSatellite: satellite[0] ?? null,
      latestWeather: weather[0] ?? null,
      latestCropScan: scan[0] ?? null,
      tasks,
      nearbySanitizedOutbreaks: outbreaks,
      privacyNotice: 'Exact coordinates and boundaries are excluded.',
    };
  }
}

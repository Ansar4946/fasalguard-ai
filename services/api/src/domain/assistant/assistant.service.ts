import { BadRequestException, Inject, Injectable, NotFoundException } from '@nestjs/common';
import { InjectDataSource } from '@nestjs/typeorm';
import { DataSource } from 'typeorm';
import { MediaService } from '../media/media.service';
import {
  CreateConversationDto,
  SendAssistantMessageDto,
  SynthesizeSpeechDto,
  TranscribeVoiceDto,
} from './dto/assistant.dto';
import { AssistantAction, AssistantRole } from './assistant.enums';
import { MetricsService } from '../../observability/metrics.service';
import {
  AGRICULTURE_ASSISTANT_PROVIDER,
  type AgricultureAssistantProvider,
} from './providers/agriculture-assistant.provider';
import {
  SPEECH_TO_TEXT_PROVIDER,
  TEXT_TO_SPEECH_PROVIDER,
  type SpeechToTextProvider,
  type TextToSpeechProvider,
} from './providers/speech.provider';
const ALLOWED_ACTIONS = Object.freeze(Object.values(AssistantAction));
/* TypeORM raw query results are constrained by the explicit projections in this service. */
/* eslint-disable @typescript-eslint/no-unsafe-assignment, @typescript-eslint/no-unsafe-member-access */
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
  ) {}
  async create(userId: string, d: CreateConversationDto): Promise<unknown> {
    await this.assertSelection(userId, d.farmId, d.fieldId);
    const r = await this.db.query<Array<{ id: string }>>(
      `INSERT INTO assistant_conversations(user_id,farm_id,field_id,title,status)VALUES($1,$2,$3,$4,'ACTIVE')RETURNING id`,
      [userId, d.farmId ?? null, d.fieldId ?? null, d.title ?? 'Agriculture assistant'],
    );
    return this.get(userId, r[0]!.id);
  }
  list(userId: string): Promise<unknown[]> {
    return this.db.query(
      `SELECT id,farm_id "farmId",field_id "fieldId",title,status,updated_at "updatedAt" FROM assistant_conversations WHERE user_id=$1 ORDER BY updated_at DESC LIMIT 50`,
      [userId],
    );
  }
  async get(userId: string, id: string): Promise<unknown> {
    await this.conversation(userId, id);
    return this.db.query(
      `SELECT id,role,content,media_asset_id "mediaAssetId",proposals,provider,model_id "modelId",model_version "modelVersion",created_at "createdAt" FROM assistant_messages WHERE conversation_id=$1 ORDER BY created_at`,
      [id],
    );
  }
  async message(userId: string, id: string, d: SendAssistantMessageDto): Promise<unknown> {
    const c = await this.conversation(userId, id);
    const context = await this.context(c);
    const history = await this.db.query<Array<{ role: string; content: string }>>(
      `SELECT lower(role) role,content FROM assistant_messages WHERE conversation_id=$1 ORDER BY created_at DESC LIMIT 10`,
      [id],
    );
    const providerStarted = process.hrtime.bigint();
    let result: Awaited<ReturnType<AgricultureAssistantProvider['respond']>>;
    try {
      result = await this.assistant.respond({
        message: d.message,
        context,
        history: history.reverse(),
        allowedActions: ALLOWED_ACTIONS,
      });
    } catch (error) {
      this.metrics.observe(
        'fasalguard_provider_latency_seconds',
        Number(process.hrtime.bigint() - providerStarted) / 1e9,
        { provider: 'qwen', operation: 'assistant' },
      );
      this.metrics.increment('fasalguard_external_api_failures_total', {
        provider: 'qwen',
        operation: 'assistant',
      });
      throw error;
    }
    this.metrics.observe('fasalguard_provider_latency_seconds', result.latencyMs / 1000, {
      provider: 'qwen',
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
    const q = this.db.createQueryRunner();
    await q.connect();
    await q.startTransaction();
    try {
      await q.query(
        `INSERT INTO assistant_messages(conversation_id,role,content)VALUES($1,$2,$3)`,
        [id, AssistantRole.User, d.message],
      );
      const rows = (await q.query(
        `INSERT INTO assistant_messages(conversation_id,role,content,proposals,provider,model_id,model_version,prompt_version,input_tokens,output_tokens,latency_ms)VALUES($1,$2,$3,$4,$5,$6,$7,'ASSISTANT_V1',$8,$9,$10)RETURNING id`,
        [
          id,
          AssistantRole.Assistant,
          result.answer,
          JSON.stringify(result.proposals),
          result.provider,
          result.modelId,
          result.modelVersion,
          result.inputTokens,
          result.outputTokens,
          result.latencyMs,
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
        content: result.answer,
        proposals: result.proposals,
        requiresExplicitConfirmation: true,
      };
    } catch (e) {
      await q.rollbackTransaction();
      throw e;
    } finally {
      await q.release();
    }
  }
  async transcribe(userId: string, d: TranscribeVoiceDto): Promise<unknown> {
    const access = await this.media.accessUrl(userId, d.mediaAssetId);
    const result = await this.stt.transcribe({ audioUrl: access.url, language: d.language });
    return {
      transcript: result.text,
      provider: result.provider,
      modelId: result.modelId,
      modelVersion: result.modelVersion,
      usage: result.usage ?? {},
    };
  }
  synthesize(d: SynthesizeSpeechDto): Promise<unknown> {
    return this.tts.synthesize({ text: d.text, language: d.language });
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

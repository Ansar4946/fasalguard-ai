import { BadRequestException, Inject, Injectable, NotFoundException } from '@nestjs/common';
import { InjectDataSource } from '@nestjs/typeorm';
import { DataSource } from 'typeorm';
import { AIOperation, AIRunStatus } from '../ai-ops/ai-run.enums';
import { AIRunLogger } from '../ai-ops/ai-run-logger.service';
import { CropScanStatus } from '../crop-scans/crop-scan.enums';
import type { ExplainDto, SubmitAnswersDto } from './dto/follow-up.dto';
import { LLM_PROVIDER, type LlmProvider, type LlmResult } from './providers/llm.provider';
import { PROMPT_VERSION } from './prompts';
import { ALLOWED_QUESTION_LIBRARY } from './question-library';
interface ScanContext {
  id: string;
  status: CropScanStatus;
  screenedCondition: string | null;
  confidence: number | null;
  fieldId: string | null;
  cropName: string | null;
  growthStage: string | null;
}
@Injectable()
export class FollowUpService {
  constructor(
    @InjectDataSource() private readonly db: DataSource,
    @Inject(LLM_PROVIDER) private readonly llm: LlmProvider,
    private readonly aiRunLogger: AIRunLogger,
  ) {}
  async generate(userId: string, scanId: string): Promise<unknown> {
    const scan = await this.scan(userId, scanId);
    if (!scan.screenedCondition)
      throw new BadRequestException({
        code: 'VISION_RESULT_REQUIRED',
        message: 'Vision screening must complete before follow-up questions.',
      });
    const context = {
      crop: scan.cropName,
      suspectedConditionCategory: scan.screenedCondition,
      imageFindings: { confidence: scan.confidence },
      cropStage: scan.growthStage,
      recentWeather: null,
      satelliteAnomaly: null,
    };
    const startedAt = new Date();
    const result = await this.llm.selectQuestions({
      context,
      allowedQuestions: ALLOWED_QUESTION_LIBRARY,
    });
    await this.audit(userId, scanId, 'QUESTION_SELECTION', context, result, startedAt);
    for (const [key, index] of result.output.questionIds.map((x, i) => [x, i] as const)) {
      const item = ALLOWED_QUESTION_LIBRARY.find((x) => x.key === key)!;
      await this.db.query(
        `INSERT INTO follow_up_questions(scan_id,library_key,question_text,display_order,context,prompt_version) VALUES($1,$2,$3,$4,$5,$6) ON CONFLICT(scan_id,library_key) DO UPDATE SET display_order=excluded.display_order,updated_at=now()`,
        [scanId, key, item.text, index + 1, JSON.stringify(context), PROMPT_VERSION],
      );
    }
    await this.db.query(
      `UPDATE crop_scans SET status=$2,updated_at=now(),version=version+1 WHERE id=$1`,
      [scanId, CropScanStatus.NeedsFollowUp],
    );
    return this.questions(userId, scanId);
  }
  async questions(userId: string, scanId: string): Promise<unknown> {
    await this.scan(userId, scanId);
    return this.db.query(
      `SELECT q.id,q.library_key AS "libraryKey",q.question_text AS question,q.display_order AS "displayOrder",a.answer_text AS answer FROM follow_up_questions q LEFT JOIN follow_up_answers a ON a.question_id=q.id WHERE q.scan_id=$1 ORDER BY q.display_order`,
      [scanId],
    );
  }
  async answer(userId: string, scanId: string, dto: SubmitAnswersDto): Promise<unknown> {
    await this.scan(userId, scanId);
    if (!dto.answers.length || dto.answers.length > 8)
      throw new BadRequestException('Between one and eight answers are required.');
    for (const a of dto.answers) {
      const allowed = await this.db.query<Array<{ exists: number }>>(
        `SELECT 1 FROM follow_up_questions WHERE id=$1 AND scan_id=$2`,
        [a.questionId, scanId],
      );
      if (!allowed.length)
        throw new BadRequestException({
          code: 'QUESTION_NOT_IN_SCAN',
          message: 'Answer references a question outside this scan.',
        });
      await this.db.query(
        `INSERT INTO follow_up_answers(question_id,farmer_id,answer_text,answered_at) VALUES($1,$2,$3,now()) ON CONFLICT(question_id) DO UPDATE SET answer_text=excluded.answer_text,answered_at=now(),updated_at=now(),version=follow_up_answers.version+1`,
        [a.questionId, userId, a.answer.trim()],
      );
    }
    const answers = await this.answerRows(scanId);
    const summaryStartedAt = new Date();
    const summary = await this.llm.summarizeAnswers({ answers });
    await this.audit(
      userId,
      scanId,
      'ANSWER_SUMMARY',
      { farmer_data: { answers } },
      summary,
      summaryStartedAt,
    );
    return { answers, summary: summary.output, promptVersion: PROMPT_VERSION };
  }
  async explain(userId: string, scanId: string, dto: ExplainDto): Promise<unknown> {
    const scan = await this.scan(userId, scanId);
    if (!scan.screenedCondition)
      throw new BadRequestException('Vision screening result is required.');
    const answers = await this.answerRows(scanId);
    const summary = answers.length
      ? (await this.llm.summarizeAnswers({ answers })).output
      : undefined;
    const visionResult = {
      screenedCondition: scan.screenedCondition,
      confidence: scan.confidence,
      isConfirmed: false,
    };
    const explainStartedAt = new Date();
    const result = await this.llm.explainResult({
      visionResult,
      answerSummary: summary,
      context: { crop: scan.cropName, cropStage: scan.growthStage },
    });
    await this.audit(
      userId,
      scanId,
      'RESULT_EXPLANATION',
      { visionResult, farmer_data: { summary }, language: dto.language },
      result,
      explainStartedAt,
    );
    if (dto.language.toLowerCase() !== 'english') {
      const approvedText = JSON.stringify(result.output);
      const translateStartedAt = new Date();
      const translated = await this.llm.translateApprovedInformation({
        approvedText,
        targetLanguage: dto.language,
      });
      await this.audit(
        userId,
        scanId,
        'APPROVED_TRANSLATION',
        { approvedText, targetLanguage: dto.language },
        translated,
        translateStartedAt,
      );
      return {
        ...result.output,
        translation: translated.output.translation,
        language: dto.language,
        promptVersion: PROMPT_VERSION,
      };
    }
    return { ...result.output, language: 'English', promptVersion: PROMPT_VERSION };
  }
  private async scan(userId: string, id: string): Promise<ScanContext> {
    const rows = await this.db.query<ScanContext[]>(
      `SELECT cs.id,cs.status,cs.field_id AS "fieldId",d.screened_condition AS "screenedCondition",d.confidence,c.name AS "cropName",cc.growth_stage AS "growthStage" FROM crop_scans cs LEFT JOIN diagnoses d ON d.scan_id=cs.id LEFT JOIN fields fi ON fi.id=cs.field_id LEFT JOIN LATERAL(SELECT * FROM crop_cycles x WHERE x.field_id=fi.id AND x.status='active' AND x.deleted_at IS NULL ORDER BY x.created_at DESC LIMIT 1)cc ON true LEFT JOIN crops c ON c.id=cc.crop_id WHERE cs.id=$1 AND cs.owner_id=$2`,
      [id, userId],
    );
    if (!rows[0]) throw new NotFoundException('Crop scan was not found.');
    return rows[0];
  }
  private answerRows(scanId: string): Promise<Array<{ question: string; answer: string }>> {
    return this.db.query(
      `SELECT q.question_text AS question,a.answer_text AS answer FROM follow_up_answers a JOIN follow_up_questions q ON q.id=a.question_id WHERE q.scan_id=$1 ORDER BY q.display_order`,
      [scanId],
    );
  }
  private async audit<T>(
    userId: string,
    scanId: string,
    purpose: string,
    input: unknown,
    result: LlmResult<T>,
    startedAt: Date,
  ): Promise<void> {
    await this.db.query(
      `INSERT INTO ai_interactions(scan_id,user_id,purpose,provider,model_id,model_version,prompt_version,input_data,output_data,raw_provider_response,status) VALUES($1,$2,$3,'ALIBABA_QWEN',$4,$5,$6,$7,$8,$9,'COMPLETED')`,
      [
        scanId,
        userId,
        purpose,
        result.modelId,
        result.modelVersion,
        PROMPT_VERSION,
        JSON.stringify(input),
        JSON.stringify(result.output),
        JSON.stringify(result.rawProviderResponse),
      ],
    );
    // Best-effort cross-cutting summary for the judge-facing evidence ledger. The detailed
    // raw prompt/response stays only in ai_interactions above; this row is structured-only.
    const farmRow: Array<{ farmId: string | null }> = await this.db.query(
      `SELECT f.id "farmId" FROM crop_scans cs LEFT JOIN fields fi ON fi.id=cs.field_id LEFT JOIN farms f ON f.id=fi.farm_id WHERE cs.id=$1`,
      [scanId],
    );
    await this.aiRunLogger.record({
      userId,
      farmId: farmRow[0]?.farmId ?? null,
      operation: AIOperation.FollowUpAnalysis,
      provider: 'ALIBABA_QWEN',
      model: result.modelId,
      status: AIRunStatus.Completed,
      startedAt,
      completedAt: new Date(),
      inputType: purpose,
      outputSchemaVersion: PROMPT_VERSION,
      sourceTable: 'ai_interactions',
      sourceId: null,
    });
  }
}

import { Injectable } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { InjectDataSource } from '@nestjs/typeorm';
import { randomUUID } from 'node:crypto';
import { DataSource } from 'typeorm';
import type { AIRunToolCall } from './ai-run.entity';
import { AIOperation, AIRunStatus, HumanReviewStatus } from './ai-run.enums';

export interface RecordAIRunInput {
  userId?: string | null;
  farmId?: string | null;
  cropSeasonId?: string | null;
  incidentId?: string | null;
  operation: AIOperation;
  provider: string;
  model: string;
  status: AIRunStatus;
  startedAt: Date;
  completedAt?: Date | null;
  inputType?: string | null;
  evidenceIds?: string[];
  toolCalls?: AIRunToolCall[];
  confidence?: number | null;
  outputSchemaVersion?: string | null;
  inputTokens?: number | null;
  outputTokens?: number | null;
  errorCode?: string | null;
  humanReviewStatus?: HumanReviewStatus;
  sourceTable?: string | null;
  sourceId?: string | null;
}

/**
 * The single write path for the cross-cutting `ai_runs` evidence ledger. Every call site
 * (Farm Brain/Gemini, crop-scan vision, follow-up/Qwen) writes exactly one summary row
 * here once its own operation reaches a terminal state — never raw prompts/responses,
 * never chain-of-thought, only already-validated structured fields. Best-effort: a
 * logging failure must never break the real product action that triggered it.
 */
@Injectable()
export class AIRunLogger {
  constructor(
    @InjectDataSource() private readonly db: DataSource,
    private readonly config: ConfigService,
  ) {}

  async record(input: RecordAIRunInput): Promise<void> {
    try {
      const completedAt = input.completedAt ?? null;
      const latencyMs = completedAt ? completedAt.getTime() - input.startedAt.getTime() : null;
      const toolCalls = input.toolCalls ?? [];
      const incidentCreated = toolCalls.some(
        (call) => call.name === 'createIncident' && call.status === 'EXECUTED',
      );
      const { estimatedCost, costCurrency } = this.estimateCost(
        input.provider,
        input.inputTokens,
        input.outputTokens,
      );
      await this.db.query(
        `INSERT INTO ai_runs(
          id,user_id,farm_id,crop_season_id,incident_id,operation,provider,model,status,
          started_at,completed_at,latency_ms,input_type,evidence_ids,tool_calls,tool_call_count,
          incident_created,confidence,output_schema_version,input_tokens,output_tokens,
          estimated_cost,cost_currency,error_code,human_review_status,source_table,source_id
        ) VALUES($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14,$15,$16,$17,$18,$19,$20,$21,$22,$23,$24,$25,$26,$27)`,
        [
          randomUUID(),
          input.userId ?? null,
          input.farmId ?? null,
          input.cropSeasonId ?? null,
          input.incidentId ?? null,
          input.operation,
          input.provider,
          input.model,
          input.status,
          input.startedAt,
          completedAt,
          latencyMs,
          input.inputType ?? null,
          JSON.stringify(input.evidenceIds ?? []),
          JSON.stringify(toolCalls),
          toolCalls.length,
          incidentCreated,
          input.confidence ?? null,
          input.outputSchemaVersion ?? null,
          input.inputTokens ?? null,
          input.outputTokens ?? null,
          estimatedCost,
          costCurrency,
          input.errorCode ?? null,
          input.humanReviewStatus ?? HumanReviewStatus.NotRequired,
          input.sourceTable ?? null,
          input.sourceId ?? null,
        ],
      );
    } catch {
      /* best-effort — never let telemetry logging break the real AI operation */
    }
  }

  /** Cost is only ever estimated when an operator has explicitly configured real,
   * current per-million-token pricing via env vars — never a hardcoded guess. */
  private estimateCost(
    provider: string,
    inputTokens: number | null | undefined,
    outputTokens: number | null | undefined,
  ): { estimatedCost: string | null; costCurrency: string | null } {
    if (provider !== 'GOOGLE_GEMINI' || inputTokens == null || outputTokens == null)
      return { estimatedCost: null, costCurrency: null };
    const inputPrice = this.config.get<number | null>('geminiInputPricePerMillionTokens', null);
    const outputPrice = this.config.get<number | null>('geminiOutputPricePerMillionTokens', null);
    if (inputPrice == null || outputPrice == null)
      return { estimatedCost: null, costCurrency: null };
    const cost = (inputTokens / 1_000_000) * inputPrice + (outputTokens / 1_000_000) * outputPrice;
    return { estimatedCost: cost.toFixed(6), costCurrency: 'USD' };
  }
}

export { AIOperation, AIRunStatus, HumanReviewStatus };

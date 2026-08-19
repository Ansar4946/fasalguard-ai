import { Column, Entity, Index } from 'typeorm';
import { BaseEntity } from '../../infrastructure/database/entities/base.entity';

export interface AIRunToolCall {
  name: string;
  status: string;
}

@Entity({ name: 'ai_runs' })
@Index('idx_ai_runs_user_created', ['userId', 'createdAt'])
@Index('idx_ai_runs_operation_created', ['operation', 'createdAt'])
export class AIRun extends BaseEntity {
  @Column({ name: 'user_id', type: 'uuid', nullable: true }) userId!: string | null;
  @Column({ name: 'farm_id', type: 'uuid', nullable: true }) farmId!: string | null;
  @Column({ name: 'crop_season_id', type: 'uuid', nullable: true }) cropSeasonId!: string | null;
  @Column({ name: 'incident_id', type: 'uuid', nullable: true }) incidentId!: string | null;
  @Column({ type: 'varchar', length: 40 }) operation!: string;
  @Column({ type: 'varchar', length: 40 }) provider!: string;
  @Column({ type: 'varchar', length: 160 }) model!: string;
  @Column({ type: 'varchar', length: 16 }) status!: string;
  @Column({ name: 'started_at', type: 'timestamptz' }) startedAt!: Date;
  @Column({ name: 'completed_at', type: 'timestamptz', nullable: true }) completedAt!: Date | null;
  @Column({ name: 'latency_ms', type: 'integer', nullable: true }) latencyMs!: number | null;
  @Column({ name: 'input_type', type: 'varchar', length: 60, nullable: true })
  inputType!: string | null;
  @Column({ name: 'evidence_ids', type: 'jsonb', default: () => "'[]'::jsonb" })
  evidenceIds!: string[];
  @Column({ name: 'tool_calls', type: 'jsonb', default: () => "'[]'::jsonb" })
  toolCalls!: AIRunToolCall[];
  @Column({ name: 'tool_call_count', type: 'integer', default: 0 }) toolCallCount!: number;
  @Column({ name: 'incident_created', type: 'boolean', default: false }) incidentCreated!: boolean;
  @Column({ type: 'double precision', nullable: true }) confidence!: number | null;
  @Column({ name: 'output_schema_version', type: 'varchar', length: 40, nullable: true })
  outputSchemaVersion!: string | null;
  @Column({ name: 'input_tokens', type: 'integer', nullable: true }) inputTokens!: number | null;
  @Column({ name: 'output_tokens', type: 'integer', nullable: true }) outputTokens!: number | null;
  @Column({ name: 'estimated_cost', type: 'numeric', precision: 12, scale: 6, nullable: true })
  estimatedCost!: string | null;
  @Column({ name: 'cost_currency', type: 'char', length: 3, nullable: true })
  costCurrency!: string | null;
  @Column({ name: 'error_code', type: 'varchar', length: 80, nullable: true })
  errorCode!: string | null;
  @Column({ name: 'human_review_status', type: 'varchar', length: 20, default: 'NOT_REQUIRED' })
  humanReviewStatus!: string;
  @Column({ name: 'source_table', type: 'varchar', length: 40, nullable: true })
  sourceTable!: string | null;
  @Column({ name: 'source_id', type: 'uuid', nullable: true }) sourceId!: string | null;
}

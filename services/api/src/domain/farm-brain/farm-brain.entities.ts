import { Column, Entity, Index } from 'typeorm';
import { BaseEntity } from '../../infrastructure/database/entities/base.entity';
import { FarmBrainRunStatus, FarmBrainToolCallStatus, FarmBrainToolName } from './farm-brain.enums';

@Entity({ name: 'farm_brain_runs' })
@Index('idx_farm_brain_runs_farm_created', ['farmId', 'createdAt'])
@Index('idx_farm_brain_runs_status_created', ['status', 'createdAt'])
export class FarmBrainRun extends BaseEntity {
  @Column({ name: 'user_id', type: 'uuid' }) userId!: string;
  @Column({ name: 'farm_id', type: 'uuid' }) farmId!: string;
  @Column({ name: 'field_id', type: 'uuid', nullable: true }) fieldId!: string | null;
  @Column({ type: 'varchar', length: 24 }) status!: FarmBrainRunStatus;
  @Column({ type: 'varchar', length: 32, default: 'INVESTIGATE' }) operation!: string;
  @Column({ name: 'schema_version', type: 'varchar', length: 40 }) schemaVersion!: string;
  @Column({ name: 'input_hash', type: 'char', length: 64 }) inputHash!: string;
  @Column({ name: 'input_manifest', type: 'jsonb' }) inputManifest!: Record<string, unknown>;
  @Column({ type: 'jsonb', nullable: true }) result!: Record<string, unknown> | null;
  @Column({ type: 'varchar', length: 80, nullable: true }) provider!: string | null;
  @Column({ name: 'model_id', type: 'varchar', length: 120, nullable: true }) modelId!:
    string | null;
  @Column({ name: 'model_version', type: 'varchar', length: 120, nullable: true })
  modelVersion!: string | null;
  @Column({ name: 'input_tokens', type: 'integer', nullable: true }) inputTokens!: number | null;
  @Column({ name: 'output_tokens', type: 'integer', nullable: true }) outputTokens!: number | null;
  @Column({ name: 'latency_ms', type: 'integer', nullable: true }) latencyMs!: number | null;
  @Column({ name: 'error_code', type: 'varchar', length: 80, nullable: true }) errorCode!:
    string | null;
  @Column({ name: 'started_at', type: 'timestamptz', nullable: true }) startedAt!: Date | null;
  @Column({ name: 'completed_at', type: 'timestamptz', nullable: true }) completedAt!: Date | null;
}

@Entity({ name: 'farm_brain_run_evidence' })
@Index('idx_farm_brain_evidence_run', ['runId'])
export class FarmBrainRunEvidence extends BaseEntity {
  @Column({ name: 'run_id', type: 'uuid' }) runId!: string;
  @Column({ name: 'evidence_id', type: 'varchar', length: 255 }) evidenceId!: string;
  @Column({ name: 'evidence_type', type: 'varchar', length: 64 }) evidenceType!: string;
  @Column({ type: 'varchar', length: 80 }) source!: string;
  @Column({ name: 'observed_at', type: 'timestamptz', nullable: true }) observedAt!: Date | null;
  @Column({ name: 'snapshot_hash', type: 'char', length: 64 }) snapshotHash!: string;
}

@Entity({ name: 'farm_brain_tool_calls' })
@Index('idx_farm_brain_tool_calls_run_status', ['runId', 'status'])
export class FarmBrainToolCall extends BaseEntity {
  @Column({ name: 'run_id', type: 'uuid' }) runId!: string;
  @Column({ type: 'varchar', length: 64 }) name!: FarmBrainToolName;
  @Column({ type: 'jsonb', default: () => "'{}'::jsonb" }) arguments!: Record<string, unknown>;
  @Column({ type: 'varchar', length: 32 }) status!: FarmBrainToolCallStatus;
  @Column({ type: 'text' }) reason!: string;
  @Column({ name: 'result_reference', type: 'varchar', length: 255, nullable: true })
  resultReference!: string | null;
  @Column({ name: 'confirmed_by', type: 'uuid', nullable: true }) confirmedBy!: string | null;
  @Column({ name: 'confirmed_at', type: 'timestamptz', nullable: true }) confirmedAt!: Date | null;
  @Column({ name: 'executed_at', type: 'timestamptz', nullable: true }) executedAt!: Date | null;
}

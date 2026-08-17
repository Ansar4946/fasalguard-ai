import { Column, Entity, Index } from 'typeorm';
import { BaseEntity } from '../../infrastructure/database/entities/base.entity';
import { MutationReceiptStatus, SyncMutationType } from './sync.enums';
@Entity({ name: 'mutation_receipts' })
@Index('uq_mutation_receipt_client', ['userId', 'deviceId', 'clientMutationId'], { unique: true })
export class MutationReceipt extends BaseEntity {
  @Column({ name: 'user_id', type: 'uuid' }) userId!: string;
  @Column({ name: 'device_id', type: 'uuid' }) deviceId!: string;
  @Column({ name: 'client_mutation_id', type: 'uuid' }) clientMutationId!: string;
  @Column({ type: 'varchar', length: 32 }) type!: SyncMutationType;
  @Column({ type: 'varchar', length: 16 }) status!: MutationReceiptStatus;
  @Column({ name: 'request_hash', type: 'char', length: 64 }) requestHash!: string;
  @Column({ type: 'jsonb', nullable: true }) result!: Record<string, unknown> | null;
  @Column({ type: 'jsonb', nullable: true }) conflict!: Record<string, unknown> | null;
  @Column({ name: 'error_code', type: 'varchar', length: 80, nullable: true }) errorCode!:
    string | null;
  @Column({ name: 'attempt_count', type: 'integer', default: 1 }) attemptCount!: number;
  @Column({ name: 'applied_at', type: 'timestamptz', nullable: true }) appliedAt!: Date | null;
}
@Entity({ name: 'field_inspections' })
@Index('idx_field_inspections_user_observed', ['userId', 'observedAt'])
export class FieldInspection extends BaseEntity {
  @Column({ name: 'user_id', type: 'uuid' }) userId!: string;
  @Column({ name: 'field_id', type: 'uuid' }) fieldId!: string;
  @Column({ type: 'text' }) notes!: string;
  @Column({ name: 'observed_at', type: 'timestamptz' }) observedAt!: Date;
  @Column({ name: 'media_asset_ids', type: 'uuid', array: true, default: () => "'{}'::uuid[]" })
  mediaAssetIds!: string[];
}
@Entity({ name: 'voice_note_metadata' })
export class VoiceNoteMetadata extends BaseEntity {
  @Column({ name: 'user_id', type: 'uuid' }) userId!: string;
  @Column({ name: 'media_asset_id', type: 'uuid', unique: true }) mediaAssetId!: string;
  @Column({ name: 'duration_seconds', type: 'integer', nullable: true }) durationSeconds!:
    number | null;
  @Column({ type: 'varchar', length: 16, nullable: true }) language!: string | null;
  @Column({ name: 'recorded_at', type: 'timestamptz' }) recordedAt!: Date;
}
@Entity({ name: 'sync_changes' })
@Index('idx_sync_changes_user_cursor', ['userId', 'sequence'])
export class SyncChange {
  @Column({ name: 'sequence', type: 'bigint', primary: true, generated: 'increment' })
  sequence!: string;
  @Column({ name: 'user_id', type: 'uuid' }) userId!: string;
  @Column({ name: 'resource_type', type: 'varchar', length: 40 }) resourceType!: string;
  @Column({ name: 'resource_id', type: 'uuid' }) resourceId!: string;
  @Column({ type: 'varchar', length: 16 }) operation!: string;
  @Column({ type: 'jsonb' }) data!: Record<string, unknown>;
  @Column({ name: 'changed_at', type: 'timestamptz' }) changedAt!: Date;
}

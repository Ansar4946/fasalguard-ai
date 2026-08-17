import { Column, Entity, Index } from 'typeorm';
import { BaseEntity } from '../../infrastructure/database/entities/base.entity';
import { AnalyticsEventType, ReportStatus, ReportType } from './report.enums';
@Entity({ name: 'generated_reports' })
@Index('idx_generated_reports_owner_created', ['ownerId', 'createdAt'])
@Index('uq_generated_reports_dedup', ['ownerId', 'deduplicationKey'], { unique: true })
export class GeneratedReport extends BaseEntity {
  @Column({ name: 'owner_id', type: 'uuid' }) ownerId!: string;
  @Column({ type: 'varchar', length: 32 }) type!: ReportType;
  @Column({ type: 'varchar', length: 16, default: ReportStatus.Queued }) status!: ReportStatus;
  @Column({ name: 'resource_id', type: 'uuid', nullable: true }) resourceId!: string | null;
  @Column({ type: 'jsonb', default: () => "'{}'::jsonb" }) parameters!: Record<string, unknown>;
  @Column({ name: 'object_key', type: 'varchar', length: 512, nullable: true, select: false })
  objectKey!: string | null;
  @Column({ name: 'content_type', type: 'varchar', length: 80, nullable: true }) contentType!:
    string | null;
  @Column({ name: 'size_bytes', type: 'bigint', nullable: true }) sizeBytes!: string | null;
  @Column({ name: 'failure_code', type: 'varchar', length: 80, nullable: true }) failureCode!:
    string | null;
  @Column({ name: 'deduplication_key', type: 'varchar', length: 180 }) deduplicationKey!: string;
  @Column({ name: 'request_hash', type: 'char', length: 64 }) requestHash!: string;
  @Column({ name: 'completed_at', type: 'timestamptz', nullable: true }) completedAt!: Date | null;
}
@Entity({ name: 'analytics_events' })
@Index('idx_analytics_events_type_time', ['eventType', 'occurredAt'])
export class AnalyticsEvent extends BaseEntity {
  @Column({ name: 'event_type', type: 'varchar', length: 40 }) eventType!: AnalyticsEventType;
  @Column({ name: 'actor_id', type: 'uuid', nullable: true, select: false }) actorId!:
    string | null;
  @Column({ name: 'subject_type', type: 'varchar', length: 40 }) subjectType!: string;
  @Column({ name: 'subject_id', type: 'uuid', nullable: true }) subjectId!: string | null;
  @Column({ type: 'jsonb', default: () => "'{}'::jsonb" }) dimensions!: Record<string, unknown>;
  @Column({ name: 'source_key', type: 'varchar', length: 180, unique: true }) sourceKey!: string;
  @Column({ name: 'occurred_at', type: 'timestamptz' }) occurredAt!: Date;
}

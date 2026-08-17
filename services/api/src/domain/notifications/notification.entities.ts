import { Column, Entity, Index } from 'typeorm';
import {
  BaseEntity,
  SoftDeletableEntity,
} from '../../infrastructure/database/entities/base.entity';
import {
  DeliveryStatus,
  NotificationCategory,
  PushPlatform,
  TaskSource,
  TaskStatus,
} from './notification.enums';
@Entity({ name: 'farmer_tasks' })
@Index('idx_farmer_tasks_user_status_due', ['userId', 'status', 'dueAt'])
export class FarmerTask extends SoftDeletableEntity {
  @Column({ name: 'user_id', type: 'uuid' }) userId!: string;
  @Column({ name: 'field_id', type: 'uuid', nullable: true }) fieldId!: string | null;
  @Column({ type: 'varchar', length: 160 }) title!: string;
  @Column({ type: 'text', nullable: true }) description!: string | null;
  @Column({ type: 'varchar', length: 24 }) source!: TaskSource;
  @Column({ type: 'varchar', length: 16, default: TaskStatus.Pending }) status!: TaskStatus;
  @Column({ name: 'due_at', type: 'timestamptz', nullable: true }) dueAt!: Date | null;
  @Column({ name: 'completed_at', type: 'timestamptz', nullable: true }) completedAt!: Date | null;
  @Column({ name: 'source_reference', type: 'varchar', length: 100, nullable: true })
  sourceReference!: string | null;
}
@Entity({ name: 'notifications' })
@Index('idx_notifications_user_created', ['userId', 'createdAt'])
export class Notification extends BaseEntity {
  @Column({ name: 'user_id', type: 'uuid' }) userId!: string;
  @Column({ type: 'varchar', length: 20 }) category!: NotificationCategory;
  @Column({ type: 'varchar', length: 160 }) title!: string;
  @Column({ type: 'text' }) body!: string;
  @Column({ type: 'jsonb', default: () => "'{}'::jsonb" }) data!: Record<string, string>;
  @Column({ name: 'read_at', type: 'timestamptz', nullable: true }) readAt!: Date | null;
  @Column({ name: 'deduplication_key', type: 'varchar', length: 180, nullable: true })
  deduplicationKey!: string | null;
  @Column({ name: 'confirmed_evidence', type: 'boolean', default: false })
  confirmedEvidence!: boolean;
  @Column({ name: 'ai_confidence', type: 'double precision', nullable: true }) aiConfidence!:
    number | null;
}
@Entity({ name: 'device_tokens' })
@Index('uq_device_tokens_token', ['tokenHash'], { unique: true })
@Index('idx_device_tokens_user_active', ['userId', 'active'])
export class DeviceToken extends SoftDeletableEntity {
  @Column({ name: 'user_id', type: 'uuid' }) userId!: string;
  @Column({ name: 'device_id', type: 'uuid', nullable: true }) deviceId!: string | null;
  @Column({ name: 'token_value', type: 'text', select: false }) token!: string;
  @Column({ name: 'token_hash', type: 'char', length: 64 }) tokenHash!: string;
  @Column({ type: 'varchar', length: 16 }) platform!: PushPlatform;
  @Column({ type: 'boolean', default: true }) active!: boolean;
  @Column({ name: 'last_seen_at', type: 'timestamptz' }) lastSeenAt!: Date;
  @Column({ name: 'invalidated_at', type: 'timestamptz', nullable: true })
  invalidatedAt!: Date | null;
}
@Entity({ name: 'notification_preferences' })
@Index('uq_notification_preferences_user_category', ['userId', 'category'], { unique: true })
export class NotificationPreference extends BaseEntity {
  @Column({ name: 'user_id', type: 'uuid' }) userId!: string;
  @Column({ type: 'varchar', length: 20 }) category!: NotificationCategory;
  @Column({ name: 'push_enabled', type: 'boolean', default: true }) pushEnabled!: boolean;
  @Column({ name: 'quiet_hours_start', type: 'time', nullable: true }) quietHoursStart!:
    string | null;
  @Column({ name: 'quiet_hours_end', type: 'time', nullable: true }) quietHoursEnd!: string | null;
  @Column({ name: 'timezone', type: 'varchar', length: 64, default: 'Asia/Karachi' })
  timezone!: string;
}
@Entity({ name: 'notification_deliveries' })
@Index('uq_notification_delivery_token', ['notificationId', 'deviceTokenId'], { unique: true })
export class NotificationDelivery extends BaseEntity {
  @Column({ name: 'notification_id', type: 'uuid' }) notificationId!: string;
  @Column({ name: 'device_token_id', type: 'uuid' }) deviceTokenId!: string;
  @Column({ type: 'varchar', length: 20, default: DeliveryStatus.Scheduled })
  status!: DeliveryStatus;
  @Column({ name: 'provider_message_id', type: 'varchar', length: 255, nullable: true })
  providerMessageId!: string | null;
  @Column({ name: 'attempt_count', type: 'integer', default: 0 }) attemptCount!: number;
  @Column({ name: 'scheduled_at', type: 'timestamptz' }) scheduledAt!: Date;
  @Column({ name: 'sent_at', type: 'timestamptz', nullable: true }) sentAt!: Date | null;
  @Column({ name: 'delivered_at', type: 'timestamptz', nullable: true }) deliveredAt!: Date | null;
  @Column({ name: 'last_error_code', type: 'varchar', length: 100, nullable: true })
  lastErrorCode!: string | null;
}

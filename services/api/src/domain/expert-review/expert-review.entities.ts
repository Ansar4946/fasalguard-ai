import { Column, Entity, Index } from 'typeorm';
import { BaseEntity } from '../../infrastructure/database/entities/base.entity';
import {
  ConsultationMessageType,
  ConsultationStatus,
  ExpertCaseStatus,
  ExpertDecision,
} from './expert-review.enums';

@Entity({ name: 'expert_reviews' })
@Index('uq_expert_review_scan', ['scanId'], { unique: true })
export class ExpertReview extends BaseEntity {
  @Column({ name: 'scan_id', type: 'uuid' }) scanId!: string;
  @Column({ type: 'varchar', length: 32, default: ExpertCaseStatus.Pending })
  status!: ExpertCaseStatus;
  @Column({ type: 'varchar', length: 24, nullable: true }) decision!: ExpertDecision | null;
  @Column({ name: 'confirmed_condition', type: 'varchar', length: 200, nullable: true })
  confirmedCondition!: string | null;
  @Column({ name: 'decision_notes', type: 'text', nullable: true }) decisionNotes!: string | null;
  @Column({ type: 'text', nullable: true }) recommendation!: string | null;
  @Column({ name: 'recommendation_guideline_id', type: 'uuid', nullable: true })
  recommendationGuidelineId!: string | null;
  @Column({ name: 'resolved_at', type: 'timestamptz', nullable: true }) resolvedAt!: Date | null;
}
@Entity({ name: 'expert_assignments' })
@Index('idx_expert_assignments_review_active', ['reviewId', 'unassignedAt'])
export class ExpertAssignment extends BaseEntity {
  @Column({ name: 'review_id', type: 'uuid' }) reviewId!: string;
  @Column({ name: 'expert_id', type: 'uuid' }) expertId!: string;
  @Column({ name: 'assigned_by', type: 'uuid' }) assignedBy!: string;
  @Column({ name: 'assigned_at', type: 'timestamptz' }) assignedAt!: Date;
  @Column({ name: 'unassigned_at', type: 'timestamptz', nullable: true })
  unassignedAt!: Date | null;
}
@Entity({ name: 'consultations' })
@Index('idx_consultations_farmer_created', ['farmerId', 'createdAt'])
export class Consultation extends BaseEntity {
  @Column({ name: 'farmer_id', type: 'uuid' }) farmerId!: string;
  @Column({ name: 'expert_id', type: 'uuid', nullable: true }) expertId!: string | null;
  @Column({ name: 'scan_id', type: 'uuid', nullable: true }) scanId!: string | null;
  @Column({ type: 'varchar', length: 220 }) subject!: string;
  @Column({ type: 'varchar', length: 24, default: ConsultationStatus.Open })
  status!: ConsultationStatus;
}
@Entity({ name: 'consultation_messages' })
@Index('idx_consultation_messages_time', ['consultationId', 'createdAt'])
export class ConsultationMessage extends BaseEntity {
  @Column({ name: 'consultation_id', type: 'uuid' }) consultationId!: string;
  @Column({ name: 'sender_id', type: 'uuid' }) senderId!: string;
  @Column({ type: 'varchar', length: 16 }) type!: ConsultationMessageType;
  @Column({ type: 'text', nullable: true }) text!: string | null;
  @Column({ name: 'media_asset_id', type: 'uuid', nullable: true }) mediaAssetId!: string | null;
}
@Entity({ name: 'case_status_history' })
@Index('idx_case_status_history_review_time', ['reviewId', 'createdAt'])
export class CaseStatusHistory extends BaseEntity {
  @Column({ name: 'review_id', type: 'uuid' }) reviewId!: string;
  @Column({ name: 'actor_id', type: 'uuid', nullable: true }) actorId!: string | null;
  @Column({ name: 'from_status', type: 'varchar', length: 32, nullable: true }) fromStatus!:
    string | null;
  @Column({ name: 'to_status', type: 'varchar', length: 32 }) toStatus!: string;
  @Column({ type: 'text', nullable: true }) reason!: string | null;
  @Column({ type: 'jsonb', default: () => "'{}'::jsonb" }) metadata!: Record<string, unknown>;
}

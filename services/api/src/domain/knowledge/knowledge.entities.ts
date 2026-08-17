import { Column, Entity, Index } from 'typeorm';
import { BaseEntity } from '../../infrastructure/database/entities/base.entity';
import { GuidelineStatus } from './knowledge.enums';
@Entity({ name: 'knowledge_articles' })
export class KnowledgeArticle extends BaseEntity {
  @Column({ type: 'varchar', length: 220 }) title!: string;
  @Column({ type: 'text' }) content!: string;
  @Column({ name: 'language_code', type: 'varchar', length: 16, default: 'en' })
  languageCode!: string;
  @Column({ type: 'varchar', length: 24, default: GuidelineStatus.Draft }) status!: GuidelineStatus;
  @Column({ name: 'author_id', type: 'uuid' }) authorId!: string;
}
@Entity({ name: 'guideline_sources' })
export class GuidelineSource extends BaseEntity {
  @Column({ type: 'varchar', length: 220 }) title!: string;
  @Column({ type: 'text' }) citation!: string;
  @Column({ type: 'text', nullable: true }) url!: string | null;
  @Column({ name: 'published_at', type: 'date', nullable: true }) publishedAt!: string | null;
  @Column({ name: 'created_by', type: 'uuid', nullable: true }) createdBy!: string | null;
}
@Entity({ name: 'treatment_guidelines' })
@Index('idx_guidelines_lookup', ['cropId', 'condition', 'status'])
export class TreatmentGuideline extends BaseEntity {
  @Column({ name: 'crop_id', type: 'uuid' }) cropId!: string;
  @Column({ name: 'crop_variety_id', type: 'uuid', nullable: true }) cropVarietyId!: string | null;
  @Column({ type: 'varchar', length: 200 }) condition!: string;
  @Column({ type: 'varchar', length: 160, nullable: true }) region!: string | null;
  @Column({ name: 'growth_stage', type: 'varchar', length: 100, nullable: true }) growthStage!:
    string | null;
  @Column({ type: 'varchar', length: 16, nullable: true }) severity!: string | null;
  @Column({ name: 'immediate_actions', type: 'jsonb' }) immediateActions!: string[];
  @Column({ name: 'preventive_actions', type: 'jsonb' }) preventiveActions!: string[];
  @Column({ name: 'monitoring_actions', type: 'jsonb' }) monitoringActions!: string[];
  @Column({ name: 'expert_escalation_criteria', type: 'jsonb' })
  expertEscalationCriteria!: string[];
  @Column({ name: 'chemical_guidance', type: 'jsonb', nullable: true }) chemicalGuidance!: Record<
    string,
    unknown
  > | null;
  @Column({ name: 'chemical_guidance_approved', type: 'boolean', default: false })
  chemicalGuidanceApproved!: boolean;
  @Column({ name: 'source_id', type: 'uuid' }) sourceId!: string;
  @Column({ name: 'author_id', type: 'uuid', nullable: true }) authorId!: string | null;
  @Column({ name: 'reviewer_id', type: 'uuid', nullable: true }) reviewerId!: string | null;
  @Column({ name: 'approved_at', type: 'timestamptz', nullable: true }) approvedAt!: Date | null;
  @Column({ name: 'review_due_at', type: 'timestamptz', nullable: true }) reviewDueAt!: Date | null;
  @Column({ name: 'guideline_version', type: 'integer', default: 1 }) guidelineVersion!: number;
  @Column({ type: 'varchar', length: 24, default: GuidelineStatus.Draft }) status!: GuidelineStatus;
}
@Entity({ name: 'guideline_approvals' })
@Index('idx_guideline_approval_history', ['guidelineId', 'createdAt'])
export class GuidelineApproval extends BaseEntity {
  @Column({ name: 'guideline_id', type: 'uuid' }) guidelineId!: string;
  @Column({ name: 'actor_id', type: 'uuid', nullable: true }) actorId!: string | null;
  @Column({ name: 'actor_type', type: 'varchar', length: 32 }) actorType!: string;
  @Column({ name: 'from_status', type: 'varchar', length: 24 }) fromStatus!: string;
  @Column({ name: 'to_status', type: 'varchar', length: 24 }) toStatus!: string;
  @Column({ type: 'text', nullable: true }) notes!: string | null;
  @Column({ name: 'chemical_guidance_approved', type: 'boolean' })
  chemicalGuidanceApproved!: boolean;
  @Column({ name: 'guideline_snapshot', type: 'jsonb' }) guidelineSnapshot!: Record<
    string,
    unknown
  >;
}
@Entity({ name: 'action_plans' })
@Index('idx_action_plan_scan_created', ['scanId', 'createdAt'])
export class ActionPlan extends BaseEntity {
  @Column({ name: 'scan_id', type: 'uuid' }) scanId!: string;
  @Column({ name: 'guideline_id', type: 'uuid' }) guidelineId!: string;
  @Column({ name: 'guideline_version', type: 'integer' }) guidelineVersion!: number;
  @Column({ name: 'created_for_user_id', type: 'uuid' }) createdForUserId!: string;
  @Column({ type: 'varchar', length: 16 }) severity!: string;
  @Column({ type: 'varchar', length: 24, default: 'ACTIVE' }) status!: string;
  @Column({ name: 'generated_at', type: 'timestamptz' }) generatedAt!: Date;
}
@Entity({ name: 'action_plan_steps' })
@Index('idx_action_plan_steps_order', ['actionPlanId', 'displayOrder'])
export class ActionPlanStep extends BaseEntity {
  @Column({ name: 'action_plan_id', type: 'uuid' }) actionPlanId!: string;
  @Column({ type: 'varchar', length: 32 }) type!: string;
  @Column({ type: 'text' }) instruction!: string;
  @Column({ name: 'display_order', type: 'integer' }) displayOrder!: number;
  @Column({ name: 'source_guideline_id', type: 'uuid' }) sourceGuidelineId!: string;
  @Column({ name: 'source_field', type: 'varchar', length: 48 }) sourceField!: string;
}

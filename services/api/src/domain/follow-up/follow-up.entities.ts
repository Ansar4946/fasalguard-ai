import { Column, Entity, Index } from 'typeorm';
import { BaseEntity } from '../../infrastructure/database/entities/base.entity';
@Entity({ name: 'follow_up_questions' })
@Index('idx_follow_up_questions_scan_order', ['scanId', 'displayOrder'])
export class FollowUpQuestion extends BaseEntity {
  @Column({ name: 'scan_id', type: 'uuid' }) scanId!: string;
  @Column({ name: 'library_key', type: 'varchar', length: 80 }) libraryKey!: string;
  @Column({ name: 'question_text', type: 'text' }) questionText!: string;
  @Column({ name: 'display_order', type: 'integer' }) displayOrder!: number;
  @Column({ type: 'jsonb', default: () => "'{}'::jsonb" }) context!: Record<string, unknown>;
  @Column({ name: 'prompt_version', type: 'varchar', length: 40 }) promptVersion!: string;
}
@Entity({ name: 'follow_up_answers' })
@Index('uq_follow_up_answer_question', ['questionId'], { unique: true })
export class FollowUpAnswer extends BaseEntity {
  @Column({ name: 'question_id', type: 'uuid' }) questionId!: string;
  @Column({ name: 'farmer_id', type: 'uuid' }) farmerId!: string;
  @Column({ name: 'answer_text', type: 'text' }) answerText!: string;
  @Column({ name: 'answered_at', type: 'timestamptz' }) answeredAt!: Date;
}
@Entity({ name: 'ai_interactions' })
@Index('idx_ai_interactions_scan_created', ['scanId', 'createdAt'])
export class AiInteraction extends BaseEntity {
  @Column({ name: 'scan_id', type: 'uuid', nullable: true }) scanId!: string | null;
  @Column({ name: 'user_id', type: 'uuid' }) userId!: string;
  @Column({ type: 'varchar', length: 40 }) purpose!: string;
  @Column({ type: 'varchar', length: 40 }) provider!: string;
  @Column({ name: 'model_id', type: 'varchar', length: 160 }) modelId!: string;
  @Column({ name: 'model_version', type: 'varchar', length: 80 }) modelVersion!: string;
  @Column({ name: 'prompt_version', type: 'varchar', length: 40 }) promptVersion!: string;
  @Column({ name: 'input_data', type: 'jsonb' }) inputData!: Record<string, unknown>;
  @Column({ name: 'output_data', type: 'jsonb' }) outputData!: Record<string, unknown>;
  @Column({ name: 'raw_provider_response', type: 'jsonb' }) rawProviderResponse!: Record<
    string,
    unknown
  >;
  @Column({ type: 'varchar', length: 24 }) status!: string;
  @Column({ name: 'failure_code', type: 'varchar', length: 80, nullable: true }) failureCode!:
    string | null;
}

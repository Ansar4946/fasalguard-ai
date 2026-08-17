import { Column, Entity, Index } from 'typeorm';
import { BaseEntity } from '../../infrastructure/database/entities/base.entity';
import { FieldRiskLevel } from './risk.enums';
@Entity({ name: 'field_risk_rulesets' })
@Index('uq_field_risk_ruleset_version', ['rulesetVersion'], { unique: true })
export class FieldRiskRuleset extends BaseEntity {
  @Column({ name: 'ruleset_version', type: 'varchar', length: 40 }) rulesetVersion!: string;
  @Column({ type: 'jsonb' }) weights!: Record<string, number>;
  @Column({ type: 'jsonb' }) thresholds!: Record<string, number>;
  @Column({ name: 'validity_hours', type: 'integer' }) validityHours!: number;
  @Column({ name: 'validation_status', type: 'varchar', length: 32 }) validationStatus!: string;
  @Column({ type: 'text' }) description!: string;
  @Column({ type: 'boolean', default: true }) active!: boolean;
}
@Entity({ name: 'field_risk_assessments' })
@Index('idx_field_risk_field_created', ['fieldId', 'createdAt'])
export class FieldRiskAssessment extends BaseEntity {
  @Column({ name: 'field_id', type: 'uuid' }) fieldId!: string;
  @Column({ name: 'crop_cycle_id', type: 'uuid', nullable: true }) cropCycleId!: string | null;
  @Column({ type: 'double precision' }) score!: number;
  @Column({ type: 'varchar', length: 16 }) level!: FieldRiskLevel;
  @Column({ type: 'jsonb' }) evidence!: Record<string, unknown>[];
  @Column({ type: 'jsonb' }) factors!: Record<string, unknown>[];
  @Column({ name: 'ruleset_version', type: 'varchar', length: 40 }) rulesetVersion!: string;
  @Column({ name: 'trigger_source', type: 'varchar', length: 32 }) triggerSource!: string;
  @Column({ name: 'valid_until', type: 'timestamptz' }) validUntil!: Date;
}

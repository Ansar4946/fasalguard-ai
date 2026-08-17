import { Column, Entity, Index } from 'typeorm';
import { BaseEntity } from '../../infrastructure/database/entities/base.entity';
import { SeverityLevel, SeverityRulesetStatus } from './severity.enums';
@Entity({ name: 'severity_rulesets' })
@Index('uq_severity_ruleset_version', ['key', 'engineVersion'], { unique: true })
export class SeverityRuleset extends BaseEntity {
  @Column({ type: 'varchar', length: 80 }) key!: string;
  @Column({ name: 'engine_version', type: 'varchar', length: 40 }) engineVersion!: string;
  @Column({ type: 'varchar', length: 32 }) status!: SeverityRulesetStatus;
  @Column({ type: 'jsonb' }) weights!: Record<string, number>;
  @Column({ type: 'jsonb' }) thresholds!: Record<string, number>;
  @Column({ type: 'text' }) source!: string;
  @Column({ type: 'boolean', default: true }) active!: boolean;
}
@Entity({ name: 'severity_assessments' })
@Index('idx_severity_assessment_scan_generated', ['scanId', 'generatedAt'])
export class SeverityAssessment extends BaseEntity {
  @Column({ name: 'scan_id', type: 'uuid' }) scanId!: string;
  @Column({ name: 'ruleset_id', type: 'uuid' }) rulesetId!: string;
  @Column({ type: 'varchar', length: 16 }) severity!: SeverityLevel;
  @Column({ name: 'calculated_score', type: 'double precision' }) calculatedScore!: number;
  @Column({ type: 'jsonb' }) factors!: Record<string, unknown>[];
  @Column({ name: 'weights_used', type: 'jsonb' }) weightsUsed!: Record<string, number>;
  @Column({ name: 'evidence_references', type: 'jsonb' }) evidenceReferences!: Record<
    string,
    unknown
  >[];
  @Column({ name: 'engine_version', type: 'varchar', length: 40 }) engineVersion!: string;
  @Column({ type: 'jsonb' }) explanation!: Record<string, unknown>;
  @Column({ name: 'expert_escalation', type: 'boolean' }) expertEscalation!: boolean;
  @Column({ name: 'escalation_reasons', type: 'jsonb' }) escalationReasons!: string[];
  @Column({ name: 'generated_at', type: 'timestamptz' }) generatedAt!: Date;
}

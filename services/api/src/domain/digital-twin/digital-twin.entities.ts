import { Column, Entity, Index } from 'typeorm';
import { BaseEntity } from '../../infrastructure/database/entities/base.entity';
import { IncidentState, InterventionStatus, VerificationStatus } from './digital-twin.enums';

@Entity({ name: 'farm_incidents' })
@Index('idx_farm_incidents_farm_state_detected', ['farmId', 'state', 'detectedAt'])
@Index('idx_farm_incidents_field_detected', ['fieldId', 'detectedAt'])
export class FarmIncident extends BaseEntity {
  @Column({ name: 'farm_id', type: 'uuid' }) farmId!: string;
  @Column({ name: 'field_id', type: 'uuid', nullable: true }) fieldId!: string | null;
  @Column({ name: 'crop_cycle_id', type: 'uuid', nullable: true }) cropCycleId!: string | null;
  @Column({ type: 'varchar', length: 100 }) type!: string;
  @Column({ type: 'varchar', length: 24 }) state!: IncidentState;
  @Column({ type: 'varchar', length: 16, nullable: true }) severity!: string | null;
  @Column({ type: 'double precision', nullable: true }) confidence!: number | null;
  @Column({ type: 'varchar', length: 200 }) title!: string;
  @Column({ type: 'varchar', length: 64 }) source!: string;
  @Column({ name: 'source_identifier', type: 'varchar', length: 255 }) sourceIdentifier!: string;
  @Column({ name: 'evidence_references', type: 'jsonb', default: () => "'[]'::jsonb" })
  evidenceReferences!: Record<string, unknown>[];
  @Column({ name: 'detected_at', type: 'timestamptz' }) detectedAt!: Date;
  @Column({ name: 'resolved_at', type: 'timestamptz', nullable: true }) resolvedAt!: Date | null;
  @Column({ name: 'investigation_run_id', type: 'uuid', nullable: true })
  investigationRunId!: string | null;
  @Column({ name: 'initial_vegetation_score', type: 'double precision', nullable: true })
  initialVegetationScore!: number | null;
  @Column({ name: 'initial_affected_area_hectares', type: 'double precision', nullable: true })
  initialAffectedAreaHectares!: number | null;
  @Column({ name: 'follow_up_risk_score', type: 'double precision', nullable: true })
  followUpRiskScore!: number | null;
  @Column({ name: 'follow_up_vegetation_score', type: 'double precision', nullable: true })
  followUpVegetationScore!: number | null;
  @Column({ name: 'follow_up_affected_area_hectares', type: 'double precision', nullable: true })
  followUpAffectedAreaHectares!: number | null;
  @Column({ name: 'farmer_confirmed', type: 'boolean', nullable: true })
  farmerConfirmed!: boolean | null;
  @Column({ name: 'farmer_confirmed_at', type: 'timestamptz', nullable: true })
  farmerConfirmedAt!: Date | null;
  @Column({ name: 'expert_confirmed', type: 'boolean', nullable: true })
  expertConfirmed!: boolean | null;
  @Column({ name: 'expert_confirmed_at', type: 'timestamptz', nullable: true })
  expertConfirmedAt!: Date | null;
  @Column({ name: 'expert_confirmed_by', type: 'uuid', nullable: true })
  expertConfirmedBy!: string | null;
}

@Entity({ name: 'farm_interventions' })
@Index('idx_farm_interventions_farm_performed', ['farmId', 'performedAt'])
@Index('idx_farm_interventions_incident_status', ['incidentId', 'status'])
export class FarmIntervention extends BaseEntity {
  @Column({ name: 'farm_id', type: 'uuid' }) farmId!: string;
  @Column({ name: 'field_id', type: 'uuid', nullable: true }) fieldId!: string | null;
  @Column({ name: 'incident_id', type: 'uuid', nullable: true }) incidentId!: string | null;
  @Column({ name: 'action_plan_id', type: 'uuid', nullable: true }) actionPlanId!: string | null;
  @Column({ name: 'task_id', type: 'uuid', nullable: true }) taskId!: string | null;
  @Column({ type: 'varchar', length: 100 }) type!: string;
  @Column({ type: 'varchar', length: 24 }) status!: InterventionStatus;
  @Column({ name: 'performed_at', type: 'timestamptz' }) performedAt!: Date;
  @Column({ name: 'recorded_by', type: 'uuid', nullable: true }) recordedBy!: string | null;
  @Column({ type: 'text', nullable: true }) notes!: string | null;
  @Column({ name: 'evidence_references', type: 'jsonb', default: () => "'[]'::jsonb" })
  evidenceReferences!: Record<string, unknown>[];
  @Column({ name: 'started_at', type: 'timestamptz', nullable: true }) startedAt!: Date | null;
  @Column({ name: 'completed_at', type: 'timestamptz', nullable: true }) completedAt!: Date | null;
}

@Entity({ name: 'farm_verifications' })
@Index('idx_farm_verifications_farm_observed', ['farmId', 'observedAt'])
@Index('idx_farm_verifications_incident_status', ['incidentId', 'status'])
export class FarmVerification extends BaseEntity {
  @Column({ name: 'farm_id', type: 'uuid' }) farmId!: string;
  @Column({ name: 'field_id', type: 'uuid', nullable: true }) fieldId!: string | null;
  @Column({ name: 'incident_id', type: 'uuid' }) incidentId!: string;
  @Column({ name: 'crop_scan_id', type: 'uuid', nullable: true }) cropScanId!: string | null;
  @Column({ name: 'satellite_capture_id', type: 'uuid', nullable: true })
  satelliteCaptureId!: string | null;
  @Column({ name: 'field_inspection_id', type: 'uuid', nullable: true })
  fieldInspectionId!: string | null;
  @Column({ type: 'varchar', length: 24 }) status!: VerificationStatus;
  @Column({ type: 'text', nullable: true }) outcome!: string | null;
  @Column({ name: 'observed_at', type: 'timestamptz' }) observedAt!: Date;
  @Column({ name: 'evidence_references', type: 'jsonb', default: () => "'[]'::jsonb" })
  evidenceReferences!: Record<string, unknown>[];
}

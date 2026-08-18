import type { Polygon } from 'geojson';
import { Column, Entity, Index, JoinColumn, ManyToOne } from 'typeorm';
import { BaseEntity } from '../../infrastructure/database/entities/base.entity';
import { Field } from '../farms/field.entity';
import {
  IntegrationOperation,
  SatelliteAnomalyAssessmentStatus,
  SatelliteBaselineMethod,
  SatelliteDataQuality,
  SatelliteProcessingStatus,
} from './satellite.enums';

@Entity({ name: 'satellite_captures' })
@Index('idx_satellite_captures_field_acquisition', ['fieldId', 'acquisitionDate'])
export class SatelliteCapture extends BaseEntity {
  @Column({ name: 'field_id', type: 'uuid' }) fieldId!: string;
  @ManyToOne(() => Field, { onDelete: 'CASCADE' }) @JoinColumn({ name: 'field_id' }) field!: Field;
  @Column({ type: 'varchar', length: 32 }) provider!: string;
  @Column({ name: 'provider_scene_id', type: 'varchar', length: 255, nullable: true })
  providerSceneId!: string | null;
  @Column({ type: 'varchar', length: 64, nullable: true }) satellite!: string | null;
  @Column({ name: 'acquisition_date', type: 'timestamptz', nullable: true })
  acquisitionDate!: Date | null;
  @Column({ name: 'processed_date', type: 'timestamptz', nullable: true })
  processedDate!: Date | null;
  @Column({ name: 'cloud_coverage', type: 'double precision', nullable: true }) cloudCoverage!:
    number | null;
  @Column({ name: 'usable_pixel_percentage', type: 'double precision', nullable: true })
  usablePixelPercentage!: number | null;
  @Column({
    name: 'data_quality',
    type: 'varchar',
    length: 16,
    default: SatelliteDataQuality.Unknown,
  })
  dataQuality!: SatelliteDataQuality;
  @Column({
    name: 'processing_status',
    type: 'varchar',
    length: 32,
    default: SatelliteProcessingStatus.Queued,
  })
  processingStatus!: SatelliteProcessingStatus;
  @Column({ name: 'raw_metadata', type: 'jsonb', default: () => "'{}'::jsonb" })
  rawMetadata!: Record<string, unknown>;
  @Column({ name: 'requested_from', type: 'timestamptz' }) requestedFrom!: Date;
  @Column({ name: 'requested_to', type: 'timestamptz' }) requestedTo!: Date;
}

@Entity({ name: 'satellite_layers' })
export class SatelliteLayer extends BaseEntity {
  @Column({ name: 'capture_id', type: 'uuid' }) captureId!: string;
  @Column({ type: 'varchar', length: 40 }) type!: string;
  @Column({ name: 'media_asset_id', type: 'uuid', nullable: true }) mediaAssetId!: string | null;
  @Column({ type: 'jsonb', default: () => "'{}'::jsonb" }) metadata!: Record<string, unknown>;
}
@Entity({ name: 'satellite_statistics' })
export class SatelliteStatistics extends BaseEntity {
  @Column({ name: 'capture_id', type: 'uuid' }) captureId!: string;
  @Column({ type: 'varchar', length: 40 }) index!: string;
  @Column({ type: 'jsonb' }) statistics!: Record<string, unknown>;
}
@Entity({ name: 'satellite_anomaly_assessments' })
@Index('idx_satellite_anomaly_field_observed', ['fieldId', 'observedAt'])
export class SatelliteAnomalyAssessment extends BaseEntity {
  @Column({ name: 'capture_id', type: 'uuid', unique: true }) captureId!: string;
  @Column({ name: 'field_id', type: 'uuid' }) fieldId!: string;
  @Column({ name: 'baseline_method', type: 'varchar', length: 40 })
  baselineMethod!: SatelliteBaselineMethod;
  @Column({ name: 'baseline_capture_ids', type: 'uuid', array: true, default: () => "'{}'" })
  baselineCaptureIds!: string[];
  @Column({ type: 'varchar', length: 32 }) status!: SatelliteAnomalyAssessmentStatus;
  @Column({ name: 'engine_version', type: 'varchar', length: 40 }) engineVersion!: string;
  @Column({ name: 'observed_at', type: 'timestamptz' }) observedAt!: Date;
  @Column({ name: 'source_identifier', type: 'varchar', length: 255 })
  sourceIdentifier!: string;
  @Column({ type: 'jsonb', default: () => "'{}'::jsonb" }) evidence!: Record<string, unknown>;
}
@Entity({ name: 'satellite_stress_zones' })
export class SatelliteStressZone extends BaseEntity {
  @Column({ name: 'capture_id', type: 'uuid' }) captureId!: string;
  @Column({ type: 'geometry', spatialFeatureType: 'Polygon', srid: 4326 }) geometry!: Polygon;
  @Column({ type: 'varchar', length: 16 }) severity!: string;
  @Column({ type: 'double precision' }) score!: number;
  @Column({ type: 'varchar', length: 40 }) label!: string;
  @Column({ name: 'area_hectares', type: 'double precision' }) areaHectares!: number;
  @Column({ type: 'jsonb', default: () => "'{}'::jsonb" }) evidence!: Record<string, number>;
}
@Entity({ name: 'field_health_scores' })
export class FieldHealthScore extends BaseEntity {
  @Column({ name: 'field_id', type: 'uuid' }) fieldId!: string;
  @Column({ name: 'capture_id', type: 'uuid', nullable: true }) captureId!: string | null;
  @Column({ type: 'double precision' }) score!: number;
  @Column({ type: 'jsonb', default: () => "'{}'::jsonb" }) components!: Record<string, unknown>;
}
@Entity({ name: 'integration_usage' })
@Index('idx_integration_usage_provider_created', ['provider', 'createdAt'])
export class IntegrationUsage extends BaseEntity {
  @Column({ type: 'varchar', length: 40 }) provider!: string;
  @Column({ type: 'varchar', length: 32 }) operation!: IntegrationOperation;
  @Column({ name: 'request_id', type: 'varchar', length: 128, nullable: true }) requestId!:
    string | null;
  @Column({ name: 'status_code', type: 'integer', nullable: true }) statusCode!: number | null;
  @Column({ name: 'duration_ms', type: 'integer' }) durationMs!: number;
  @Column({ name: 'request_count', type: 'integer', default: 1 }) requestCount!: number;
  @Column({ name: 'quota_units', type: 'double precision', nullable: true }) quotaUnits!:
    number | null;
  @Column({ type: 'boolean' }) success!: boolean;
  @Column({ name: 'error_code', type: 'varchar', length: 80, nullable: true }) errorCode!:
    string | null;
}

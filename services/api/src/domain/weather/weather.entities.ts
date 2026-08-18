import { Column, Entity, Index } from 'typeorm';
import { BaseEntity } from '../../infrastructure/database/entities/base.entity';
import { RuleValidationStatus, WeatherRiskCategory, WeatherSuitability } from './weather.enums';

@Entity({ name: 'weather_snapshots' })
@Index('uq_weather_snapshot_bucket', ['fieldId', 'provider', 'cacheBucket'], { unique: true })
export class WeatherSnapshot extends BaseEntity {
  @Column({ name: 'field_id', type: 'uuid' }) fieldId!: string;
  @Column({ type: 'varchar', length: 32 }) provider!: string;
  @Column({ name: 'source_identifier', type: 'varchar', length: 255 })
  sourceIdentifier!: string;
  @Column({ name: 'observation_status', type: 'varchar', length: 24, default: 'RECORDED' })
  observationStatus!: string;
  @Column({ name: 'observed_at', type: 'timestamptz' }) observedAt!: Date;
  @Column({ name: 'cache_bucket', type: 'timestamptz' }) cacheBucket!: Date;
  @Column({ type: 'jsonb' }) values!: Record<string, unknown>;
  @Column({ name: 'raw_metadata', type: 'jsonb', default: () => "'{}'::jsonb" })
  rawMetadata!: Record<string, unknown>;
}
@Entity({ name: 'weather_forecasts' })
@Index('uq_weather_forecast_bucket', ['fieldId', 'provider', 'cacheBucket'], { unique: true })
export class WeatherForecast extends BaseEntity {
  @Column({ name: 'field_id', type: 'uuid' }) fieldId!: string;
  @Column({ type: 'varchar', length: 32 }) provider!: string;
  @Column({ name: 'source_identifier', type: 'varchar', length: 255 })
  sourceIdentifier!: string;
  @Column({ name: 'observation_status', type: 'varchar', length: 24, default: 'RECORDED' })
  observationStatus!: string;
  @Column({ name: 'generated_at', type: 'timestamptz' }) generatedAt!: Date;
  @Column({ name: 'valid_from', type: 'timestamptz' }) validFrom!: Date;
  @Column({ name: 'valid_to', type: 'timestamptz' }) validTo!: Date;
  @Column({ name: 'cache_bucket', type: 'timestamptz' }) cacheBucket!: Date;
  @Column({ type: 'jsonb' }) points!: Record<string, unknown>[];
}
@Entity({ name: 'crop_weather_rules' })
@Index('idx_crop_weather_rules_crop_active', ['cropId', 'active'])
export class CropWeatherRule extends BaseEntity {
  @Column({ name: 'crop_id', type: 'uuid' }) cropId!: string;
  @Column({ type: 'varchar', length: 48 }) category!: WeatherRiskCategory;
  @Column({ type: 'varchar', length: 24 }) suitability!: WeatherSuitability;
  @Column({ type: 'integer', default: 0 }) priority!: number;
  @Column({ type: 'jsonb' }) conditions!: Record<string, unknown>;
  @Column({ type: 'text' }) message!: string;
  @Column({ type: 'text' }) source!: string;
  @Column({ name: 'source_url', type: 'text', nullable: true }) sourceUrl!: string | null;
  @Column({ name: 'validation_status', type: 'varchar', length: 32 })
  validationStatus!: RuleValidationStatus;
  @Column({ name: 'approved_by_expert_id', type: 'uuid', nullable: true }) approvedByExpertId!:
    string | null;
  @Column({ name: 'approved_at', type: 'timestamptz', nullable: true }) approvedAt!: Date | null;
  @Column({ type: 'boolean', default: true }) active!: boolean;
}
@Entity({ name: 'weather_risk_assessments' })
@Index('idx_weather_assessment_field_time', ['fieldId', 'assessedAt'])
export class WeatherRiskAssessment extends BaseEntity {
  @Column({ name: 'field_id', type: 'uuid' }) fieldId!: string;
  @Column({ name: 'crop_cycle_id', type: 'uuid', nullable: true }) cropCycleId!: string | null;
  @Column({ name: 'assessed_at', type: 'timestamptz' }) assessedAt!: Date;
  @Column({ name: 'overall_suitability', type: 'varchar', length: 24, nullable: true })
  overallSuitability!: WeatherSuitability | null;
  @Column({ type: 'jsonb' }) risks!: Record<string, unknown>[];
  @Column({ name: 'validation_summary', type: 'jsonb' }) validationSummary!: Record<
    string,
    unknown
  >;
}
@Entity({ name: 'weather_risk_alerts' })
@Index('uq_weather_risk_alert_field_category', ['fieldId', 'category'], { unique: true })
export class WeatherRiskAlert extends BaseEntity {
  @Column({ name: 'field_id', type: 'uuid' }) fieldId!: string;
  @Column({ type: 'varchar', length: 48 }) category!: WeatherRiskCategory;
  @Column({ type: 'varchar', length: 24 }) suitability!: WeatherSuitability;
  @Column({ name: 'notified_at', type: 'timestamptz' }) notifiedAt!: Date;
}

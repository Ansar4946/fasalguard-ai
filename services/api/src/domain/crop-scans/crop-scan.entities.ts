import { Column, Entity, Index } from 'typeorm';
import { BaseEntity } from '../../infrastructure/database/entities/base.entity';
import { CropScanStatus, ScanImageCategory } from './crop-scan.enums';
@Entity({ name: 'crop_scans' })
@Index('idx_crop_scans_owner_created', ['ownerId', 'createdAt'])
export class CropScan extends BaseEntity {
  @Column({ name: 'owner_id', type: 'uuid' }) ownerId!: string;
  @Column({ name: 'field_id', type: 'uuid', nullable: true }) fieldId!: string | null;
  @Column({ type: 'varchar', length: 32, default: CropScanStatus.Created }) status!: CropScanStatus;
  @Column({ name: 'confidence_policy', type: 'jsonb' }) confidencePolicy!: Record<string, unknown>;
  @Column({ name: 'failure_code', type: 'varchar', length: 80, nullable: true }) failureCode!:
    string | null;
}
@Entity({ name: 'scan_images' })
@Index('uq_scan_image_media', ['scanId', 'mediaAssetId'], { unique: true })
export class ScanImage extends BaseEntity {
  @Column({ name: 'scan_id', type: 'uuid' }) scanId!: string;
  @Column({ name: 'media_asset_id', type: 'uuid' }) mediaAssetId!: string;
  @Column({ type: 'varchar', length: 32 }) category!: ScanImageCategory;
  @Column({ name: 'width_pixels', type: 'integer', nullable: true }) widthPixels!: number | null;
  @Column({ name: 'height_pixels', type: 'integer', nullable: true }) heightPixels!: number | null;
}
@Entity({ name: 'image_quality_results' })
export class ImageQualityResult extends BaseEntity {
  @Column({ name: 'scan_image_id', type: 'uuid', unique: true }) scanImageId!: string;
  @Column({ type: 'boolean' }) acceptable!: boolean;
  @Column({ type: 'jsonb' }) issues!: Record<string, unknown>[];
  @Column({ name: 'provider_metadata', type: 'jsonb', default: () => "'{}'::jsonb" })
  providerMetadata!: Record<string, unknown>;
}
@Entity({ name: 'model_versions' })
@Index('uq_model_provider_version', ['provider', 'modelId', 'modelVersion'], { unique: true })
export class ModelVersion extends BaseEntity {
  @Column({ type: 'varchar', length: 40 }) provider!: string;
  @Column({ name: 'model_id', type: 'varchar', length: 160 }) modelId!: string;
  @Column({ name: 'model_version', type: 'varchar', length: 80 }) modelVersion!: string;
  @Column({ name: 'deployed_at', type: 'timestamptz', nullable: true }) deployedAt!: Date | null;
  @Column({ type: 'jsonb', default: () => "'{}'::jsonb" }) metadata!: Record<string, unknown>;
}
@Entity({ name: 'model_predictions' })
@Index('idx_predictions_scan', ['scanId', 'inferenceTimestamp'])
export class ModelPrediction extends BaseEntity {
  @Column({ name: 'scan_id', type: 'uuid' }) scanId!: string;
  @Column({ name: 'model_version_id', type: 'uuid' }) modelVersionId!: string;
  @Column({ name: 'predicted_condition', type: 'varchar', length: 200 })
  predictedCondition!: string;
  @Column({ type: 'double precision' }) confidence!: number;
  @Column({ name: 'inference_timestamp', type: 'timestamptz' }) inferenceTimestamp!: Date;
  @Column({ name: 'raw_provider_response', type: 'jsonb' }) rawProviderResponse!: Record<
    string,
    unknown
  >;
}
@Entity({ name: 'diagnoses' })
export class Diagnosis extends BaseEntity {
  @Column({ name: 'scan_id', type: 'uuid', unique: true }) scanId!: string;
  @Column({ name: 'screened_condition', type: 'varchar', length: 200, nullable: true })
  screenedCondition!: string | null;
  @Column({ type: 'double precision', nullable: true }) confidence!: number | null;
  @Column({ type: 'varchar', length: 40 }) disposition!: string;
  @Column({ name: 'is_firm_diagnosis', type: 'boolean', default: false }) isFirmDiagnosis!: boolean;
  @Column({ type: 'text' }) disclaimer!: string;
}
@Entity({ name: 'diagnosis_alternatives' })
@Index('idx_diagnosis_alternatives', ['diagnosisId', 'rank'])
export class DiagnosisAlternative extends BaseEntity {
  @Column({ name: 'diagnosis_id', type: 'uuid' }) diagnosisId!: string;
  @Column({ type: 'integer' }) rank!: number;
  @Column({ type: 'varchar', length: 200 }) condition!: string;
  @Column({ type: 'double precision' }) confidence!: number;
}

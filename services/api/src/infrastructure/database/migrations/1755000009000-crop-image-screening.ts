import type { MigrationInterface, QueryRunner } from 'typeorm';
export class CropImageScreening1755000009000 implements MigrationInterface {
  name = 'CropImageScreening1755000009000';
  async up(q: QueryRunner): Promise<void> {
    await q.query(
      `CREATE TABLE crop_scans(id uuid PRIMARY KEY DEFAULT gen_random_uuid(),owner_id uuid NOT NULL REFERENCES users(id) ON DELETE RESTRICT,field_id uuid REFERENCES fields(id) ON DELETE SET NULL,status varchar(32) NOT NULL DEFAULT 'CREATED',confidence_policy jsonb NOT NULL,failure_code varchar(80),created_at timestamptz NOT NULL DEFAULT now(),updated_at timestamptz NOT NULL DEFAULT now(),version integer NOT NULL DEFAULT 1)`,
    );
    await q.query(
      `CREATE INDEX idx_crop_scans_owner_created ON crop_scans(owner_id,created_at DESC)`,
    );
    await q.query(
      `CREATE TABLE scan_images(id uuid PRIMARY KEY DEFAULT gen_random_uuid(),scan_id uuid NOT NULL REFERENCES crop_scans(id) ON DELETE CASCADE,media_asset_id uuid NOT NULL REFERENCES media_assets(id) ON DELETE RESTRICT,category varchar(32) NOT NULL,width_pixels integer,height_pixels integer,created_at timestamptz NOT NULL DEFAULT now(),updated_at timestamptz NOT NULL DEFAULT now(),version integer NOT NULL DEFAULT 1,CONSTRAINT uq_scan_image_media UNIQUE(scan_id,media_asset_id))`,
    );
    await q.query(
      `CREATE TABLE image_quality_results(id uuid PRIMARY KEY DEFAULT gen_random_uuid(),scan_image_id uuid NOT NULL UNIQUE REFERENCES scan_images(id) ON DELETE CASCADE,acceptable boolean NOT NULL,issues jsonb NOT NULL,provider_metadata jsonb NOT NULL DEFAULT '{}',created_at timestamptz NOT NULL DEFAULT now(),updated_at timestamptz NOT NULL DEFAULT now(),version integer NOT NULL DEFAULT 1)`,
    );
    await q.query(
      `CREATE TABLE model_versions(id uuid PRIMARY KEY DEFAULT gen_random_uuid(),provider varchar(40) NOT NULL,model_id varchar(160) NOT NULL,model_version varchar(80) NOT NULL,deployed_at timestamptz,metadata jsonb NOT NULL DEFAULT '{}',created_at timestamptz NOT NULL DEFAULT now(),updated_at timestamptz NOT NULL DEFAULT now(),version integer NOT NULL DEFAULT 1,CONSTRAINT uq_model_provider_version UNIQUE(provider,model_id,model_version))`,
    );
    await q.query(
      `CREATE TABLE model_predictions(id uuid PRIMARY KEY DEFAULT gen_random_uuid(),scan_id uuid NOT NULL REFERENCES crop_scans(id) ON DELETE CASCADE,model_version_id uuid NOT NULL REFERENCES model_versions(id) ON DELETE RESTRICT,predicted_condition varchar(200) NOT NULL,confidence double precision NOT NULL CHECK(confidence>=0 AND confidence<=1),inference_timestamp timestamptz NOT NULL,raw_provider_response jsonb NOT NULL,created_at timestamptz NOT NULL DEFAULT now(),updated_at timestamptz NOT NULL DEFAULT now(),version integer NOT NULL DEFAULT 1)`,
    );
    await q.query(
      `CREATE INDEX idx_predictions_scan ON model_predictions(scan_id,inference_timestamp DESC)`,
    );
    await q.query(
      `CREATE TABLE diagnoses(id uuid PRIMARY KEY DEFAULT gen_random_uuid(),scan_id uuid NOT NULL UNIQUE REFERENCES crop_scans(id) ON DELETE CASCADE,screened_condition varchar(200),confidence double precision CHECK(confidence>=0 AND confidence<=1),disposition varchar(40) NOT NULL,is_firm_diagnosis boolean NOT NULL DEFAULT false CHECK(is_firm_diagnosis=false),disclaimer text NOT NULL,created_at timestamptz NOT NULL DEFAULT now(),updated_at timestamptz NOT NULL DEFAULT now(),version integer NOT NULL DEFAULT 1)`,
    );
    await q.query(
      `CREATE TABLE diagnosis_alternatives(id uuid PRIMARY KEY DEFAULT gen_random_uuid(),diagnosis_id uuid NOT NULL REFERENCES diagnoses(id) ON DELETE CASCADE,rank integer NOT NULL CHECK(rank>0),condition varchar(200) NOT NULL,confidence double precision NOT NULL CHECK(confidence>=0 AND confidence<=1),created_at timestamptz NOT NULL DEFAULT now(),updated_at timestamptz NOT NULL DEFAULT now(),version integer NOT NULL DEFAULT 1,CONSTRAINT uq_diagnosis_alternative_rank UNIQUE(diagnosis_id,rank))`,
    );
  }
  async down(q: QueryRunner): Promise<void> {
    for (const table of [
      'diagnosis_alternatives',
      'diagnoses',
      'model_predictions',
      'model_versions',
      'image_quality_results',
      'scan_images',
      'crop_scans',
    ])
      await q.query(`DROP TABLE IF EXISTS ${table}`);
  }
}

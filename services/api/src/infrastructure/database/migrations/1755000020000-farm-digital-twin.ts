import type { MigrationInterface, QueryRunner } from 'typeorm';

export class FarmDigitalTwin1755000020000 implements MigrationInterface {
  name = 'FarmDigitalTwin1755000020000';

  async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`
      ALTER TABLE weather_snapshots ADD COLUMN source_identifier varchar(255), ADD COLUMN observation_status varchar(24) NOT NULL DEFAULT 'RECORDED';
      UPDATE weather_snapshots SET source_identifier=provider || ':' || id::text WHERE source_identifier IS NULL;
      ALTER TABLE weather_snapshots ALTER COLUMN source_identifier SET NOT NULL;
      ALTER TABLE weather_forecasts ADD COLUMN source_identifier varchar(255), ADD COLUMN observation_status varchar(24) NOT NULL DEFAULT 'RECORDED';
      UPDATE weather_forecasts SET source_identifier=provider || ':' || id::text WHERE source_identifier IS NULL;
      ALTER TABLE weather_forecasts ALTER COLUMN source_identifier SET NOT NULL;
      CREATE INDEX idx_weather_snapshots_field_observed ON weather_snapshots(field_id,observed_at DESC);
      CREATE INDEX idx_weather_forecasts_field_generated ON weather_forecasts(field_id,generated_at DESC);
      CREATE INDEX idx_satellite_statistics_capture_index ON satellite_statistics(capture_id,index);
      CREATE INDEX idx_crop_scans_field_created ON crop_scans(field_id,created_at DESC) WHERE field_id IS NOT NULL;
      CREATE INDEX idx_field_inspections_field_observed ON field_inspections(field_id,observed_at DESC);

      CREATE TABLE farm_incidents(
        id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
        farm_id uuid NOT NULL REFERENCES farms(id) ON DELETE CASCADE,
        field_id uuid REFERENCES fields(id) ON DELETE SET NULL,
        crop_cycle_id uuid REFERENCES crop_cycles(id) ON DELETE SET NULL,
        type varchar(100) NOT NULL,
        state varchar(24) NOT NULL,
        severity varchar(16),
        confidence double precision,
        title varchar(200) NOT NULL,
        source varchar(64) NOT NULL,
        source_identifier varchar(255) NOT NULL,
        evidence_references jsonb NOT NULL DEFAULT '[]'::jsonb,
        detected_at timestamptz NOT NULL,
        resolved_at timestamptz,
        created_at timestamptz NOT NULL DEFAULT now(),
        updated_at timestamptz NOT NULL DEFAULT now(),
        version integer NOT NULL DEFAULT 1,
        CONSTRAINT ck_farm_incident_state CHECK(state IN('DETECTED','INVESTIGATING','ACTION_REQUIRED','MONITORING','RECOVERING','RESOLVED','ESCALATED','DISMISSED')),
        CONSTRAINT ck_farm_incident_confidence CHECK(confidence IS NULL OR confidence BETWEEN 0 AND 1),
        CONSTRAINT ck_farm_incident_resolution CHECK((state IN('RESOLVED','DISMISSED'))=(resolved_at IS NOT NULL)),
        CONSTRAINT uq_farm_incident_source UNIQUE(source,source_identifier)
      );
      CREATE INDEX idx_farm_incidents_farm_state_detected ON farm_incidents(farm_id,state,detected_at DESC);
      CREATE INDEX idx_farm_incidents_field_detected ON farm_incidents(field_id,detected_at DESC) WHERE field_id IS NOT NULL;

      CREATE TABLE farm_interventions(
        id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
        farm_id uuid NOT NULL REFERENCES farms(id) ON DELETE CASCADE,
        field_id uuid REFERENCES fields(id) ON DELETE SET NULL,
        incident_id uuid REFERENCES farm_incidents(id) ON DELETE SET NULL,
        action_plan_id uuid REFERENCES action_plans(id) ON DELETE SET NULL,
        task_id uuid REFERENCES farmer_tasks(id) ON DELETE SET NULL,
        type varchar(100) NOT NULL,
        status varchar(24) NOT NULL,
        performed_at timestamptz NOT NULL,
        recorded_by uuid REFERENCES users(id) ON DELETE SET NULL,
        notes text,
        evidence_references jsonb NOT NULL DEFAULT '[]'::jsonb,
        created_at timestamptz NOT NULL DEFAULT now(),
        updated_at timestamptz NOT NULL DEFAULT now(),
        version integer NOT NULL DEFAULT 1,
        CONSTRAINT ck_farm_intervention_status CHECK(status IN('PLANNED','IN_PROGRESS','COMPLETED','CANCELLED'))
      );
      CREATE INDEX idx_farm_interventions_farm_performed ON farm_interventions(farm_id,performed_at DESC);
      CREATE INDEX idx_farm_interventions_incident_status ON farm_interventions(incident_id,status) WHERE incident_id IS NOT NULL;

      CREATE TABLE farm_verifications(
        id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
        farm_id uuid NOT NULL REFERENCES farms(id) ON DELETE CASCADE,
        field_id uuid REFERENCES fields(id) ON DELETE SET NULL,
        incident_id uuid NOT NULL REFERENCES farm_incidents(id) ON DELETE CASCADE,
        crop_scan_id uuid REFERENCES crop_scans(id) ON DELETE SET NULL,
        satellite_capture_id uuid REFERENCES satellite_captures(id) ON DELETE SET NULL,
        field_inspection_id uuid REFERENCES field_inspections(id) ON DELETE SET NULL,
        status varchar(24) NOT NULL,
        outcome text,
        observed_at timestamptz NOT NULL,
        evidence_references jsonb NOT NULL DEFAULT '[]'::jsonb,
        created_at timestamptz NOT NULL DEFAULT now(),
        updated_at timestamptz NOT NULL DEFAULT now(),
        version integer NOT NULL DEFAULT 1,
        CONSTRAINT ck_farm_verification_status CHECK(status IN('PENDING','IMPROVED','UNCHANGED','WORSENED','INCONCLUSIVE')),
        CONSTRAINT ck_farm_verification_evidence CHECK(crop_scan_id IS NOT NULL OR satellite_capture_id IS NOT NULL OR field_inspection_id IS NOT NULL OR jsonb_array_length(evidence_references)>0)
      );
      CREATE INDEX idx_farm_verifications_farm_observed ON farm_verifications(farm_id,observed_at DESC);
      CREATE INDEX idx_farm_verifications_incident_status ON farm_verifications(incident_id,status);
    `);
  }

  async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`
      DROP TABLE IF EXISTS farm_verifications;
      DROP TABLE IF EXISTS farm_interventions;
      DROP TABLE IF EXISTS farm_incidents;
      DROP INDEX IF EXISTS idx_field_inspections_field_observed;
      DROP INDEX IF EXISTS idx_crop_scans_field_created;
      DROP INDEX IF EXISTS idx_satellite_statistics_capture_index;
      DROP INDEX IF EXISTS idx_weather_forecasts_field_generated;
      DROP INDEX IF EXISTS idx_weather_snapshots_field_observed;
      ALTER TABLE weather_forecasts DROP COLUMN IF EXISTS observation_status, DROP COLUMN IF EXISTS source_identifier;
      ALTER TABLE weather_snapshots DROP COLUMN IF EXISTS observation_status, DROP COLUMN IF EXISTS source_identifier;
    `);
  }
}

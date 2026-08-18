import type { MigrationInterface, QueryRunner } from 'typeorm';

export class SatelliteAnomalyEvidence1755000021000 implements MigrationInterface {
  name = 'SatelliteAnomalyEvidence1755000021000';

  async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`
      CREATE TABLE satellite_anomaly_assessments (
        id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
        capture_id uuid NOT NULL UNIQUE REFERENCES satellite_captures(id) ON DELETE CASCADE,
        field_id uuid NOT NULL REFERENCES fields(id) ON DELETE CASCADE,
        baseline_method varchar(40) NOT NULL,
        baseline_capture_ids uuid[] NOT NULL DEFAULT '{}',
        status varchar(32) NOT NULL,
        engine_version varchar(40) NOT NULL,
        observed_at timestamptz NOT NULL,
        source_identifier varchar(255) NOT NULL,
        evidence jsonb NOT NULL DEFAULT '{}'::jsonb,
        created_at timestamptz NOT NULL DEFAULT now(),
        updated_at timestamptz NOT NULL DEFAULT now(),
        version integer NOT NULL DEFAULT 1,
        CONSTRAINT chk_satellite_anomaly_baseline CHECK (baseline_method IN (
          'ROLLING_FIELD_BASELINE','PREVIOUS_VALID_OBSERVATION','INSUFFICIENT_HISTORY'
        )),
        CONSTRAINT chk_satellite_anomaly_status CHECK (status IN (
          'COMPLETED','INSUFFICIENT_HISTORY','QUALITY_BLOCKED'
        )),
        CONSTRAINT chk_satellite_anomaly_scope CHECK (
          evidence->>'conclusionScope' = 'SATELLITE_STRESS_ANOMALY'
        )
      );
      CREATE INDEX idx_satellite_anomaly_field_observed
        ON satellite_anomaly_assessments(field_id, observed_at DESC);
      CREATE INDEX idx_satellite_anomaly_status
        ON satellite_anomaly_assessments(status, observed_at DESC);
    `);
  }

  async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query('DROP TABLE IF EXISTS satellite_anomaly_assessments');
  }
}

import type { MigrationInterface, QueryRunner } from 'typeorm';
export class AutomaticSatelliteMonitoring1755000007000 implements MigrationInterface {
  name = 'AutomaticSatelliteMonitoring1755000007000';
  async up(q: QueryRunner): Promise<void> {
    await q.query(
      `ALTER TABLE fields ADD COLUMN last_satellite_check_at timestamptz, ADD COLUMN last_successful_capture_at timestamptz, ADD COLUMN next_satellite_check_at timestamptz NOT NULL DEFAULT now(), ADD COLUMN satellite_check_failure_count integer NOT NULL DEFAULT 0 CHECK(satellite_check_failure_count>=0); CREATE INDEX idx_fields_next_satellite_check ON fields(next_satellite_check_at) WHERE deleted_at IS NULL AND status='active'; ALTER TABLE integration_usage ADD COLUMN request_count integer NOT NULL DEFAULT 1 CHECK(request_count>0);`,
    );
  }
  async down(q: QueryRunner): Promise<void> {
    await q.query(
      `ALTER TABLE integration_usage DROP COLUMN IF EXISTS request_count; DROP INDEX IF EXISTS idx_fields_next_satellite_check; ALTER TABLE fields DROP COLUMN IF EXISTS satellite_check_failure_count, DROP COLUMN IF EXISTS next_satellite_check_at, DROP COLUMN IF EXISTS last_successful_capture_at, DROP COLUMN IF EXISTS last_satellite_check_at;`,
    );
  }
}

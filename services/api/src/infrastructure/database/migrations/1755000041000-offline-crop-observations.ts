import type { MigrationInterface, QueryRunner } from 'typeorm';

export class OfflineCropObservations1755000041000 implements MigrationInterface {
  name = 'OfflineCropObservations1755000041000';
  async up(q: QueryRunner): Promise<void> {
    await q.query(`CREATE TABLE offline_crop_observations (
      id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
      owner_id uuid NOT NULL REFERENCES users(id) ON DELETE RESTRICT,
      client_id uuid NOT NULL, scan_id uuid NOT NULL UNIQUE REFERENCES crop_scans(id) ON DELETE CASCADE,
      crop_cycle_id uuid NOT NULL REFERENCES crop_cycles(id) ON DELETE RESTRICT,
      request_hash char(64) NOT NULL, payload jsonb NOT NULL,
      created_at timestamptz NOT NULL DEFAULT now(),
      CONSTRAINT uq_offline_crop_owner_client UNIQUE(owner_id,client_id))`);
    await q.query(
      'CREATE INDEX idx_offline_crop_owner_created ON offline_crop_observations(owner_id,created_at)',
    );
  }
  async down(q: QueryRunner): Promise<void> {
    await q.query('DROP TABLE offline_crop_observations');
  }
}

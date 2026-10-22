import type { MigrationInterface, QueryRunner } from 'typeorm';

export class SatellitePlatformOutbox1755000037000 implements MigrationInterface {
  name = 'SatellitePlatformOutbox1755000037000';
  async up(q: QueryRunner): Promise<void> {
    await q.query(`DROP INDEX uq_satellite_scene_field;
      CREATE UNIQUE INDEX uq_satellite_scene_field ON satellite_captures(field_id,provider,provider_scene_id)
      WHERE provider_scene_id IS NOT NULL AND provider <> 'EARTHSEARCH_STAC';
      CREATE UNIQUE INDEX uq_satellite_platform_scene ON satellite_captures
      (field_id,provider,provider_scene_id,(raw_metadata->>'geometryHash'),(raw_metadata->>'processingVersion'))
      WHERE provider='EARTHSEARCH_STAC' AND provider_scene_id IS NOT NULL AND processing_status='COMPLETED';`);
    await q.query(`CREATE TABLE satellite_task_outbox (
      capture_id uuid PRIMARY KEY REFERENCES satellite_captures(id) ON DELETE CASCADE,
      user_id uuid NOT NULL REFERENCES users(id),
      next_dispatch_at timestamptz NOT NULL DEFAULT now(),
      dispatch_count integer NOT NULL DEFAULT 0,
      completed_at timestamptz,
      created_at timestamptz NOT NULL DEFAULT now()
    ); CREATE INDEX idx_satellite_outbox_due ON satellite_task_outbox(next_dispatch_at) WHERE completed_at IS NULL;`);
  }
  async down(q: QueryRunner): Promise<void> {
    // Rollback must refuse incompatible reprocessed rows rather than delete farmer data.
    await q.query(`DROP INDEX uq_satellite_platform_scene; DROP INDEX uq_satellite_scene_field;
      CREATE UNIQUE INDEX uq_satellite_scene_field ON satellite_captures(field_id,provider,provider_scene_id)
      WHERE provider_scene_id IS NOT NULL;`);
    await q.query('DROP TABLE satellite_task_outbox');
  }
}

import type { MigrationInterface, QueryRunner } from 'typeorm';
export class SatelliteCatalog1755000005000 implements MigrationInterface {
  name = 'SatelliteCatalog1755000005000';
  async up(q: QueryRunner): Promise<void> {
    await q.query(
      `CREATE TABLE satellite_captures (id uuid PRIMARY KEY DEFAULT uuid_generate_v4(), field_id uuid NOT NULL REFERENCES fields(id) ON DELETE CASCADE, provider varchar(32) NOT NULL, provider_scene_id varchar(255), satellite varchar(64), acquisition_date timestamptz, processed_date timestamptz, cloud_coverage double precision, usable_pixel_percentage double precision, data_quality varchar(16) NOT NULL DEFAULT 'UNKNOWN', processing_status varchar(32) NOT NULL DEFAULT 'QUEUED', raw_metadata jsonb NOT NULL DEFAULT '{}'::jsonb, requested_from timestamptz NOT NULL, requested_to timestamptz NOT NULL, created_at timestamptz NOT NULL DEFAULT now(), updated_at timestamptz NOT NULL DEFAULT now(), version integer NOT NULL DEFAULT 1, CONSTRAINT chk_satellite_status CHECK(processing_status IN ('QUEUED','SEARCHING_SCENE','PROCESSING','ANALYSING','COMPLETED','NO_VALID_SCENE','CLOUD_BLOCKED','FAILED')), CONSTRAINT chk_cloud_coverage CHECK(cloud_coverage IS NULL OR cloud_coverage BETWEEN 0 AND 100));`,
    );
    await q.query(
      `CREATE INDEX idx_satellite_captures_field_acquisition ON satellite_captures(field_id, acquisition_date DESC);`,
    );
    await q.query(
      `CREATE UNIQUE INDEX uq_satellite_scene_field ON satellite_captures(field_id,provider,provider_scene_id) WHERE provider_scene_id IS NOT NULL;`,
    );
    await q.query(
      `CREATE TABLE satellite_layers (id uuid PRIMARY KEY DEFAULT uuid_generate_v4(), capture_id uuid NOT NULL REFERENCES satellite_captures(id) ON DELETE CASCADE, type varchar(40) NOT NULL, media_asset_id uuid REFERENCES media_assets(id) ON DELETE SET NULL, metadata jsonb NOT NULL DEFAULT '{}'::jsonb, created_at timestamptz NOT NULL DEFAULT now(), updated_at timestamptz NOT NULL DEFAULT now(), version integer NOT NULL DEFAULT 1);`,
    );
    await q.query(
      `CREATE TABLE satellite_statistics (id uuid PRIMARY KEY DEFAULT uuid_generate_v4(), capture_id uuid NOT NULL REFERENCES satellite_captures(id) ON DELETE CASCADE, index varchar(40) NOT NULL, statistics jsonb NOT NULL, created_at timestamptz NOT NULL DEFAULT now(), updated_at timestamptz NOT NULL DEFAULT now(), version integer NOT NULL DEFAULT 1);`,
    );
    await q.query(
      `CREATE TABLE satellite_stress_zones (id uuid PRIMARY KEY DEFAULT uuid_generate_v4(), capture_id uuid NOT NULL REFERENCES satellite_captures(id) ON DELETE CASCADE, geometry geometry(Polygon,4326) NOT NULL, severity varchar(16) NOT NULL, score double precision NOT NULL, created_at timestamptz NOT NULL DEFAULT now(), updated_at timestamptz NOT NULL DEFAULT now(), version integer NOT NULL DEFAULT 1); CREATE INDEX idx_satellite_stress_zones_geometry_gist ON satellite_stress_zones USING gist(geometry);`,
    );
    await q.query(
      `CREATE TABLE field_health_scores (id uuid PRIMARY KEY DEFAULT uuid_generate_v4(), field_id uuid NOT NULL REFERENCES fields(id) ON DELETE CASCADE, capture_id uuid REFERENCES satellite_captures(id) ON DELETE SET NULL, score double precision NOT NULL CHECK(score BETWEEN 0 AND 100), components jsonb NOT NULL DEFAULT '{}'::jsonb, created_at timestamptz NOT NULL DEFAULT now(), updated_at timestamptz NOT NULL DEFAULT now(), version integer NOT NULL DEFAULT 1); CREATE INDEX idx_field_health_scores_field_created ON field_health_scores(field_id,created_at DESC);`,
    );
    await q.query(
      `CREATE TABLE integration_usage (id uuid PRIMARY KEY DEFAULT uuid_generate_v4(), provider varchar(40) NOT NULL, operation varchar(32) NOT NULL, request_id varchar(128), status_code integer, duration_ms integer NOT NULL, quota_units double precision, success boolean NOT NULL, error_code varchar(80), created_at timestamptz NOT NULL DEFAULT now(), updated_at timestamptz NOT NULL DEFAULT now(), version integer NOT NULL DEFAULT 1); CREATE INDEX idx_integration_usage_provider_created ON integration_usage(provider,created_at DESC);`,
    );
  }
  async down(q: QueryRunner): Promise<void> {
    for (const t of [
      'integration_usage',
      'field_health_scores',
      'satellite_stress_zones',
      'satellite_statistics',
      'satellite_layers',
      'satellite_captures',
    ])
      await q.query(`DROP TABLE IF EXISTS ${t} CASCADE`);
  }
}

import type { MigrationInterface, QueryRunner } from 'typeorm';
export class SatelliteProcessingPipeline1755000006000 implements MigrationInterface {
  name = 'SatelliteProcessingPipeline1755000006000';
  async up(q: QueryRunner): Promise<void> {
    await q.query(
      `ALTER TABLE satellite_stress_zones ADD COLUMN label varchar(40) NOT NULL DEFAULT 'UNKNOWN_STRESS', ADD COLUMN area_hectares double precision NOT NULL DEFAULT 0, ADD COLUMN evidence jsonb NOT NULL DEFAULT '{}'::jsonb; ALTER TABLE satellite_stress_zones ADD CONSTRAINT chk_stress_label CHECK(label IN ('VEGETATION_DECLINE','POSSIBLE_WATER_STRESS','POSSIBLE_EXCESS_MOISTURE','UNEVEN_GROWTH','UNKNOWN_STRESS')); CREATE UNIQUE INDEX uq_satellite_layers_capture_type ON satellite_layers(capture_id,type); CREATE UNIQUE INDEX uq_satellite_statistics_capture_index ON satellite_statistics(capture_id,index); CREATE UNIQUE INDEX uq_field_health_scores_capture ON field_health_scores(capture_id) WHERE capture_id IS NOT NULL;`,
    );
  }
  async down(q: QueryRunner): Promise<void> {
    await q.query(
      `DROP INDEX IF EXISTS uq_field_health_scores_capture; DROP INDEX IF EXISTS uq_satellite_statistics_capture_index; DROP INDEX IF EXISTS uq_satellite_layers_capture_type; ALTER TABLE satellite_stress_zones DROP CONSTRAINT IF EXISTS chk_stress_label, DROP COLUMN IF EXISTS evidence, DROP COLUMN IF EXISTS area_hectares, DROP COLUMN IF EXISTS label;`,
    );
  }
}

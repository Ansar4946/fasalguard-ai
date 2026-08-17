import type { MigrationInterface, QueryRunner } from 'typeorm';

export class FarmManagement1755000003000 implements MigrationInterface {
  name = 'FarmManagement1755000003000';

  async up(q: QueryRunner): Promise<void> {
    await q.query(`ALTER TABLE farms ADD COLUMN tehsil varchar(120)`);
    await q.query(`ALTER TABLE farms ADD COLUMN soil_type varchar(120)`);
    await q.query(`ALTER TABLE farms ADD COLUMN irrigation_type varchar(120)`);
    await q.query(`ALTER TABLE farms ADD COLUMN water_source varchar(120)`);
    await q.query(`ALTER TABLE crop_cycles ADD COLUMN growth_stage varchar(80)`);
    await q.query(
      `CREATE UNIQUE INDEX uq_crop_cycles_field_current ON crop_cycles(field_id) WHERE deleted_at IS NULL AND status IN ('planned','active')`,
    );
  }

  async down(q: QueryRunner): Promise<void> {
    await q.query(`DROP INDEX IF EXISTS uq_crop_cycles_field_current`);
    await q.query(`ALTER TABLE crop_cycles DROP COLUMN IF EXISTS growth_stage`);
    await q.query(`ALTER TABLE farms DROP COLUMN IF EXISTS water_source`);
    await q.query(`ALTER TABLE farms DROP COLUMN IF EXISTS irrigation_type`);
    await q.query(`ALTER TABLE farms DROP COLUMN IF EXISTS soil_type`);
    await q.query(`ALTER TABLE farms DROP COLUMN IF EXISTS tehsil`);
  }
}

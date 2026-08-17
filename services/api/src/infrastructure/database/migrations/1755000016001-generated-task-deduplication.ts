import type { MigrationInterface, QueryRunner } from 'typeorm';
export class GeneratedTaskDeduplication1755000016001 implements MigrationInterface {
  name = 'GeneratedTaskDeduplication1755000016001';
  async up(q: QueryRunner): Promise<void> {
    await q.query(
      `CREATE UNIQUE INDEX uq_farmer_tasks_generated_source ON farmer_tasks(user_id,source,source_reference) WHERE source_reference IS NOT NULL AND deleted_at IS NULL`,
    );
  }
  async down(q: QueryRunner): Promise<void> {
    await q.query(`DROP INDEX IF EXISTS uq_farmer_tasks_generated_source`);
  }
}

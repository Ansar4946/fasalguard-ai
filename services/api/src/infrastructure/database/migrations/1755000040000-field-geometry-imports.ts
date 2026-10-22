import type { MigrationInterface, QueryRunner } from 'typeorm';

export class FieldGeometryImports1755000040000 implements MigrationInterface {
  name = 'FieldGeometryImports1755000040000';
  async up(q: QueryRunner): Promise<void> {
    await q.query(
      `ALTER TABLE fields ADD COLUMN boundary_metadata jsonb NOT NULL DEFAULT '{}'::jsonb`,
    );
    await q.query(`CREATE TABLE field_geometry_imports (
      id uuid PRIMARY KEY DEFAULT gen_random_uuid(), owner_id uuid NOT NULL REFERENCES users(id) ON DELETE RESTRICT,
      farm_id uuid NOT NULL REFERENCES farms(id) ON DELETE RESTRICT, idempotency_key uuid NOT NULL,
      request_hash varchar(64) NOT NULL, result jsonb NOT NULL, created_at timestamptz NOT NULL DEFAULT now(),
      CONSTRAINT uq_geometry_import_owner_key UNIQUE(owner_id,idempotency_key))`);
  }
  async down(q: QueryRunner): Promise<void> {
    await q.query('DROP TABLE field_geometry_imports');
    await q.query('ALTER TABLE fields DROP COLUMN boundary_metadata');
  }
}

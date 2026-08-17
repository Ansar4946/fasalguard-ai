import type { MigrationInterface, QueryRunner } from 'typeorm';

export class PrivateMediaAssets1755000004000 implements MigrationInterface {
  name = 'PrivateMediaAssets1755000004000';
  async up(q: QueryRunner): Promise<void> {
    await q.query(
      `CREATE TABLE media_assets (id uuid PRIMARY KEY DEFAULT gen_random_uuid(), owner_id uuid NOT NULL REFERENCES users(id) ON DELETE RESTRICT, object_key varchar(512) NOT NULL UNIQUE, original_filename varchar(180) NOT NULL, content_type varchar(120) NOT NULL, size_bytes bigint NOT NULL, checksum varchar(128), purpose varchar(40) NOT NULL, status varchar(24) NOT NULL DEFAULT 'pending', metadata jsonb NOT NULL DEFAULT '{}'::jsonb, completed_at timestamptz, created_at timestamptz NOT NULL DEFAULT now(), updated_at timestamptz NOT NULL DEFAULT now(), version integer NOT NULL DEFAULT 1, CONSTRAINT ck_media_size CHECK(size_bytes>0), CONSTRAINT ck_media_purpose CHECK(purpose IN ('crop-scan','field-inspection','expert-review','voice-note','satellite','report')), CONSTRAINT ck_media_status CHECK(status IN ('pending','ready','failed')))`,
    );
    await q.query(`CREATE INDEX idx_media_assets_owner_status ON media_assets(owner_id,status)`);
  }
  async down(q: QueryRunner): Promise<void> {
    await q.query(`DROP TABLE IF EXISTS media_assets`);
  }
}

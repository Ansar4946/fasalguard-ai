import type { MigrationInterface, QueryRunner } from 'typeorm';

export class FeedbackCollection1755000031000 implements MigrationInterface {
  name = 'FeedbackCollection1755000031000';

  async up(q: QueryRunner): Promise<void> {
    await q.query(`
      ALTER TABLE user_feedback
        ALTER COLUMN feedback DROP NOT NULL,
        ADD COLUMN farm_id uuid REFERENCES farms(id) ON DELETE SET NULL,
        ADD COLUMN useful boolean,
        ADD COLUMN would_recommend boolean,
        ADD COLUMN public_reference_url varchar(2048),
        ADD COLUMN published_at timestamptz,
        ADD COLUMN published_by uuid REFERENCES users(id) ON DELETE SET NULL,
        ADD CONSTRAINT ck_user_feedback_published_pair CHECK((published_at IS NULL)=(published_by IS NULL)),
        ADD CONSTRAINT ck_user_feedback_publish_requires_consent CHECK(published_at IS NULL OR consent_to_quote=true);
      CREATE INDEX idx_user_feedback_farm_created ON user_feedback(farm_id,created_at DESC) WHERE farm_id IS NOT NULL;
      CREATE INDEX idx_user_feedback_feature_useful ON user_feedback(context_type,useful) WHERE useful IS NOT NULL;
      CREATE INDEX idx_user_feedback_published ON user_feedback(published_at DESC) WHERE published_at IS NOT NULL;
    `);
  }

  async down(q: QueryRunner): Promise<void> {
    await q.query(`
      DROP INDEX IF EXISTS idx_user_feedback_published;
      DROP INDEX IF EXISTS idx_user_feedback_feature_useful;
      DROP INDEX IF EXISTS idx_user_feedback_farm_created;
      ALTER TABLE user_feedback
        DROP CONSTRAINT IF EXISTS ck_user_feedback_publish_requires_consent,
        DROP CONSTRAINT IF EXISTS ck_user_feedback_published_pair,
        DROP COLUMN IF EXISTS published_by,
        DROP COLUMN IF EXISTS published_at,
        DROP COLUMN IF EXISTS public_reference_url,
        DROP COLUMN IF EXISTS would_recommend,
        DROP COLUMN IF EXISTS useful,
        DROP COLUMN IF EXISTS farm_id;
      UPDATE user_feedback SET feedback='(no comment)' WHERE feedback IS NULL;
      ALTER TABLE user_feedback ALTER COLUMN feedback SET NOT NULL;
    `);
  }
}

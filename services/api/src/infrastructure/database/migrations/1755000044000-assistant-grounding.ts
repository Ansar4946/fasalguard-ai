import type { MigrationInterface, QueryRunner } from 'typeorm';

/** F10: persisted language/citations/grounding outcome, send idempotency, and a full-text index
 *  over approved knowledge. The 'simple' configuration is deliberate: it does not stem and works
 *  for Urdu and Hindi script as well as English. */
export class AssistantGrounding1755000044000 implements MigrationInterface {
  name = 'AssistantGrounding1755000044000';

  async up(q: QueryRunner): Promise<void> {
    await q.query(
      `ALTER TABLE assistant_messages
         ADD COLUMN language varchar(8),
         ADD COLUMN citations jsonb NOT NULL DEFAULT '[]',
         ADD COLUMN grounding varchar(16),
         ADD COLUMN idempotency_key uuid,
         ADD CONSTRAINT ck_assistant_message_language CHECK(language IS NULL OR language IN('en','ur','hi')),
         ADD CONSTRAINT ck_assistant_message_grounding CHECK(grounding IS NULL OR grounding IN('GROUNDED','ABSTAINED'))`,
    );
    await q.query(
      `CREATE UNIQUE INDEX uq_assistant_messages_idempotency ON assistant_messages(conversation_id,idempotency_key) WHERE idempotency_key IS NOT NULL AND role='ASSISTANT'`,
    );
    await q.query(
      `CREATE INDEX idx_knowledge_articles_fts ON knowledge_articles USING GIN (to_tsvector('simple', title || ' ' || content)) WHERE status='APPROVED'`,
    );
  }

  async down(q: QueryRunner): Promise<void> {
    await q.query(`DROP INDEX IF EXISTS idx_knowledge_articles_fts`);
    await q.query(`DROP INDEX IF EXISTS uq_assistant_messages_idempotency`);
    await q.query(
      `ALTER TABLE assistant_messages
         DROP CONSTRAINT IF EXISTS ck_assistant_message_grounding,
         DROP CONSTRAINT IF EXISTS ck_assistant_message_language,
         DROP COLUMN IF EXISTS idempotency_key,
         DROP COLUMN IF EXISTS grounding,
         DROP COLUMN IF EXISTS citations,
         DROP COLUMN IF EXISTS language`,
    );
  }
}

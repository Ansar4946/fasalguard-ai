import type { MigrationInterface, QueryRunner } from 'typeorm';

/** F10 personal context: an answer built from the farmer's own account data is stored with
 *  grounding ACCOUNT_DATA (its sources are kept in `citations` as {type,label} objects). */
export class AssistantAccountData1755000046000 implements MigrationInterface {
  name = 'AssistantAccountData1755000046000';

  async up(q: QueryRunner): Promise<void> {
    await q.query(`ALTER TABLE assistant_messages DROP CONSTRAINT ck_assistant_message_grounding`);
    await q.query(
      `ALTER TABLE assistant_messages ADD CONSTRAINT ck_assistant_message_grounding CHECK(grounding IS NULL OR grounding IN('GROUNDED','ABSTAINED','ACCOUNT_DATA'))`,
    );
  }

  async down(q: QueryRunner): Promise<void> {
    await q.query(`DELETE FROM assistant_messages WHERE grounding='ACCOUNT_DATA'`);
    await q.query(`ALTER TABLE assistant_messages DROP CONSTRAINT ck_assistant_message_grounding`);
    await q.query(
      `ALTER TABLE assistant_messages ADD CONSTRAINT ck_assistant_message_grounding CHECK(grounding IS NULL OR grounding IN('GROUNDED','ABSTAINED'))`,
    );
  }
}

import type { MigrationInterface, QueryRunner } from 'typeorm';

export class VoiceProcessingConsent1755000042000 implements MigrationInterface {
  name = 'VoiceProcessingConsent1755000042000';

  async up(q: QueryRunner): Promise<void> {
    await q.query(`ALTER TABLE consents DROP CONSTRAINT IF EXISTS ck_consents_type`);
    await q.query(
      `ALTER TABLE consents ADD CONSTRAINT ck_consents_type CHECK(type IN ('LOCATION_PROCESSING','ANONYMOUS_COMMUNITY_REPORTING','AI_IMAGE_ANALYSIS','NOTIFICATIONS','RESEARCH_DATA_USE','PRIVACY_POLICY','TERMS_OF_SERVICE','VOICE_PROCESSING'))`,
    );
  }

  async down(q: QueryRunner): Promise<void> {
    await q.query(`DELETE FROM consents WHERE type='VOICE_PROCESSING'`);
    await q.query(`ALTER TABLE consents DROP CONSTRAINT IF EXISTS ck_consents_type`);
    await q.query(
      `ALTER TABLE consents ADD CONSTRAINT ck_consents_type CHECK(type IN ('LOCATION_PROCESSING','ANONYMOUS_COMMUNITY_REPORTING','AI_IMAGE_ANALYSIS','NOTIFICATIONS','RESEARCH_DATA_USE','PRIVACY_POLICY','TERMS_OF_SERVICE'))`,
    );
  }
}

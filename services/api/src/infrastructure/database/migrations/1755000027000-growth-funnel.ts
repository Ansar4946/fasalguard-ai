import type { MigrationInterface, QueryRunner } from 'typeorm';

export class GrowthFunnel1755000027000 implements MigrationInterface {
  name = 'GrowthFunnel1755000027000';

  async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`
      ALTER TABLE users ADD COLUMN is_test_account boolean NOT NULL DEFAULT false;

      ALTER TABLE farmer_profiles
        ADD COLUMN acquisition_source varchar(24),
        ADD COLUMN referred_by_user_id uuid REFERENCES users(id),
        ADD COLUMN referral_code varchar(12);
      UPDATE farmer_profiles SET acquisition_source='DIRECT' WHERE acquisition_source IS NULL;
      UPDATE farmer_profiles SET referral_code=upper(substr(md5(random()::text||id::text),1,8)) WHERE referral_code IS NULL;
      ALTER TABLE farmer_profiles
        ALTER COLUMN acquisition_source SET NOT NULL,
        ALTER COLUMN acquisition_source SET DEFAULT 'DIRECT',
        ALTER COLUMN referral_code SET NOT NULL,
        ADD CONSTRAINT ck_farmer_profiles_acquisition_source CHECK(acquisition_source IN('DIRECT','REFERRAL','FARMER_GROUP','SOCIAL','PARTNER','OTHER')),
        ADD CONSTRAINT uq_farmer_profiles_referral_code UNIQUE(referral_code);
      CREATE INDEX idx_farmer_profiles_referred_by ON farmer_profiles(referred_by_user_id);

      CREATE TABLE pilot_leads(
        id uuid PRIMARY KEY DEFAULT gen_random_uuid(),name varchar(160) NOT NULL,email varchar(320) NOT NULL,
        phone varchar(24),country varchar(80) NOT NULL,farm_size_acres numeric(10,2),main_crop varchar(80) NOT NULL,
        farm_count integer,acquisition_source varchar(24) NOT NULL DEFAULT 'DIRECT',status varchar(16) NOT NULL DEFAULT 'NEW',
        created_at timestamptz NOT NULL DEFAULT now(),updated_at timestamptz NOT NULL DEFAULT now(),version integer NOT NULL DEFAULT 1,
        CONSTRAINT ck_pilot_lead_status CHECK(status IN('NEW','CONTACTED','CONVERTED','DECLINED')),
        CONSTRAINT ck_pilot_lead_acquisition_source CHECK(acquisition_source IN('DIRECT','REFERRAL','FARMER_GROUP','SOCIAL','PARTNER','OTHER')),
        CONSTRAINT ck_pilot_lead_farm_size CHECK(farm_size_acres IS NULL OR farm_size_acres>=0),
        CONSTRAINT ck_pilot_lead_farm_count CHECK(farm_count IS NULL OR farm_count>=0)
      );
      CREATE INDEX idx_pilot_leads_status_created ON pilot_leads(status,created_at DESC);

      CREATE TABLE landing_page_views(
        id uuid PRIMARY KEY DEFAULT gen_random_uuid(),viewed_on date NOT NULL,count integer NOT NULL DEFAULT 0,
        updated_at timestamptz NOT NULL DEFAULT now(),
        CONSTRAINT uq_landing_page_views_viewed_on UNIQUE(viewed_on)
      );

      -- No uniqueness constraint: one-time email types (ONBOARDING_INCOMPLETE, ROADMAP_READY,
      -- INSIGHT_READY) are guarded by an application-level "exists" check before insert;
      -- WEEKLY_SUMMARY is guarded by an application-level this-week date-range check, since it
      -- must legitimately recur — a hard UNIQUE(user_id,email_type) would block those resends.
      CREATE TABLE lifecycle_email_log(
        id uuid PRIMARY KEY DEFAULT gen_random_uuid(),user_id uuid NOT NULL REFERENCES users(id) ON DELETE CASCADE,
        email_type varchar(40) NOT NULL,sent_at timestamptz NOT NULL DEFAULT now()
      );
      CREATE INDEX idx_lifecycle_email_log_user_type_sent ON lifecycle_email_log(user_id,email_type,sent_at DESC);
    `);
  }

  async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`
      DROP TABLE IF EXISTS lifecycle_email_log,landing_page_views,pilot_leads CASCADE;
      DROP INDEX IF EXISTS idx_farmer_profiles_referred_by;
      ALTER TABLE farmer_profiles
        DROP CONSTRAINT IF EXISTS uq_farmer_profiles_referral_code,
        DROP CONSTRAINT IF EXISTS ck_farmer_profiles_acquisition_source,
        DROP COLUMN IF EXISTS referral_code,
        DROP COLUMN IF EXISTS referred_by_user_id,
        DROP COLUMN IF EXISTS acquisition_source;
      ALTER TABLE users DROP COLUMN IF EXISTS is_test_account;
    `);
  }
}

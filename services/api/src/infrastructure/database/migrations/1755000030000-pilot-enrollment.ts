import type { MigrationInterface, QueryRunner } from 'typeorm';

export class PilotEnrollment1755000030000 implements MigrationInterface {
  name = 'PilotEnrollment1755000030000';

  async up(q: QueryRunner): Promise<void> {
    await q.query(`ALTER TABLE pilot_users RENAME COLUMN consented_at TO registered_at`);
    await q.query(`
      ALTER TABLE pilot_users
        ALTER COLUMN organization_id DROP NOT NULL,
        ALTER COLUMN registered_at DROP NOT NULL,
        ALTER COLUMN evidence_reference DROP NOT NULL,
        ADD COLUMN invited_at timestamptz NOT NULL DEFAULT now(),
        ADD COLUMN invited_by uuid REFERENCES users(id) ON DELETE SET NULL,
        ADD COLUMN activated_at timestamptz,
        ADD COLUMN completed_at timestamptz,
        ADD COLUMN dropped_at timestamptz,
        ADD COLUMN source varchar(24),
        DROP CONSTRAINT ck_pilot_user_status,
        ADD CONSTRAINT ck_pilot_user_status CHECK(status IN('INVITED','REGISTERED','ONBOARDED','ACTIVE','COMPLETED','DROPPED')),
        ADD CONSTRAINT ck_pilot_user_source CHECK(source IS NULL OR source IN('DIRECT','REFERRAL','FARMER_GROUP','SOCIAL','PARTNER','OTHER'));
      CREATE UNIQUE INDEX uq_pilot_users_user_no_org ON pilot_users(user_id) WHERE organization_id IS NULL;
    `);
  }

  async down(q: QueryRunner): Promise<void> {
    await q.query(`
      DROP INDEX IF EXISTS uq_pilot_users_user_no_org;
      ALTER TABLE pilot_users
        DROP CONSTRAINT IF EXISTS ck_pilot_user_source,
        DROP CONSTRAINT IF EXISTS ck_pilot_user_status,
        ADD CONSTRAINT ck_pilot_user_status CHECK(status IN('INVITED','CONSENTED','ONBOARDED','ACTIVE','WITHDRAWN')),
        DROP COLUMN IF EXISTS source,
        DROP COLUMN IF EXISTS dropped_at,
        DROP COLUMN IF EXISTS completed_at,
        DROP COLUMN IF EXISTS activated_at,
        DROP COLUMN IF EXISTS invited_by,
        DROP COLUMN IF EXISTS invited_at,
        ALTER COLUMN evidence_reference SET NOT NULL,
        ALTER COLUMN registered_at SET NOT NULL,
        ALTER COLUMN organization_id SET NOT NULL;
    `);
    await q.query(`ALTER TABLE pilot_users RENAME COLUMN registered_at TO consented_at`);
  }
}

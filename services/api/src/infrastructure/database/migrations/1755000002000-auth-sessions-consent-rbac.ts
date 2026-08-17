import type { MigrationInterface, QueryRunner } from 'typeorm';
export class AuthSessionsConsentRbac1755000002000 implements MigrationInterface {
  name = 'AuthSessionsConsentRbac1755000002000';
  async up(q: QueryRunner): Promise<void> {
    await q.query(
      `UPDATE users SET role=CASE role WHEN 'farmer' THEN 'FARMER' WHEN 'expert' THEN 'AGRICULTURE_EXPERT' WHEN 'government' THEN 'GOVERNMENT_VIEWER' WHEN 'admin' THEN 'ADMIN' ELSE role END`,
    );
    await q.query(`UPDATE consents SET type=upper(type)`);
    await q.query(
      `ALTER TABLE users ADD CONSTRAINT ck_users_role CHECK(role IN ('FARMER','AGRICULTURE_EXPERT','FIELD_WORKER','NGO_VIEWER','GOVERNMENT_VIEWER','ADMIN','SUPER_ADMIN'))`,
    );
    await q.query(
      `ALTER TABLE users ADD CONSTRAINT ck_users_status CHECK(status IN ('pending','active','suspended'))`,
    );
    await q.query(
      `ALTER TABLE consents ADD CONSTRAINT ck_consents_type CHECK(type IN ('LOCATION_PROCESSING','ANONYMOUS_COMMUNITY_REPORTING','AI_IMAGE_ANALYSIS','NOTIFICATIONS','RESEARCH_DATA_USE','PRIVACY_POLICY','TERMS_OF_SERVICE'))`,
    );
    await q.query(
      `CREATE TABLE auth_sessions (id uuid PRIMARY KEY DEFAULT gen_random_uuid(), user_id uuid NOT NULL REFERENCES users(id) ON DELETE CASCADE, device_id uuid REFERENCES devices(id) ON DELETE SET NULL, refresh_token_hash char(64) NOT NULL UNIQUE, token_family uuid NOT NULL, user_agent varchar(512), ip_address inet, last_used_at timestamptz NOT NULL, expires_at timestamptz NOT NULL, revoked_at timestamptz, revoke_reason varchar(64), replaced_by_session_id uuid, created_at timestamptz NOT NULL DEFAULT now(), updated_at timestamptz NOT NULL DEFAULT now(), version integer NOT NULL DEFAULT 1)`,
    );
    await q.query(
      `CREATE UNIQUE INDEX uq_devices_user_identifier_active ON devices(user_id,device_identifier) WHERE deleted_at IS NULL`,
    );
    await q.query(
      `CREATE INDEX idx_auth_sessions_user_active ON auth_sessions(user_id,expires_at) WHERE revoked_at IS NULL`,
    );
    await q.query(`CREATE INDEX idx_auth_sessions_family ON auth_sessions(token_family)`);
    await q.query(`CREATE INDEX idx_auth_sessions_expiry ON auth_sessions(expires_at)`);
  }
  async down(q: QueryRunner): Promise<void> {
    await q.query(`DROP TABLE IF EXISTS auth_sessions`);
    await q.query(`DROP INDEX IF EXISTS uq_devices_user_identifier_active`);
    await q.query(`ALTER TABLE consents DROP CONSTRAINT IF EXISTS ck_consents_type`);
    await q.query(`ALTER TABLE users DROP CONSTRAINT IF EXISTS ck_users_status`);
    await q.query(`ALTER TABLE users DROP CONSTRAINT IF EXISTS ck_users_role`);
    await q.query(
      `UPDATE users SET role=CASE role WHEN 'FARMER' THEN 'farmer' WHEN 'AGRICULTURE_EXPERT' THEN 'expert' WHEN 'GOVERNMENT_VIEWER' THEN 'government' WHEN 'ADMIN' THEN 'admin' ELSE role END`,
    );
  }
}

import type { MigrationInterface, QueryRunner } from 'typeorm';

export class UssdFarmLedger1755000043000 implements MigrationInterface {
  name = 'UssdFarmLedger1755000043000';

  async up(q: QueryRunner): Promise<void> {
    await q.query(`CREATE TABLE ussd_credentials (
      user_id uuid PRIMARY KEY REFERENCES users(id) ON DELETE CASCADE,
      pin_hash varchar(255) NOT NULL, failed_attempts integer NOT NULL DEFAULT 0 CHECK(failed_attempts>=0),
      locked_until timestamptz, pin_changed_at timestamptz NOT NULL DEFAULT now(),
      created_at timestamptz NOT NULL DEFAULT now(), updated_at timestamptz NOT NULL DEFAULT now(),
      version integer NOT NULL DEFAULT 1)`);
    await q.query(`CREATE TABLE ussd_sessions (
      id uuid PRIMARY KEY DEFAULT gen_random_uuid(), gateway varchar(40) NOT NULL,
      provider_session_id varchar(120) NOT NULL, user_id uuid NOT NULL REFERENCES users(id) ON DELETE RESTRICT,
      phone_hash char(64) NOT NULL, state varchar(24) NOT NULL CHECK(state IN('PIN','FARM','SEASON','CATEGORY','AMOUNT','DATE','REVIEW','COMPLETE','CANCELLED')),
      context jsonb NOT NULL DEFAULT '{}', step_count integer NOT NULL DEFAULT 0 CHECK(step_count BETWEEN 0 AND 20),
      expires_at timestamptz NOT NULL, completed_at timestamptz, terminal_response varchar(300),
      created_at timestamptz NOT NULL DEFAULT now(), updated_at timestamptz NOT NULL DEFAULT now(),
      version integer NOT NULL DEFAULT 1, UNIQUE(gateway,provider_session_id),
      CHECK(completed_at IS NULL OR completed_at>=created_at))`);
    await q.query(
      `CREATE INDEX idx_ussd_sessions_expiry ON ussd_sessions(expires_at) WHERE completed_at IS NULL`,
    );
    await q.query(`CREATE TABLE ussd_callback_receipts (
      id uuid PRIMARY KEY DEFAULT gen_random_uuid(), gateway varchar(40) NOT NULL,
      provider_event_id varchar(120) NOT NULL, provider_session_id varchar(120) NOT NULL,
      request_hash char(64) NOT NULL, status varchar(16) NOT NULL CHECK(status IN('PROCESSING','APPLIED','FAILED')),
      response_text varchar(300), received_at timestamptz NOT NULL DEFAULT now(), processed_at timestamptz,
      UNIQUE(gateway,provider_event_id))`);
    await q.query(`CREATE TABLE ussd_security_events (
      id uuid PRIMARY KEY DEFAULT gen_random_uuid(), gateway varchar(40) NOT NULL,
      provider_session_id varchar(120), provider_event_id varchar(120),
      type varchar(40) NOT NULL CHECK(type IN('EVENT_PAYLOAD_CONFLICT','PHONE_SESSION_MISMATCH')),
      request_hash char(64) NOT NULL, created_at timestamptz NOT NULL DEFAULT now())`);
    await q.query(
      `CREATE INDEX idx_ussd_security_events_created ON ussd_security_events(created_at DESC)`,
    );
    await q.query(`CREATE TABLE farm_ledger_entries (
      id uuid PRIMARY KEY DEFAULT gen_random_uuid(), user_id uuid NOT NULL REFERENCES users(id) ON DELETE RESTRICT,
      farmer_id uuid NOT NULL REFERENCES farmer_profiles(id) ON DELETE RESTRICT,
      farm_id uuid NOT NULL REFERENCES farms(id) ON DELETE RESTRICT,
      crop_cycle_id uuid NOT NULL REFERENCES crop_cycles(id) ON DELETE RESTRICT,
      type varchar(16) NOT NULL CHECK(type='EXPENSE'),
      category varchar(24) NOT NULL CHECK(category IN('SEED','FERTILIZER','PESTICIDE','LABOUR','IRRIGATION','EQUIPMENT','TRANSPORT','OTHER')),
      amount_minor bigint NOT NULL CHECK(amount_minor>0 AND amount_minor<=100000000),
      currency char(3) NOT NULL CHECK(currency='PKR'), occurred_on date NOT NULL,
      channel varchar(16) NOT NULL CHECK(channel='USSD'),
      source_session_id uuid NOT NULL REFERENCES ussd_sessions(id) ON DELETE RESTRICT UNIQUE,
      client_reference varchar(180) NOT NULL, confirmed_at timestamptz NOT NULL,
      created_at timestamptz NOT NULL DEFAULT now(), updated_at timestamptz NOT NULL DEFAULT now(),
      version integer NOT NULL DEFAULT 1, UNIQUE(user_id,client_reference))`);
    await q.query(
      `CREATE INDEX idx_farm_ledger_user_date ON farm_ledger_entries(user_id,occurred_on DESC)`,
    );
    await q.query(
      `CREATE INDEX idx_farm_ledger_farm ON farm_ledger_entries(farm_id,crop_cycle_id)`,
    );
    await q.query(`CREATE TABLE farm_ledger_events (
      id uuid PRIMARY KEY DEFAULT gen_random_uuid(), ledger_entry_id uuid NOT NULL REFERENCES farm_ledger_entries(id) ON DELETE RESTRICT,
      user_id uuid NOT NULL REFERENCES users(id) ON DELETE RESTRICT,
      type varchar(24) NOT NULL CHECK(type='CONFIRMED'), payload jsonb NOT NULL DEFAULT '{}',
      created_at timestamptz NOT NULL DEFAULT now())`);
    await q.query(
      `CREATE UNIQUE INDEX uq_farm_ledger_confirmed_event ON farm_ledger_events(ledger_entry_id,type)`,
    );
    await q.query(`CREATE FUNCTION prevent_farm_ledger_mutation() RETURNS trigger LANGUAGE plpgsql AS $$
      BEGIN RAISE EXCEPTION 'farm ledger records are append-only' USING ERRCODE='55000'; END $$`);
    await q.query(`CREATE TRIGGER trg_farm_ledger_entries_append_only BEFORE UPDATE OR DELETE ON farm_ledger_entries
      FOR EACH ROW EXECUTE FUNCTION prevent_farm_ledger_mutation()`);
    await q.query(`CREATE TRIGGER trg_farm_ledger_events_append_only BEFORE UPDATE OR DELETE ON farm_ledger_events
      FOR EACH ROW EXECUTE FUNCTION prevent_farm_ledger_mutation()`);
  }

  async down(q: QueryRunner): Promise<void> {
    await q.query(`DROP TABLE IF EXISTS farm_ledger_events`);
    await q.query(`DROP TABLE IF EXISTS farm_ledger_entries`);
    await q.query(`DROP TABLE IF EXISTS ussd_security_events`);
    await q.query(`DROP TABLE IF EXISTS ussd_callback_receipts`);
    await q.query(`DROP TABLE IF EXISTS ussd_sessions`);
    await q.query(`DROP TABLE IF EXISTS ussd_credentials`);
    await q.query(`DROP FUNCTION IF EXISTS prevent_farm_ledger_mutation()`);
  }
}

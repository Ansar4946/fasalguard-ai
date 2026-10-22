import { MigrationInterface, QueryRunner } from 'typeorm';

export class IrrigationWaterProductivity1755000038000 implements MigrationInterface {
  name = 'IrrigationWaterProductivity1755000038000';
  async up(q: QueryRunner): Promise<void> {
    await q.query(`CREATE TABLE field_water_profiles (
      id uuid PRIMARY KEY DEFAULT gen_random_uuid(), field_id uuid NOT NULL REFERENCES fields(id),
      crop_cycle_id uuid NOT NULL REFERENCES crop_cycles(id), owner_id uuid NOT NULL REFERENCES users(id),
      version integer NOT NULL CHECK(version>0), inputs jsonb NOT NULL,
      created_at timestamptz NOT NULL DEFAULT now(), UNIQUE(crop_cycle_id,version)
    );
    CREATE TABLE irrigation_events (
      id uuid PRIMARY KEY DEFAULT gen_random_uuid(), field_id uuid NOT NULL REFERENCES fields(id),
      crop_cycle_id uuid NOT NULL REFERENCES crop_cycles(id), owner_id uuid NOT NULL REFERENCES users(id),
      event_date date NOT NULL, inputs jsonb NOT NULL, idempotency_key uuid NOT NULL,
      created_at timestamptz NOT NULL DEFAULT now(), UNIQUE(owner_id,idempotency_key), UNIQUE(crop_cycle_id,event_date)
    );
    CREATE TABLE irrigation_runs (
      id uuid PRIMARY KEY DEFAULT gen_random_uuid(), field_id uuid NOT NULL REFERENCES fields(id),
      crop_cycle_id uuid NOT NULL REFERENCES crop_cycles(id), owner_id uuid NOT NULL REFERENCES users(id),
      kind varchar(32) NOT NULL CHECK(kind IN ('IRRIGATION','WATER_PRODUCTIVITY')),
      status varchar(32) NOT NULL DEFAULT 'QUEUED' CHECK(status IN ('QUEUED','PROCESSING','COMPLETED','FAILED','BLOCKED_EXTERNAL')),
      idempotency_key uuid NOT NULL, request_hash varchar(64) NOT NULL,
      inputs jsonb NOT NULL, result jsonb, failure_code varchar(64),
      attempt_count integer NOT NULL DEFAULT 0,
      created_at timestamptz NOT NULL DEFAULT now(), updated_at timestamptz NOT NULL DEFAULT now(),
      UNIQUE(owner_id,idempotency_key)
    );
    CREATE INDEX idx_irrigation_runs_owner_created ON irrigation_runs(owner_id,created_at DESC);
    CREATE TABLE irrigation_task_outbox (
      run_id uuid PRIMARY KEY REFERENCES irrigation_runs(id) ON DELETE CASCADE,
      next_dispatch_at timestamptz NOT NULL DEFAULT now(), dispatch_count integer NOT NULL DEFAULT 0,
      completed_at timestamptz
    );
    CREATE INDEX idx_irrigation_outbox_due ON irrigation_task_outbox(next_dispatch_at) WHERE completed_at IS NULL;`);
  }
  async down(q: QueryRunner): Promise<void> {
    await q.query(
      'DROP TABLE irrigation_task_outbox; DROP TABLE irrigation_runs; DROP TABLE irrigation_events; DROP TABLE field_water_profiles;',
    );
  }
}

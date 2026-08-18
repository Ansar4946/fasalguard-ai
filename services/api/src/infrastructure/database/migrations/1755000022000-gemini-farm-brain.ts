import type { MigrationInterface, QueryRunner } from 'typeorm';

export class GeminiFarmBrain1755000022000 implements MigrationInterface {
  name = 'GeminiFarmBrain1755000022000';

  async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`
      CREATE TABLE farm_brain_runs(
        id uuid PRIMARY KEY DEFAULT gen_random_uuid(),user_id uuid NOT NULL REFERENCES users(id) ON DELETE CASCADE,
        farm_id uuid NOT NULL REFERENCES farms(id) ON DELETE CASCADE,field_id uuid REFERENCES fields(id) ON DELETE CASCADE,
        status varchar(24) NOT NULL,operation varchar(32) NOT NULL DEFAULT 'INVESTIGATE',schema_version varchar(40) NOT NULL,
        input_hash char(64) NOT NULL,input_manifest jsonb NOT NULL,result jsonb,provider varchar(80),model_id varchar(120),
        model_version varchar(120),input_tokens integer,output_tokens integer,latency_ms integer,error_code varchar(80),
        started_at timestamptz,completed_at timestamptz,created_at timestamptz NOT NULL DEFAULT now(),
        updated_at timestamptz NOT NULL DEFAULT now(),version integer NOT NULL DEFAULT 1,
        CONSTRAINT chk_farm_brain_run_status CHECK(status IN('QUEUED','RUNNING','COMPLETED','FAILED')),
        CONSTRAINT chk_farm_brain_manifest_privacy CHECK(NOT input_manifest ?| ARRAY['boundary','centroid','phone','email','password','accessToken','refreshToken'])
      );
      CREATE INDEX idx_farm_brain_runs_farm_created ON farm_brain_runs(farm_id,created_at DESC);
      CREATE INDEX idx_farm_brain_runs_status_created ON farm_brain_runs(status,created_at DESC);
      CREATE UNIQUE INDEX uq_farm_brain_active_input ON farm_brain_runs(user_id,farm_id,input_hash)
        WHERE status IN('QUEUED','RUNNING','COMPLETED');

      CREATE TABLE farm_brain_run_evidence(
        id uuid PRIMARY KEY DEFAULT gen_random_uuid(),run_id uuid NOT NULL REFERENCES farm_brain_runs(id) ON DELETE CASCADE,
        evidence_id varchar(255) NOT NULL,evidence_type varchar(64) NOT NULL,source varchar(80) NOT NULL,
        observed_at timestamptz,snapshot_hash char(64) NOT NULL,created_at timestamptz NOT NULL DEFAULT now(),
        updated_at timestamptz NOT NULL DEFAULT now(),version integer NOT NULL DEFAULT 1,
        CONSTRAINT uq_farm_brain_evidence UNIQUE(run_id,evidence_id)
      );
      CREATE INDEX idx_farm_brain_evidence_run ON farm_brain_run_evidence(run_id);

      CREATE TABLE farm_brain_tool_calls(
        id uuid PRIMARY KEY DEFAULT gen_random_uuid(),run_id uuid NOT NULL REFERENCES farm_brain_runs(id) ON DELETE CASCADE,
        name varchar(64) NOT NULL,arguments jsonb NOT NULL DEFAULT '{}',status varchar(32) NOT NULL,reason text NOT NULL,
        result_reference varchar(255),confirmed_by uuid REFERENCES users(id) ON DELETE SET NULL,confirmed_at timestamptz,
        executed_at timestamptz,created_at timestamptz NOT NULL DEFAULT now(),updated_at timestamptz NOT NULL DEFAULT now(),
        version integer NOT NULL DEFAULT 1,
        CONSTRAINT chk_farm_brain_tool_name CHECK(name IN('getFarmDigitalTwin','getLatestWeather','getVegetationTrend',
          'getRecentFarmerImages','createIncident','createInspectionTask','scheduleFollowUp','sendFarmerAlert',
          'requestFarmerPhoto','escalateToExpert')),
        CONSTRAINT chk_farm_brain_tool_status CHECK(status IN('PROPOSED','AWAITING_CONFIRMATION','REJECTED_BY_POLICY',
          'CONFIRMED','EXECUTED','FAILED'))
      );
      CREATE INDEX idx_farm_brain_tool_calls_run_status ON farm_brain_tool_calls(run_id,status);
    `);
  }

  async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(
      `DROP TABLE IF EXISTS farm_brain_tool_calls;DROP TABLE IF EXISTS farm_brain_run_evidence;DROP TABLE IF EXISTS farm_brain_runs`,
    );
  }
}

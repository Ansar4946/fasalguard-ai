import type { MigrationInterface, QueryRunner } from 'typeorm';

export class AiRunTelemetry1755000028000 implements MigrationInterface {
  name = 'AiRunTelemetry1755000028000';

  async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`
      -- A cross-cutting, judge-facing execution ledger. Existing detailed per-feature tables
      -- (farm_brain_runs + evidence + tool_calls, ai_interactions, crop-scan model_predictions)
      -- remain the internal source of truth for their own domains and are untouched; this table
      -- is a structured SUMMARY written once a run reaches a terminal state — no raw prompt/
      -- response bodies and no chain-of-thought are stored here, only validated, already-public
      -- fields (findings/hypothesis statements, tool names, confidence, error codes).
      CREATE TABLE ai_runs(
        id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
        user_id uuid REFERENCES users(id) ON DELETE SET NULL,
        farm_id uuid REFERENCES farms(id) ON DELETE SET NULL,
        crop_season_id uuid REFERENCES crop_cycles(id) ON DELETE SET NULL,
        incident_id uuid REFERENCES farm_incidents(id) ON DELETE SET NULL,
        operation varchar(40) NOT NULL,
        provider varchar(40) NOT NULL,
        model varchar(160) NOT NULL,
        status varchar(16) NOT NULL,
        started_at timestamptz NOT NULL,
        completed_at timestamptz,
        latency_ms integer,
        input_type varchar(60),
        evidence_ids jsonb NOT NULL DEFAULT '[]'::jsonb,
        tool_calls jsonb NOT NULL DEFAULT '[]'::jsonb,
        tool_call_count integer NOT NULL DEFAULT 0,
        incident_created boolean NOT NULL DEFAULT false,
        confidence double precision,
        output_schema_version varchar(40),
        input_tokens integer,
        output_tokens integer,
        estimated_cost numeric(12,6),
        cost_currency char(3),
        error_code varchar(80),
        human_review_status varchar(20) NOT NULL DEFAULT 'NOT_REQUIRED',
        source_table varchar(40),
        source_id uuid,
        created_at timestamptz NOT NULL DEFAULT now(),
        updated_at timestamptz NOT NULL DEFAULT now(),
        version integer NOT NULL DEFAULT 1,
        CONSTRAINT ck_ai_run_operation CHECK(operation IN(
          'CROP_ANALYSIS','FARM_HEALTH_ANALYSIS','ROADMAP_GENERATION','INCIDENT_INVESTIGATION',
          'FOLLOW_UP_ANALYSIS','WEATHER_RISK_ANALYSIS','SATELLITE_RISK_ANALYSIS','WEEKLY_SUMMARY'
        )),
        CONSTRAINT ck_ai_run_status CHECK(status IN('QUEUED','RUNNING','COMPLETED','FAILED')),
        CONSTRAINT ck_ai_run_human_review CHECK(human_review_status IN('NOT_REQUIRED','REQUIRED','REVIEWED')),
        CONSTRAINT ck_ai_run_confidence CHECK(confidence IS NULL OR (confidence>=0 AND confidence<=1))
      );
      CREATE INDEX idx_ai_runs_user_created ON ai_runs(user_id,created_at DESC);
      CREATE INDEX idx_ai_runs_operation_created ON ai_runs(operation,created_at DESC);
      CREATE INDEX idx_ai_runs_farm ON ai_runs(farm_id);
      CREATE INDEX idx_ai_runs_status ON ai_runs(status);
    `);
  }

  async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`DROP TABLE IF EXISTS ai_runs CASCADE;`);
  }
}

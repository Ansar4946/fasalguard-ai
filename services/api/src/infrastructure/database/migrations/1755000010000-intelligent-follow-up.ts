import type { MigrationInterface, QueryRunner } from 'typeorm';
export class IntelligentFollowUp1755000010000 implements MigrationInterface {
  name = 'IntelligentFollowUp1755000010000';
  async up(q: QueryRunner): Promise<void> {
    await q.query(
      `CREATE TABLE follow_up_questions(id uuid PRIMARY KEY DEFAULT gen_random_uuid(),scan_id uuid NOT NULL REFERENCES crop_scans(id) ON DELETE CASCADE,library_key varchar(80) NOT NULL,question_text text NOT NULL,display_order integer NOT NULL,context jsonb NOT NULL DEFAULT '{}',prompt_version varchar(40) NOT NULL,created_at timestamptz NOT NULL DEFAULT now(),updated_at timestamptz NOT NULL DEFAULT now(),version integer NOT NULL DEFAULT 1,CONSTRAINT uq_follow_up_scan_library UNIQUE(scan_id,library_key))`,
    );
    await q.query(
      `CREATE INDEX idx_follow_up_questions_scan_order ON follow_up_questions(scan_id,display_order)`,
    );
    await q.query(
      `CREATE TABLE follow_up_answers(id uuid PRIMARY KEY DEFAULT gen_random_uuid(),question_id uuid NOT NULL UNIQUE REFERENCES follow_up_questions(id) ON DELETE CASCADE,farmer_id uuid NOT NULL REFERENCES users(id) ON DELETE RESTRICT,answer_text text NOT NULL CHECK(length(answer_text)<=2000),answered_at timestamptz NOT NULL,created_at timestamptz NOT NULL DEFAULT now(),updated_at timestamptz NOT NULL DEFAULT now(),version integer NOT NULL DEFAULT 1)`,
    );
    await q.query(
      `CREATE TABLE ai_interactions(id uuid PRIMARY KEY DEFAULT gen_random_uuid(),scan_id uuid REFERENCES crop_scans(id) ON DELETE SET NULL,user_id uuid NOT NULL REFERENCES users(id) ON DELETE RESTRICT,purpose varchar(40) NOT NULL,provider varchar(40) NOT NULL,model_id varchar(160) NOT NULL,model_version varchar(80) NOT NULL,prompt_version varchar(40) NOT NULL,input_data jsonb NOT NULL,output_data jsonb NOT NULL,raw_provider_response jsonb NOT NULL,status varchar(24) NOT NULL,failure_code varchar(80),created_at timestamptz NOT NULL DEFAULT now(),updated_at timestamptz NOT NULL DEFAULT now(),version integer NOT NULL DEFAULT 1)`,
    );
    await q.query(
      `CREATE INDEX idx_ai_interactions_scan_created ON ai_interactions(scan_id,created_at DESC)`,
    );
  }
  async down(q: QueryRunner): Promise<void> {
    await q.query('DROP TABLE IF EXISTS ai_interactions');
    await q.query('DROP TABLE IF EXISTS follow_up_answers');
    await q.query('DROP TABLE IF EXISTS follow_up_questions');
  }
}

import type { MigrationInterface, QueryRunner } from 'typeorm';
export class ExpertReviewConsultation1755000013000 implements MigrationInterface {
  name = 'ExpertReviewConsultation1755000013000';
  async up(q: QueryRunner): Promise<void> {
    await q.query(
      `CREATE TABLE expert_reviews(id uuid PRIMARY KEY DEFAULT gen_random_uuid(),scan_id uuid NOT NULL UNIQUE REFERENCES crop_scans(id) ON DELETE CASCADE,status varchar(32) NOT NULL DEFAULT 'PENDING',decision varchar(24),confirmed_condition varchar(200),decision_notes text,recommendation text,recommendation_guideline_id uuid REFERENCES treatment_guidelines(id) ON DELETE RESTRICT,resolved_at timestamptz,created_at timestamptz NOT NULL DEFAULT now(),updated_at timestamptz NOT NULL DEFAULT now(),version integer NOT NULL DEFAULT 1,CONSTRAINT ck_expert_review_status CHECK(status IN('PENDING','ASSIGNED','IN_REVIEW','MORE_INFO_REQUESTED','CONFIRMED','REJECTED','RECOMMENDATION_PROVIDED','RESOLVED')),CONSTRAINT ck_expert_review_decision CHECK(decision IS NULL OR decision IN('CONFIRMED','REJECTED')))`,
    );
    await q.query(
      `CREATE TABLE expert_assignments(id uuid PRIMARY KEY DEFAULT gen_random_uuid(),review_id uuid NOT NULL REFERENCES expert_reviews(id) ON DELETE CASCADE,expert_id uuid NOT NULL REFERENCES users(id) ON DELETE RESTRICT,assigned_by uuid NOT NULL REFERENCES users(id) ON DELETE RESTRICT,assigned_at timestamptz NOT NULL DEFAULT now(),unassigned_at timestamptz,created_at timestamptz NOT NULL DEFAULT now(),updated_at timestamptz NOT NULL DEFAULT now(),version integer NOT NULL DEFAULT 1); CREATE UNIQUE INDEX uq_expert_assignment_active ON expert_assignments(review_id) WHERE unassigned_at IS NULL; CREATE INDEX idx_expert_assignment_expert ON expert_assignments(expert_id,assigned_at DESC)`,
    );
    await q.query(
      `CREATE TABLE consultations(id uuid PRIMARY KEY DEFAULT gen_random_uuid(),farmer_id uuid NOT NULL REFERENCES users(id) ON DELETE RESTRICT,expert_id uuid REFERENCES users(id) ON DELETE RESTRICT,scan_id uuid REFERENCES crop_scans(id) ON DELETE SET NULL,subject varchar(220) NOT NULL,status varchar(24) NOT NULL DEFAULT 'OPEN',created_at timestamptz NOT NULL DEFAULT now(),updated_at timestamptz NOT NULL DEFAULT now(),version integer NOT NULL DEFAULT 1,CONSTRAINT ck_consultation_status CHECK(status IN('OPEN','WAITING_FARMER','WAITING_EXPERT','CLOSED'))); CREATE INDEX idx_consultations_farmer_created ON consultations(farmer_id,created_at DESC); CREATE INDEX idx_consultations_expert_created ON consultations(expert_id,created_at DESC)`,
    );
    await q.query(
      `CREATE TABLE consultation_messages(id uuid PRIMARY KEY DEFAULT gen_random_uuid(),consultation_id uuid NOT NULL REFERENCES consultations(id) ON DELETE CASCADE,sender_id uuid NOT NULL REFERENCES users(id) ON DELETE RESTRICT,type varchar(16) NOT NULL,text text,media_asset_id uuid REFERENCES media_assets(id) ON DELETE RESTRICT,created_at timestamptz NOT NULL DEFAULT now(),updated_at timestamptz NOT NULL DEFAULT now(),version integer NOT NULL DEFAULT 1,CONSTRAINT ck_consultation_message_type CHECK(type IN('TEXT','IMAGE','VOICE_NOTE')),CONSTRAINT ck_consultation_message_content CHECK((type='TEXT' AND text IS NOT NULL AND media_asset_id IS NULL) OR (type IN('IMAGE','VOICE_NOTE') AND media_asset_id IS NOT NULL))); CREATE INDEX idx_consultation_messages_time ON consultation_messages(consultation_id,created_at)`,
    );
    await q.query(
      `CREATE TABLE case_status_history(id uuid PRIMARY KEY DEFAULT gen_random_uuid(),review_id uuid NOT NULL REFERENCES expert_reviews(id) ON DELETE RESTRICT,actor_id uuid REFERENCES users(id) ON DELETE SET NULL,from_status varchar(32),to_status varchar(32) NOT NULL,reason text,metadata jsonb NOT NULL DEFAULT '{}',created_at timestamptz NOT NULL DEFAULT now(),updated_at timestamptz NOT NULL DEFAULT now(),version integer NOT NULL DEFAULT 1); CREATE INDEX idx_case_status_history_review_time ON case_status_history(review_id,created_at)`,
    );
    await q.query(
      `CREATE FUNCTION prevent_case_history_mutation() RETURNS trigger LANGUAGE plpgsql AS $$ BEGIN RAISE EXCEPTION 'case status history is immutable'; END $$; CREATE TRIGGER trg_case_history_immutable BEFORE UPDATE OR DELETE ON case_status_history FOR EACH ROW EXECUTE FUNCTION prevent_case_history_mutation()`,
    );
  }
  async down(q: QueryRunner): Promise<void> {
    await q.query(
      'DROP TRIGGER IF EXISTS trg_case_history_immutable ON case_status_history; DROP FUNCTION IF EXISTS prevent_case_history_mutation; DROP TABLE IF EXISTS case_status_history,consultation_messages,consultations,expert_assignments,expert_reviews CASCADE',
    );
  }
}

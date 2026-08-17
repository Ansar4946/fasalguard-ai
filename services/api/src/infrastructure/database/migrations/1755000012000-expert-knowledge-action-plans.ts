import type { MigrationInterface, QueryRunner } from 'typeorm';
export class ExpertKnowledgeActionPlans1755000012000 implements MigrationInterface {
  name = 'ExpertKnowledgeActionPlans1755000012000';
  async up(q: QueryRunner): Promise<void> {
    await q.query(
      `CREATE TABLE knowledge_articles(id uuid PRIMARY KEY DEFAULT gen_random_uuid(),title varchar(220) NOT NULL,content text NOT NULL,language_code varchar(16) NOT NULL DEFAULT 'en',status varchar(24) NOT NULL DEFAULT 'DRAFT',author_id uuid NOT NULL REFERENCES users(id) ON DELETE RESTRICT,created_at timestamptz NOT NULL DEFAULT now(),updated_at timestamptz NOT NULL DEFAULT now(),version integer NOT NULL DEFAULT 1)`,
    );
    await q.query(
      `CREATE TABLE guideline_sources(id uuid PRIMARY KEY DEFAULT gen_random_uuid(),title varchar(220) NOT NULL,citation text NOT NULL,url text,published_at date,created_by uuid REFERENCES users(id) ON DELETE SET NULL,created_at timestamptz NOT NULL DEFAULT now(),updated_at timestamptz NOT NULL DEFAULT now(),version integer NOT NULL DEFAULT 1)`,
    );
    await q.query(
      `CREATE TABLE treatment_guidelines(id uuid PRIMARY KEY DEFAULT gen_random_uuid(),crop_id uuid NOT NULL REFERENCES crops(id) ON DELETE RESTRICT,crop_variety_id uuid REFERENCES crop_varieties(id) ON DELETE RESTRICT,condition varchar(200) NOT NULL,region varchar(160),growth_stage varchar(100),severity varchar(16),immediate_actions jsonb NOT NULL,preventive_actions jsonb NOT NULL,monitoring_actions jsonb NOT NULL,expert_escalation_criteria jsonb NOT NULL,chemical_guidance jsonb,chemical_guidance_approved boolean NOT NULL DEFAULT false,source_id uuid NOT NULL REFERENCES guideline_sources(id) ON DELETE RESTRICT,author_id uuid REFERENCES users(id) ON DELETE SET NULL,reviewer_id uuid REFERENCES users(id) ON DELETE SET NULL,approved_at timestamptz,review_due_at timestamptz,guideline_version integer NOT NULL DEFAULT 1,status varchar(24) NOT NULL DEFAULT 'DRAFT',created_at timestamptz NOT NULL DEFAULT now(),updated_at timestamptz NOT NULL DEFAULT now(),version integer NOT NULL DEFAULT 1,CONSTRAINT ck_guideline_status CHECK(status IN('DRAFT','UNDER_REVIEW','APPROVED','RETIRED')),CONSTRAINT ck_guideline_approval CHECK((status='APPROVED' AND approved_at IS NOT NULL AND (reviewer_id IS NOT NULL OR author_id IS NULL)) OR status<>'APPROVED'),CONSTRAINT ck_chemical_approval CHECK(chemical_guidance_approved=false OR (status='APPROVED' AND chemical_guidance IS NOT NULL)))`,
    );
    await q.query(
      `CREATE INDEX idx_guidelines_lookup ON treatment_guidelines(crop_id,condition,status)`,
    );
    await q.query(
      `CREATE TABLE guideline_approvals(id uuid PRIMARY KEY DEFAULT gen_random_uuid(),guideline_id uuid NOT NULL REFERENCES treatment_guidelines(id) ON DELETE RESTRICT,actor_id uuid REFERENCES users(id) ON DELETE SET NULL,actor_type varchar(32) NOT NULL,from_status varchar(24) NOT NULL,to_status varchar(24) NOT NULL,notes text,chemical_guidance_approved boolean NOT NULL DEFAULT false,guideline_snapshot jsonb NOT NULL,created_at timestamptz NOT NULL DEFAULT now(),updated_at timestamptz NOT NULL DEFAULT now(),version integer NOT NULL DEFAULT 1)`,
    );
    await q.query(
      `CREATE INDEX idx_guideline_approval_history ON guideline_approvals(guideline_id,created_at)`,
    );
    await q.query(
      `CREATE FUNCTION prevent_approval_mutation() RETURNS trigger LANGUAGE plpgsql AS $$ BEGIN RAISE EXCEPTION 'guideline approval history is immutable'; END $$`,
    );
    await q.query(
      `CREATE TRIGGER trg_guideline_approval_immutable BEFORE UPDATE OR DELETE ON guideline_approvals FOR EACH ROW EXECUTE FUNCTION prevent_approval_mutation()`,
    );
    await q.query(
      `CREATE TABLE action_plans(id uuid PRIMARY KEY DEFAULT gen_random_uuid(),scan_id uuid NOT NULL REFERENCES crop_scans(id) ON DELETE CASCADE,guideline_id uuid NOT NULL REFERENCES treatment_guidelines(id) ON DELETE RESTRICT,guideline_version integer NOT NULL,created_for_user_id uuid NOT NULL REFERENCES users(id) ON DELETE RESTRICT,severity varchar(16) NOT NULL,status varchar(24) NOT NULL DEFAULT 'ACTIVE',generated_at timestamptz NOT NULL,created_at timestamptz NOT NULL DEFAULT now(),updated_at timestamptz NOT NULL DEFAULT now(),version integer NOT NULL DEFAULT 1)`,
    );
    await q.query(
      `CREATE INDEX idx_action_plan_scan_created ON action_plans(scan_id,created_at DESC)`,
    );
    await q.query(
      `CREATE TABLE action_plan_steps(id uuid PRIMARY KEY DEFAULT gen_random_uuid(),action_plan_id uuid NOT NULL REFERENCES action_plans(id) ON DELETE CASCADE,type varchar(32) NOT NULL,instruction text NOT NULL,display_order integer NOT NULL,source_guideline_id uuid NOT NULL REFERENCES treatment_guidelines(id) ON DELETE RESTRICT,source_field varchar(48) NOT NULL,created_at timestamptz NOT NULL DEFAULT now(),updated_at timestamptz NOT NULL DEFAULT now(),version integer NOT NULL DEFAULT 1)`,
    );
    await q.query(
      `CREATE INDEX idx_action_plan_steps_order ON action_plan_steps(action_plan_id,display_order)`,
    );
    const crop = (await q.query(`SELECT id FROM crops WHERE name='Cotton' LIMIT 1`)) as Array<{
      id: string;
    }>;
    if (crop[0]) {
      const source = (await q.query(
        `INSERT INTO guideline_sources(title,citation)VALUES('FasalGuard Hackathon Safe Generic Guidance','System seed containing only non-chemical observation and escalation actions.')RETURNING id`,
      )) as Array<{ id: string }>;
      const guideline = (await q.query(
        `INSERT INTO treatment_guidelines(crop_id,condition,immediate_actions,preventive_actions,monitoring_actions,expert_escalation_criteria,source_id,approved_at,review_due_at,guideline_version,status)VALUES($1,'GENERIC_CROP_HEALTH_CONCERN','["Inspect nearby plants","Photograph the affected area"]','["Maintain field hygiene"]','["Monitor spread"]','["Request expert review"]',$2,now(),now()+interval '90 days',1,'APPROVED')RETURNING *`,
        [crop[0].id, source[0]!.id],
      )) as Array<Record<string, unknown>>;
      await q.query(
        `INSERT INTO guideline_approvals(guideline_id,actor_id,actor_type,from_status,to_status,notes,chemical_guidance_approved,guideline_snapshot)VALUES($1,NULL,'SYSTEM_SEED','DRAFT','APPROVED','Hackathon safe generic guidance only',false,$2)`,
        [guideline[0]!.id, JSON.stringify(guideline[0])],
      );
    }
  }
  async down(q: QueryRunner): Promise<void> {
    await q.query('DROP TABLE IF EXISTS action_plan_steps');
    await q.query('DROP TABLE IF EXISTS action_plans');
    await q.query('DROP TRIGGER IF EXISTS trg_guideline_approval_immutable ON guideline_approvals');
    await q.query('DROP FUNCTION IF EXISTS prevent_approval_mutation');
    await q.query('DROP TABLE IF EXISTS guideline_approvals');
    await q.query('DROP TABLE IF EXISTS treatment_guidelines');
    await q.query('DROP TABLE IF EXISTS guideline_sources');
    await q.query('DROP TABLE IF EXISTS knowledge_articles');
  }
}

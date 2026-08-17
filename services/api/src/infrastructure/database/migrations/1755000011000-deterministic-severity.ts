import type { MigrationInterface, QueryRunner } from 'typeorm';
export class DeterministicSeverity1755000011000 implements MigrationInterface {
  name = 'DeterministicSeverity1755000011000';
  async up(q: QueryRunner): Promise<void> {
    await q.query(
      `CREATE TABLE severity_rulesets(id uuid PRIMARY KEY DEFAULT gen_random_uuid(),key varchar(80) NOT NULL,engine_version varchar(40) NOT NULL,status varchar(32) NOT NULL,weights jsonb NOT NULL,thresholds jsonb NOT NULL,source text NOT NULL,active boolean NOT NULL DEFAULT true,created_at timestamptz NOT NULL DEFAULT now(),updated_at timestamptz NOT NULL DEFAULT now(),version integer NOT NULL DEFAULT 1,CONSTRAINT uq_severity_ruleset_version UNIQUE(key,engine_version))`,
    );
    await q.query(
      `CREATE TABLE severity_assessments(id uuid PRIMARY KEY DEFAULT gen_random_uuid(),scan_id uuid NOT NULL REFERENCES crop_scans(id) ON DELETE CASCADE,ruleset_id uuid NOT NULL REFERENCES severity_rulesets(id) ON DELETE RESTRICT,severity varchar(16) NOT NULL CHECK(severity IN('LOW','MODERATE','HIGH','CRITICAL')),calculated_score double precision NOT NULL CHECK(calculated_score>=0 AND calculated_score<=100),factors jsonb NOT NULL,weights_used jsonb NOT NULL,evidence_references jsonb NOT NULL,engine_version varchar(40) NOT NULL,explanation jsonb NOT NULL,expert_escalation boolean NOT NULL,escalation_reasons jsonb NOT NULL,generated_at timestamptz NOT NULL,created_at timestamptz NOT NULL DEFAULT now(),updated_at timestamptz NOT NULL DEFAULT now(),version integer NOT NULL DEFAULT 1)`,
    );
    await q.query(
      `CREATE INDEX idx_severity_assessment_scan_generated ON severity_assessments(scan_id,generated_at DESC)`,
    );
    await q.query(
      `INSERT INTO severity_rulesets(key,engine_version,status,weights,thresholds,source) VALUES('DEMO_RULESET','demo-severity-v1.0.0','DEMO_UNVERIFIED','{"imageConfidenceRisk":20,"visualExtent":15,"fieldAffected":20,"spreadRate":15,"historyTrend":10,"satelliteDecline":8,"nearbyReports":5,"weatherRisk":7}','{"moderate":30,"high":55,"critical":80}','DEMO ONLY — illustrative weights and cutoffs; not agronomist-approved and not suitable for production decisions.')`,
    );
  }
  async down(q: QueryRunner): Promise<void> {
    await q.query('DROP TABLE IF EXISTS severity_assessments');
    await q.query('DROP TABLE IF EXISTS severity_rulesets');
  }
}

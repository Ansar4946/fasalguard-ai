import type { MigrationInterface, QueryRunner } from 'typeorm';
export class FieldRiskEngine1755000015000 implements MigrationInterface {
  name = 'FieldRiskEngine1755000015000';
  async up(q: QueryRunner): Promise<void> {
    await q.query(
      `CREATE TABLE field_risk_rulesets(id uuid PRIMARY KEY DEFAULT gen_random_uuid(),ruleset_version varchar(40) NOT NULL UNIQUE,weights jsonb NOT NULL,thresholds jsonb NOT NULL,validity_hours integer NOT NULL CHECK(validity_hours BETWEEN 1 AND 72),validation_status varchar(32) NOT NULL,description text NOT NULL,active boolean NOT NULL DEFAULT true,created_at timestamptz NOT NULL DEFAULT now(),updated_at timestamptz NOT NULL DEFAULT now(),version integer NOT NULL DEFAULT 1); CREATE UNIQUE INDEX uq_field_risk_active ON field_risk_rulesets(active) WHERE active=true`,
    );
    await q.query(
      `INSERT INTO field_risk_rulesets(ruleset_version,weights,thresholds,validity_hours,validation_status,description)VALUES('EXPLAINABLE_DEMO_V1','{"weatherRisk":0.25,"nearbyReports":0.2,"confirmedOutbreak":0.2,"satelliteDecline":0.2,"fieldHistory":0.15}','{"low":20,"moderate":40,"high":60,"critical":80}',6,'DEMO_UNVERIFIED','Explainable inspection-priority ruleset. Not a disease forecasting model and not expert approved.')`,
    );
    await q.query(
      `CREATE TABLE field_risk_assessments(id uuid PRIMARY KEY DEFAULT gen_random_uuid(),field_id uuid NOT NULL REFERENCES fields(id) ON DELETE CASCADE,crop_cycle_id uuid REFERENCES crop_cycles(id) ON DELETE SET NULL,score double precision NOT NULL CHECK(score BETWEEN 0 AND 100),level varchar(16) NOT NULL,evidence jsonb NOT NULL,factors jsonb NOT NULL,ruleset_version varchar(40) NOT NULL,trigger_source varchar(32) NOT NULL,valid_until timestamptz NOT NULL,created_at timestamptz NOT NULL DEFAULT now(),updated_at timestamptz NOT NULL DEFAULT now(),version integer NOT NULL DEFAULT 1,CONSTRAINT ck_field_risk_level CHECK(level IN('VERY_LOW','LOW','MODERATE','HIGH','CRITICAL')),CONSTRAINT ck_field_risk_trigger CHECK(trigger_source IN('API_REQUEST','WEATHER_UPDATE','SATELLITE_UPDATE','OUTBREAK_UPDATE','FARMER_SCAN'))); CREATE INDEX idx_field_risk_field_created ON field_risk_assessments(field_id,created_at DESC); CREATE INDEX idx_field_risk_valid ON field_risk_assessments(field_id,valid_until DESC)`,
    );
  }
  async down(q: QueryRunner): Promise<void> {
    await q.query(`DROP TABLE IF EXISTS field_risk_assessments,field_risk_rulesets CASCADE`);
  }
}

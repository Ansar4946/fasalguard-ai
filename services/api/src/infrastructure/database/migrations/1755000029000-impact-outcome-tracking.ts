import type { MigrationInterface, QueryRunner } from 'typeorm';

export class ImpactOutcomeTracking1755000029000 implements MigrationInterface {
  name = 'ImpactOutcomeTracking1755000029000';

  async up(q: QueryRunner): Promise<void> {
    await q.query(`
      ALTER TABLE farm_incidents
        ADD COLUMN investigation_run_id uuid REFERENCES farm_brain_runs(id) ON DELETE SET NULL,
        ADD COLUMN initial_vegetation_score double precision,
        ADD COLUMN initial_affected_area_hectares double precision,
        ADD COLUMN follow_up_risk_score double precision,
        ADD COLUMN follow_up_vegetation_score double precision,
        ADD COLUMN follow_up_affected_area_hectares double precision,
        ADD COLUMN farmer_confirmed boolean,
        ADD COLUMN farmer_confirmed_at timestamptz,
        ADD COLUMN expert_confirmed boolean,
        ADD COLUMN expert_confirmed_at timestamptz,
        ADD COLUMN expert_confirmed_by uuid REFERENCES users(id) ON DELETE SET NULL,
        ADD CONSTRAINT ck_farm_incident_follow_up_risk CHECK(follow_up_risk_score IS NULL OR follow_up_risk_score BETWEEN 0 AND 1);
      CREATE INDEX idx_farm_incidents_investigation_run ON farm_incidents(investigation_run_id) WHERE investigation_run_id IS NOT NULL;

      ALTER TABLE notifications ADD COLUMN incident_id uuid REFERENCES farm_incidents(id) ON DELETE SET NULL;
      CREATE INDEX idx_notifications_incident ON notifications(incident_id) WHERE incident_id IS NOT NULL;

      ALTER TABLE farm_interventions
        ADD COLUMN started_at timestamptz,
        ADD COLUMN completed_at timestamptz,
        ADD CONSTRAINT ck_farm_intervention_completion CHECK((status='COMPLETED')=(completed_at IS NOT NULL));
    `);
  }

  async down(q: QueryRunner): Promise<void> {
    await q.query(`
      ALTER TABLE farm_interventions
        DROP CONSTRAINT IF EXISTS ck_farm_intervention_completion,
        DROP COLUMN IF EXISTS completed_at,
        DROP COLUMN IF EXISTS started_at;

      DROP INDEX IF EXISTS idx_notifications_incident;
      ALTER TABLE notifications DROP COLUMN IF EXISTS incident_id;

      DROP INDEX IF EXISTS idx_farm_incidents_investigation_run;
      ALTER TABLE farm_incidents
        DROP CONSTRAINT IF EXISTS ck_farm_incident_follow_up_risk,
        DROP COLUMN IF EXISTS expert_confirmed_by,
        DROP COLUMN IF EXISTS expert_confirmed_at,
        DROP COLUMN IF EXISTS expert_confirmed,
        DROP COLUMN IF EXISTS farmer_confirmed_at,
        DROP COLUMN IF EXISTS farmer_confirmed,
        DROP COLUMN IF EXISTS follow_up_affected_area_hectares,
        DROP COLUMN IF EXISTS follow_up_vegetation_score,
        DROP COLUMN IF EXISTS follow_up_risk_score,
        DROP COLUMN IF EXISTS initial_affected_area_hectares,
        DROP COLUMN IF EXISTS initial_vegetation_score,
        DROP COLUMN IF EXISTS investigation_run_id;
    `);
  }
}

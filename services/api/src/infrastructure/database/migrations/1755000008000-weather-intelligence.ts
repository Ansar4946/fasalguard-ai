import type { MigrationInterface, QueryRunner } from 'typeorm';
export class WeatherIntelligence1755000008000 implements MigrationInterface {
  name = 'WeatherIntelligence1755000008000';
  async up(q: QueryRunner): Promise<void> {
    await q.query(
      `CREATE TABLE weather_snapshots (id uuid PRIMARY KEY DEFAULT gen_random_uuid(), field_id uuid NOT NULL REFERENCES fields(id) ON DELETE CASCADE, provider varchar(32) NOT NULL, observed_at timestamptz NOT NULL, cache_bucket timestamptz NOT NULL, values jsonb NOT NULL, raw_metadata jsonb NOT NULL DEFAULT '{}', created_at timestamptz NOT NULL DEFAULT now(), updated_at timestamptz NOT NULL DEFAULT now(), version integer NOT NULL DEFAULT 1, CONSTRAINT uq_weather_snapshot_bucket UNIQUE(field_id,provider,cache_bucket))`,
    );
    await q.query(
      `CREATE TABLE weather_forecasts (id uuid PRIMARY KEY DEFAULT gen_random_uuid(), field_id uuid NOT NULL REFERENCES fields(id) ON DELETE CASCADE, provider varchar(32) NOT NULL, generated_at timestamptz NOT NULL, valid_from timestamptz NOT NULL, valid_to timestamptz NOT NULL, cache_bucket timestamptz NOT NULL, points jsonb NOT NULL, created_at timestamptz NOT NULL DEFAULT now(), updated_at timestamptz NOT NULL DEFAULT now(), version integer NOT NULL DEFAULT 1, CONSTRAINT uq_weather_forecast_bucket UNIQUE(field_id,provider,cache_bucket))`,
    );
    await q.query(
      `CREATE TABLE crop_weather_rules (id uuid PRIMARY KEY DEFAULT gen_random_uuid(), crop_id uuid NOT NULL REFERENCES crops(id) ON DELETE RESTRICT, category varchar(48) NOT NULL, suitability varchar(24) NOT NULL, priority integer NOT NULL DEFAULT 0, conditions jsonb NOT NULL, message text NOT NULL, source text NOT NULL, source_url text, validation_status varchar(32) NOT NULL, approved_by_expert_id uuid REFERENCES expert_profiles(id) ON DELETE RESTRICT, approved_at timestamptz, active boolean NOT NULL DEFAULT true, created_at timestamptz NOT NULL DEFAULT now(), updated_at timestamptz NOT NULL DEFAULT now(), version integer NOT NULL DEFAULT 1, CONSTRAINT ck_weather_rule_approval CHECK ((validation_status='EXPERT_APPROVED' AND approved_by_expert_id IS NOT NULL AND approved_at IS NOT NULL) OR (validation_status<>'EXPERT_APPROVED' AND approved_by_expert_id IS NULL AND approved_at IS NULL)))`,
    );
    await q.query(
      `CREATE INDEX idx_crop_weather_rules_crop_active ON crop_weather_rules(crop_id,active)`,
    );
    await q.query(
      `CREATE TABLE weather_risk_assessments (id uuid PRIMARY KEY DEFAULT gen_random_uuid(), field_id uuid NOT NULL REFERENCES fields(id) ON DELETE CASCADE, crop_cycle_id uuid REFERENCES crop_cycles(id) ON DELETE SET NULL, assessed_at timestamptz NOT NULL, overall_suitability varchar(24), risks jsonb NOT NULL, validation_summary jsonb NOT NULL, created_at timestamptz NOT NULL DEFAULT now(), updated_at timestamptz NOT NULL DEFAULT now(), version integer NOT NULL DEFAULT 1)`,
    );
    await q.query(
      `CREATE INDEX idx_weather_assessment_field_time ON weather_risk_assessments(field_id,assessed_at DESC)`,
    );
    await q.query(
      `INSERT INTO crop_weather_rules(crop_id,category,suitability,priority,conditions,message,source,validation_status) SELECT id,'HIGH_HUMIDITY','CAUTION',40,'{"all":[{"variable":"relativeHumidityPercent","operator":"gte","value":85}]}'::jsonb,'Demo signal: sustained high humidity may warrant field observation.','DEMO ONLY — illustrative threshold; not an agronomic source or recommendation.','DEMO_UNVERIFIED' FROM crops WHERE lower(name)='cotton'`,
    );
    await q.query(
      `INSERT INTO crop_weather_rules(crop_id,category,suitability,priority,conditions,message,source,validation_status) SELECT id,'STRONG_WIND','HARMFUL',80,'{"any":[{"variable":"windGustKph","operator":"gte","value":45},{"variable":"windSpeedKph","operator":"gte","value":30}]}'::jsonb,'Demo signal: wind conditions may make field operations unsafe.','DEMO ONLY — illustrative threshold; not an agronomic source or recommendation.','DEMO_UNVERIFIED' FROM crops WHERE lower(name)='cotton'`,
    );
  }
  async down(q: QueryRunner): Promise<void> {
    await q.query('DROP TABLE IF EXISTS weather_risk_assessments');
    await q.query('DROP TABLE IF EXISTS crop_weather_rules');
    await q.query('DROP TABLE IF EXISTS weather_forecasts');
    await q.query('DROP TABLE IF EXISTS weather_snapshots');
  }
}

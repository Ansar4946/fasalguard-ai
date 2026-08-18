import type { MigrationInterface, QueryRunner } from 'typeorm';
export class WeatherRiskAlerts1755000025000 implements MigrationInterface {
  name = 'WeatherRiskAlerts1755000025000';
  async up(q: QueryRunner): Promise<void> {
    await q.query(
      `CREATE TABLE weather_risk_alerts (id uuid PRIMARY KEY DEFAULT gen_random_uuid(), field_id uuid NOT NULL REFERENCES fields(id) ON DELETE CASCADE, category varchar(48) NOT NULL, suitability varchar(24) NOT NULL, notified_at timestamptz NOT NULL, created_at timestamptz NOT NULL DEFAULT now(), updated_at timestamptz NOT NULL DEFAULT now(), version integer NOT NULL DEFAULT 1, CONSTRAINT uq_weather_risk_alert_field_category UNIQUE(field_id,category))`,
    );
    await q.query(`CREATE INDEX idx_weather_risk_alerts_field ON weather_risk_alerts(field_id)`);
  }
  async down(q: QueryRunner): Promise<void> {
    await q.query('DROP TABLE IF EXISTS weather_risk_alerts');
  }
}

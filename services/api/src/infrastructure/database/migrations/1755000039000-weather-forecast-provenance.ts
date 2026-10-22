import type { MigrationInterface, QueryRunner } from 'typeorm';

export class WeatherForecastProvenance1755000039000 implements MigrationInterface {
  name = 'WeatherForecastProvenance1755000039000';
  async up(q: QueryRunner): Promise<void> {
    await q.query(
      `ALTER TABLE weather_forecasts ADD COLUMN metadata jsonb NOT NULL DEFAULT '{}'::jsonb`,
    );
  }
  async down(q: QueryRunner): Promise<void> {
    await q.query(`ALTER TABLE weather_forecasts DROP COLUMN metadata`);
  }
}

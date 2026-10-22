import type { MigrationInterface, QueryRunner } from 'typeorm';

/** F13 baseline: provenance-carrying historical yield observations and the aggregated reference
 *  ranges derived from them. No predictions are stored and no rows are seeded. */
export class YieldReference1755000045000 implements MigrationInterface {
  name = 'YieldReference1755000045000';

  async up(q: QueryRunner): Promise<void> {
    await q.query(
      `CREATE TABLE yield_observations(
         id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
         crop varchar(64) NOT NULL,
         province varchar(64) NOT NULL,
         district varchar(64) NOT NULL,
         season varchar(16) NOT NULL,
         year integer NOT NULL,
         published_value numeric(14,4) NOT NULL,
         published_unit varchar(32) NOT NULL,
         yield_kg_per_ha numeric(12,3) NOT NULL,
         source_name varchar(200) NOT NULL,
         source_url text NOT NULL,
         licence_status varchar(24) NOT NULL,
         import_batch_id uuid NOT NULL,
         created_by varchar(120) NOT NULL,
         created_at timestamptz NOT NULL DEFAULT now(),
         CONSTRAINT uq_yield_observation UNIQUE(crop,district,season,year),
         CONSTRAINT ck_yield_obs_season CHECK(season IN('KHARIF','RABI','ANNUAL')),
         CONSTRAINT ck_yield_obs_year CHECK(year BETWEEN 1900 AND 2100),
         CONSTRAINT ck_yield_obs_value CHECK(published_value>0 AND yield_kg_per_ha>0 AND yield_kg_per_ha<=100000),
         CONSTRAINT ck_yield_obs_unit CHECK(published_unit IN('kg_per_ha','kg_per_acre','maund_per_acre','maund_per_ha','tonne_per_ha')),
         CONSTRAINT ck_yield_obs_licence CHECK(licence_status IN('UNVERIFIED','VERIFIED_OPEN','VERIFIED_PERMISSION')),
         CONSTRAINT ck_yield_obs_provenance CHECK(length(btrim(source_name))>0 AND source_url ~ '^https?://' AND length(btrim(created_by))>0)
       )`,
    );
    await q.query(`CREATE INDEX idx_yield_obs_batch ON yield_observations(import_batch_id)`);
    await q.query(
      `CREATE TABLE yield_reference_statistics(
         id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
         crop varchar(64) NOT NULL,
         district varchar(64) NOT NULL,
         season varchar(16) NOT NULL,
         n integer NOT NULL,
         min_kg_per_ha numeric(12,3) NOT NULL,
         p25_kg_per_ha numeric(12,3) NOT NULL,
         median_kg_per_ha numeric(12,3) NOT NULL,
         p75_kg_per_ha numeric(12,3) NOT NULL,
         max_kg_per_ha numeric(12,3) NOT NULL,
         years_covered integer[] NOT NULL,
         source_names text[] NOT NULL,
         source_urls text[] NOT NULL,
         licence_statuses text[] NOT NULL,
         computed_at timestamptz NOT NULL DEFAULT now(),
         CONSTRAINT uq_yield_reference UNIQUE(crop,district,season),
         CONSTRAINT ck_yield_ref_n CHECK(n>0)
       )`,
    );
  }

  async down(q: QueryRunner): Promise<void> {
    await q.query(`DROP TABLE IF EXISTS yield_reference_statistics`);
    await q.query(`DROP TABLE IF EXISTS yield_observations`);
  }
}

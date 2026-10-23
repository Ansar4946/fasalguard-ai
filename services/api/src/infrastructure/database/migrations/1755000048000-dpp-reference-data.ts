import type { MigrationInterface, QueryRunner } from 'typeorm';

/** Dawai Check: official Pakistani DPP (Department of Plant Protection) reference data.
 *  - dpp_notified_products: the Form-16 notified list (S.R.O. 636(I)/2005): ingredient + concentration +
 *    formulation rows. It has NO brand names, companies or registration numbers and is partial.
 *  - banned_pesticide_products: banned pre-mixture BRANDS (List B, SRO 624(I)/96).
 *  - banned_pesticide_ingredients gets provenance columns (the DPP banned list A).
 *  - pesticide_checks stores the new additive result fields so a saved result re-presents identically.
 *  The demo tables stay untouched and keep working. */
export class DppReferenceData1755000048000 implements MigrationInterface {
  name = 'DppReferenceData1755000048000';

  async up(q: QueryRunner): Promise<void> {
    await q.query(`CREATE EXTENSION IF NOT EXISTS pg_trgm`);
    await q.query(
      `CREATE TABLE dpp_notified_products(
         id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
         serial integer NOT NULL,
         product_text varchar(300) NOT NULL,
         ingredients text[] NOT NULL DEFAULT '{}',
         ingredients_normalized text[] NOT NULL DEFAULT '{}',
         concentration_text varchar(300),
         formulations text[] NOT NULL DEFAULT '{}',
         category varchar(40),
         uses text,
         who_class varchar(40),
         notification varchar(200) NOT NULL,
         source varchar(300) NOT NULL,
         retrieved_on date NOT NULL,
         created_at timestamptz NOT NULL DEFAULT now(),
         updated_at timestamptz NOT NULL DEFAULT now(),
         CONSTRAINT uq_dpp_notified_serial UNIQUE(serial)
       )`,
    );
    await q.query(
      `CREATE INDEX idx_dpp_notified_ingredients ON dpp_notified_products USING gin(ingredients_normalized)`,
    );
    await q.query(
      `CREATE TABLE banned_pesticide_products(
         id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
         brand_name varchar(160) NOT NULL,
         brand_normalized varchar(160) NOT NULL,
         formulation varchar(60),
         common_name varchar(300),
         ingredients_normalized text[] NOT NULL DEFAULT '{}',
         notification_number varchar(80) NOT NULL,
         notification_date date,
         source varchar(300) NOT NULL,
         retrieved_on date NOT NULL,
         created_at timestamptz NOT NULL DEFAULT now(),
         updated_at timestamptz NOT NULL DEFAULT now(),
         CONSTRAINT uq_banned_pesticide_product_brand UNIQUE(brand_normalized)
       )`,
    );
    await q.query(
      `CREATE INDEX idx_banned_products_brand_trgm ON banned_pesticide_products USING gin(brand_normalized gin_trgm_ops)`,
    );
    await q.query(
      `ALTER TABLE banned_pesticide_ingredients
         ADD COLUMN position_in_pakistan varchar(400),
         ADD COLUMN notification_number varchar(80),
         ADD COLUMN notification_date date,
         ADD COLUMN retrieved_on date`,
    );
    await q.query(
      `ALTER TABLE pesticide_checks
         ADD COLUMN list_coverage varchar(16) NOT NULL DEFAULT 'DEMO',
         ADD COLUMN matched_notified jsonb,
         ADD COLUMN banned_match jsonb,
         ADD CONSTRAINT ck_pesticide_check_coverage CHECK(list_coverage IN('DEMO','DPP_PARTIAL'))`,
    );
  }

  async down(q: QueryRunner): Promise<void> {
    await q.query(
      `ALTER TABLE pesticide_checks
         DROP CONSTRAINT IF EXISTS ck_pesticide_check_coverage,
         DROP COLUMN IF EXISTS banned_match,
         DROP COLUMN IF EXISTS matched_notified,
         DROP COLUMN IF EXISTS list_coverage`,
    );
    await q.query(
      `ALTER TABLE banned_pesticide_ingredients
         DROP COLUMN IF EXISTS retrieved_on,
         DROP COLUMN IF EXISTS notification_date,
         DROP COLUMN IF EXISTS notification_number,
         DROP COLUMN IF EXISTS position_in_pakistan`,
    );
    await q.query(`DROP TABLE IF EXISTS banned_pesticide_products`);
    await q.query(`DROP TABLE IF EXISTS dpp_notified_products`);
  }
}

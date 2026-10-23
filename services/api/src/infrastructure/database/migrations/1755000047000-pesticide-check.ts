import type { MigrationInterface, QueryRunner } from 'typeorm';

/** Dawai Check: pesticide reference lists, the banned-ingredient list and per-user screening
 *  results. Also allows the `pesticide-label` media purpose and the LABEL_READING AI-run operation.
 *  pg_trgm ships with PostgreSQL contrib (included in the postgis image). The extension is left in
 *  place on down() because other objects may come to depend on it. */
export class PesticideCheck1755000047000 implements MigrationInterface {
  name = 'PesticideCheck1755000047000';

  async up(q: QueryRunner): Promise<void> {
    await q.query(`CREATE EXTENSION IF NOT EXISTS pg_trgm`);
    await q.query(
      `CREATE TABLE pesticide_products(
         id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
         brand_name varchar(160) NOT NULL,
         brand_normalized varchar(160) NOT NULL,
         active_ingredient varchar(200) NOT NULL,
         concentration varchar(40),
         formulation varchar(16),
         company varchar(200),
         registration_no varchar(60),
         reference_price_rs numeric(12,2),
         pack_size varchar(40),
         crops text[] NOT NULL DEFAULT '{}',
         source varchar(300) NOT NULL,
         is_demo boolean NOT NULL DEFAULT true,
         created_at timestamptz NOT NULL DEFAULT now(),
         updated_at timestamptz NOT NULL DEFAULT now(),
         CONSTRAINT uq_pesticide_product_brand UNIQUE(brand_normalized),
         CONSTRAINT ck_pesticide_product_price CHECK(reference_price_rs IS NULL OR reference_price_rs>0)
       )`,
    );
    await q.query(
      `CREATE INDEX idx_pesticide_products_brand_trgm ON pesticide_products USING gin(brand_normalized gin_trgm_ops)`,
    );
    await q.query(
      `CREATE TABLE banned_pesticide_ingredients(
         id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
         ingredient varchar(160) NOT NULL,
         ingredient_normalized varchar(160) NOT NULL,
         reason varchar(400),
         source varchar(300) NOT NULL,
         is_demo boolean NOT NULL DEFAULT true,
         created_at timestamptz NOT NULL DEFAULT now(),
         updated_at timestamptz NOT NULL DEFAULT now(),
         CONSTRAINT uq_banned_pesticide_ingredient UNIQUE(ingredient_normalized)
       )`,
    );
    await q.query(
      `CREATE TABLE pesticide_checks(
         id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
         user_id uuid NOT NULL REFERENCES users(id) ON DELETE CASCADE,
         media_asset_id uuid REFERENCES media_assets(id) ON DELETE SET NULL,
         input_mode varchar(10) NOT NULL,
         extracted jsonb NOT NULL DEFAULT '{}'::jsonb,
         matched_product_id uuid REFERENCES pesticide_products(id) ON DELETE SET NULL,
         match_similarity numeric(5,4),
         verdict varchar(16) NOT NULL,
         score integer NOT NULL,
         demo_dataset boolean NOT NULL DEFAULT false,
         checks jsonb NOT NULL DEFAULT '[]'::jsonb,
         language varchar(2) NOT NULL DEFAULT 'en',
         provider varchar(40) NOT NULL,
         model varchar(120) NOT NULL,
         latency_ms integer NOT NULL DEFAULT 0,
         created_at timestamptz NOT NULL DEFAULT now(),
         CONSTRAINT ck_pesticide_check_mode CHECK(input_mode IN('photo','manual')),
         CONSTRAINT ck_pesticide_check_verdict CHECK(verdict IN('VERIFIED','SUSPICIOUS','HIGH_RISK','UNREADABLE')),
         CONSTRAINT ck_pesticide_check_score CHECK(score BETWEEN 0 AND 100),
         CONSTRAINT ck_pesticide_check_language CHECK(language IN('en','ur'))
       )`,
    );
    await q.query(
      `CREATE INDEX idx_pesticide_checks_user_created ON pesticide_checks(user_id,created_at DESC)`,
    );
    await q.query(`ALTER TABLE media_assets DROP CONSTRAINT ck_media_purpose`);
    await q.query(
      `ALTER TABLE media_assets ADD CONSTRAINT ck_media_purpose CHECK(purpose IN ('crop-scan','field-inspection','expert-review','voice-note','satellite','report','pesticide-label'))`,
    );
    await q.query(`ALTER TABLE ai_runs DROP CONSTRAINT ck_ai_run_operation`);
    await q.query(
      `ALTER TABLE ai_runs ADD CONSTRAINT ck_ai_run_operation CHECK(operation IN(
         'CROP_ANALYSIS','FARM_HEALTH_ANALYSIS','ROADMAP_GENERATION','INCIDENT_INVESTIGATION',
         'FOLLOW_UP_ANALYSIS','WEATHER_RISK_ANALYSIS','SATELLITE_RISK_ANALYSIS','WEEKLY_SUMMARY','LABEL_READING'))`,
    );
  }

  async down(q: QueryRunner): Promise<void> {
    await q.query(`DELETE FROM ai_runs WHERE operation='LABEL_READING'`);
    await q.query(`ALTER TABLE ai_runs DROP CONSTRAINT ck_ai_run_operation`);
    await q.query(
      `ALTER TABLE ai_runs ADD CONSTRAINT ck_ai_run_operation CHECK(operation IN(
         'CROP_ANALYSIS','FARM_HEALTH_ANALYSIS','ROADMAP_GENERATION','INCIDENT_INVESTIGATION',
         'FOLLOW_UP_ANALYSIS','WEATHER_RISK_ANALYSIS','SATELLITE_RISK_ANALYSIS','WEEKLY_SUMMARY'))`,
    );
    await q.query(`DROP TABLE IF EXISTS pesticide_checks`);
    await q.query(`DELETE FROM media_assets WHERE purpose='pesticide-label'`);
    await q.query(`ALTER TABLE media_assets DROP CONSTRAINT ck_media_purpose`);
    await q.query(
      `ALTER TABLE media_assets ADD CONSTRAINT ck_media_purpose CHECK(purpose IN ('crop-scan','field-inspection','expert-review','voice-note','satellite','report'))`,
    );
    await q.query(`DROP TABLE IF EXISTS banned_pesticide_ingredients`);
    await q.query(`DROP TABLE IF EXISTS pesticide_products`);
  }
}

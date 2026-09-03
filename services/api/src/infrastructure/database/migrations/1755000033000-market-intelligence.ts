import type { MigrationInterface, QueryRunner } from 'typeorm';

export class MarketIntelligence1755000033000 implements MigrationInterface {
  name = 'MarketIntelligence1755000033000';

  async up(q: QueryRunner): Promise<void> {
    await q.query(`
      CREATE TABLE mandi_prices (
        id uuid PRIMARY KEY DEFAULT uuid_generate_v4(),
        crop_name varchar(120) NOT NULL,
        market_name varchar(160) NOT NULL,
        district varchar(120) NOT NULL,
        province varchar(120) NOT NULL,
        minimum_price integer NOT NULL,
        maximum_price integer NOT NULL,
        average_price integer NOT NULL,
        quantity integer NOT NULL DEFAULT 100,
        unit varchar(24) NOT NULL,
        source varchar(40) NOT NULL,
        source_identifier varchar(255) NOT NULL,
        source_url varchar(500) NOT NULL,
        price_date date NOT NULL,
        created_at timestamptz NOT NULL DEFAULT now(),
        updated_at timestamptz NOT NULL DEFAULT now(),
        version integer NOT NULL DEFAULT 1,
        CONSTRAINT uq_mandi_prices_observation UNIQUE(crop_name, market_name, price_date, source),
        CONSTRAINT ck_mandi_prices_positive CHECK(minimum_price > 0 AND maximum_price > 0 AND average_price > 0 AND quantity > 0),
        CONSTRAINT ck_mandi_prices_order CHECK(minimum_price <= average_price AND average_price <= maximum_price)
      );
      CREATE INDEX idx_mandi_prices_crop_date ON mandi_prices(crop_name, price_date DESC);
      CREATE INDEX idx_mandi_prices_market_date ON mandi_prices(market_name, price_date DESC);
      CREATE INDEX idx_mandi_prices_location_date ON mandi_prices(province, district, price_date DESC);
    `);
  }

  async down(q: QueryRunner): Promise<void> {
    await q.query('DROP TABLE IF EXISTS mandi_prices');
  }
}

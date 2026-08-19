import type { MigrationInterface, QueryRunner } from 'typeorm';

export class StripePayments1755000032000 implements MigrationInterface {
  name = 'StripePayments1755000032000';

  async up(q: QueryRunner): Promise<void> {
    await q.query(`
      ALTER TABLE subscription_plans ADD COLUMN stripe_price_id varchar(255);
      -- Reuses the existing subscriptions.provider_customer_reference column (already real,
      -- already generic) for the Stripe customer id — no new column needed.
      CREATE INDEX idx_subscriptions_provider_customer ON subscriptions(provider_customer_reference) WHERE provider_customer_reference IS NOT NULL;

      ALTER TABLE subscription_plans DROP CONSTRAINT ck_subscription_plan_billing_interval;
      ALTER TABLE subscription_plans ADD CONSTRAINT ck_subscription_plan_billing_interval CHECK(billing_interval IN('MONTHLY','ANNUAL','CUSTOM'));

      INSERT INTO subscription_plans(code,name,price_minor,currency,billing_interval,limits,sort_order) VALUES
        ('FARMER_PRO_ANNUAL','Farmer Pro (Annual)',999000,'PKR','ANNUAL','{"maxFarms":3,"maxActiveCropSeasons":6,"geminiAnalysesPerMonth":30,"satelliteMonitoring":true,"advancedReports":true,"maxTeamMembers":1}'::jsonb,1),
        ('FARM_BUSINESS_ANNUAL','Farm Business (Annual)',4999000,'PKR','ANNUAL','{"maxFarms":15,"maxActiveCropSeasons":40,"geminiAnalysesPerMonth":150,"satelliteMonitoring":true,"advancedReports":true,"maxTeamMembers":5}'::jsonb,3);
    `);
  }

  async down(q: QueryRunner): Promise<void> {
    await q.query(`
      DELETE FROM subscription_plans WHERE code IN('FARMER_PRO_ANNUAL','FARM_BUSINESS_ANNUAL');
      ALTER TABLE subscription_plans DROP CONSTRAINT ck_subscription_plan_billing_interval;
      ALTER TABLE subscription_plans ADD CONSTRAINT ck_subscription_plan_billing_interval CHECK(billing_interval IN('MONTHLY','CUSTOM'));

      DROP INDEX IF EXISTS idx_subscriptions_provider_customer;
      ALTER TABLE subscription_plans DROP COLUMN IF EXISTS stripe_price_id;
    `);
  }
}

import type { MigrationInterface, QueryRunner } from 'typeorm';

export class BillingSubscriptions1755000026000 implements MigrationInterface {
  name = 'BillingSubscriptions1755000026000';

  async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`
      CREATE TABLE subscription_plans(
        code varchar(40) PRIMARY KEY,name varchar(120) NOT NULL,price_minor bigint,currency char(3) NOT NULL,
        billing_interval varchar(16) NOT NULL,limits jsonb NOT NULL,is_active boolean NOT NULL DEFAULT true,sort_order integer NOT NULL DEFAULT 0,
        created_at timestamptz NOT NULL DEFAULT now(),updated_at timestamptz NOT NULL DEFAULT now(),version integer NOT NULL DEFAULT 1,
        CONSTRAINT ck_subscription_plan_billing_interval CHECK(billing_interval IN('MONTHLY','CUSTOM')),
        CONSTRAINT ck_subscription_plan_price CHECK(price_minor IS NULL OR price_minor>=0)
      );
      INSERT INTO subscription_plans(code,name,price_minor,currency,billing_interval,limits,sort_order) VALUES
        ('FREE','Free',0,'PKR','MONTHLY','{"maxFarms":1,"maxActiveCropSeasons":2,"geminiAnalysesPerMonth":3,"satelliteMonitoring":false,"advancedReports":false,"maxTeamMembers":1}'::jsonb,0),
        ('FARMER_PRO','Farmer Pro',99900,'PKR','MONTHLY','{"maxFarms":3,"maxActiveCropSeasons":6,"geminiAnalysesPerMonth":30,"satelliteMonitoring":true,"advancedReports":true,"maxTeamMembers":1}'::jsonb,1),
        ('FARM_BUSINESS','Farm Business',499900,'PKR','MONTHLY','{"maxFarms":15,"maxActiveCropSeasons":40,"geminiAnalysesPerMonth":150,"satelliteMonitoring":true,"advancedReports":true,"maxTeamMembers":5}'::jsonb,2),
        ('COOPERATIVE','Cooperative',NULL,'PKR','CUSTOM','{"maxFarms":null,"maxActiveCropSeasons":null,"geminiAnalysesPerMonth":1000,"satelliteMonitoring":true,"advancedReports":true,"maxTeamMembers":null}'::jsonb,3);

      ALTER TABLE subscriptions
        ALTER COLUMN organization_id DROP NOT NULL,
        ADD COLUMN user_id uuid REFERENCES users(id) ON DELETE CASCADE,
        ADD COLUMN plan_code varchar(40) REFERENCES subscription_plans(code);
      UPDATE subscriptions SET plan_code=plan WHERE plan_code IS NULL AND plan IN(SELECT code FROM subscription_plans);
      ALTER TABLE subscriptions
        ALTER COLUMN plan_code SET NOT NULL,
        DROP COLUMN plan,
        ADD CONSTRAINT ck_subscription_owner CHECK((user_id IS NOT NULL)::int + (organization_id IS NOT NULL)::int = 1);
      CREATE INDEX idx_subscriptions_user_status ON subscriptions(user_id,status);

      ALTER TABLE subscription_payments DROP CONSTRAINT ck_subscription_payment_status;
      ALTER TABLE subscription_payments ADD CONSTRAINT ck_subscription_payment_status CHECK(status IN('PENDING','PAID','FAILED','REFUNDED','CANCELLED'));
      ALTER TABLE subscription_payments
        ADD COLUMN plan_code varchar(40) REFERENCES subscription_plans(code),
        ADD COLUMN verified_by_user_id uuid REFERENCES users(id),
        ADD COLUMN notes text;

      CREATE TABLE invoices(
        id uuid PRIMARY KEY DEFAULT gen_random_uuid(),subscription_id uuid NOT NULL REFERENCES subscriptions(id) ON DELETE RESTRICT,
        payment_id uuid REFERENCES subscription_payments(id) ON DELETE SET NULL,amount_minor bigint NOT NULL,currency char(3) NOT NULL,
        status varchar(16) NOT NULL,line_description varchar(255) NOT NULL,issued_at timestamptz NOT NULL DEFAULT now(),due_at timestamptz,
        created_at timestamptz NOT NULL DEFAULT now(),updated_at timestamptz NOT NULL DEFAULT now(),version integer NOT NULL DEFAULT 1,
        CONSTRAINT ck_invoice_status CHECK(status IN('DRAFT','ISSUED','PAID','VOID')),
        CONSTRAINT ck_invoice_amount CHECK(amount_minor>=0)
      );
      CREATE INDEX idx_invoices_subscription ON invoices(subscription_id,issued_at DESC);

      CREATE TABLE billing_events(
        id uuid PRIMARY KEY DEFAULT gen_random_uuid(),subscription_id uuid REFERENCES subscriptions(id) ON DELETE SET NULL,
        user_id uuid REFERENCES users(id) ON DELETE SET NULL,type varchar(40) NOT NULL,payload jsonb NOT NULL DEFAULT '{}'::jsonb,
        created_at timestamptz NOT NULL DEFAULT now()
      );
      CREATE INDEX idx_billing_events_subscription ON billing_events(subscription_id,created_at DESC);
      CREATE INDEX idx_billing_events_user ON billing_events(user_id,created_at DESC);

      CREATE TABLE usage_records(
        id uuid PRIMARY KEY DEFAULT gen_random_uuid(),user_id uuid REFERENCES users(id) ON DELETE CASCADE,
        organization_id uuid REFERENCES organizations(id) ON DELETE CASCADE,metric varchar(60) NOT NULL,
        period_start date NOT NULL,period_end date NOT NULL,count integer NOT NULL DEFAULT 0,computed_at timestamptz NOT NULL DEFAULT now(),
        CONSTRAINT ck_usage_record_owner CHECK(user_id IS NOT NULL OR organization_id IS NOT NULL),
        CONSTRAINT uq_usage_records_user_metric_period UNIQUE(user_id,metric,period_start)
      );
      CREATE INDEX idx_usage_records_org_metric_period ON usage_records(organization_id,metric,period_start);
    `);
  }

  async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`
      DROP TABLE IF EXISTS usage_records,billing_events,invoices CASCADE;
      ALTER TABLE subscription_payments DROP COLUMN IF EXISTS notes,DROP COLUMN IF EXISTS verified_by_user_id,DROP COLUMN IF EXISTS plan_code;
      ALTER TABLE subscription_payments DROP CONSTRAINT IF EXISTS ck_subscription_payment_status;
      ALTER TABLE subscription_payments ADD CONSTRAINT ck_subscription_payment_status CHECK(status IN('PENDING','PAID','FAILED','REFUNDED'));
      DROP INDEX IF EXISTS idx_subscriptions_user_status;
      ALTER TABLE subscriptions
        DROP CONSTRAINT IF EXISTS ck_subscription_owner,
        ADD COLUMN plan varchar(80),
        DROP COLUMN plan_code,
        DROP COLUMN user_id,
        ALTER COLUMN organization_id SET NOT NULL;
      DROP TABLE IF EXISTS subscription_plans CASCADE;
    `);
  }
}

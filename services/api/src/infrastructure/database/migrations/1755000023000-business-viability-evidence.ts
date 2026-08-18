import type { MigrationInterface, QueryRunner } from 'typeorm';

export class BusinessViabilityEvidence1755000023000 implements MigrationInterface {
  name = 'BusinessViabilityEvidence1755000023000';

  async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`
      CREATE TABLE organizations(
        id uuid PRIMARY KEY DEFAULT gen_random_uuid(),name varchar(160) NOT NULL,slug varchar(120) NOT NULL,
        type varchar(32) NOT NULL,evidence_class varchar(16) NOT NULL,external_reference varchar(255),
        created_at timestamptz NOT NULL DEFAULT now(),updated_at timestamptz NOT NULL DEFAULT now(),version integer NOT NULL DEFAULT 1,
        CONSTRAINT uq_organizations_slug UNIQUE(slug),
        CONSTRAINT ck_organization_type CHECK(type IN('FARMER_GROUP','COOPERATIVE','NGO','GOVERNMENT','COMMERCIAL_CUSTOMER','RESEARCH_PARTNER')),
        CONSTRAINT ck_organization_evidence_class CHECK(evidence_class IN('LIVE','PILOT','DEMO','TEST'))
      );
      CREATE TABLE pilot_users(
        id uuid PRIMARY KEY DEFAULT gen_random_uuid(),organization_id uuid NOT NULL REFERENCES organizations(id) ON DELETE CASCADE,
        user_id uuid NOT NULL REFERENCES users(id) ON DELETE CASCADE,status varchar(24) NOT NULL,consented_at timestamptz NOT NULL,
        onboarded_at timestamptz,evidence_reference varchar(255) NOT NULL,
        created_at timestamptz NOT NULL DEFAULT now(),updated_at timestamptz NOT NULL DEFAULT now(),version integer NOT NULL DEFAULT 1,
        CONSTRAINT uq_pilot_users_org_user UNIQUE(organization_id,user_id),
        CONSTRAINT ck_pilot_user_status CHECK(status IN('INVITED','CONSENTED','ONBOARDED','ACTIVE','WITHDRAWN'))
      );
      CREATE INDEX idx_pilot_users_status_onboarded ON pilot_users(status,onboarded_at DESC);
      CREATE TABLE subscriptions(
        id uuid PRIMARY KEY DEFAULT gen_random_uuid(),organization_id uuid NOT NULL REFERENCES organizations(id) ON DELETE RESTRICT,
        plan varchar(80) NOT NULL,status varchar(24) NOT NULL,started_at timestamptz NOT NULL,ended_at timestamptz,
        provider_customer_reference varchar(255),created_at timestamptz NOT NULL DEFAULT now(),updated_at timestamptz NOT NULL DEFAULT now(),version integer NOT NULL DEFAULT 1,
        CONSTRAINT ck_subscription_status CHECK(status IN('TRIAL','ACTIVE','PAST_DUE','CANCELLED','ENDED')),
        CONSTRAINT ck_subscription_dates CHECK(ended_at IS NULL OR ended_at>=started_at)
      );
      CREATE INDEX idx_subscriptions_org_status ON subscriptions(organization_id,status);
      CREATE TABLE subscription_payments(
        id uuid PRIMARY KEY DEFAULT gen_random_uuid(),subscription_id uuid NOT NULL REFERENCES subscriptions(id) ON DELETE RESTRICT,
        provider varchar(40) NOT NULL,provider_payment_reference varchar(255) NOT NULL,amount_minor bigint NOT NULL,currency char(3) NOT NULL,
        status varchar(16) NOT NULL,paid_at timestamptz,verified_at timestamptz,verification_source varchar(255),
        created_at timestamptz NOT NULL DEFAULT now(),updated_at timestamptz NOT NULL DEFAULT now(),version integer NOT NULL DEFAULT 1,
        CONSTRAINT uq_subscription_payment_provider_ref UNIQUE(provider,provider_payment_reference),
        CONSTRAINT ck_subscription_payment_amount CHECK(amount_minor>0),
        CONSTRAINT ck_subscription_payment_status CHECK(status IN('PENDING','PAID','FAILED','REFUNDED')),
        CONSTRAINT ck_verified_paid_payment CHECK(status<>'PAID' OR (paid_at IS NOT NULL AND verified_at IS NOT NULL AND verification_source IS NOT NULL))
      );
      CREATE INDEX idx_subscription_payments_status_paid ON subscription_payments(status,paid_at DESC);
      CREATE TABLE user_feedback(
        id uuid PRIMARY KEY DEFAULT gen_random_uuid(),organization_id uuid REFERENCES organizations(id) ON DELETE SET NULL,
        user_id uuid NOT NULL REFERENCES users(id) ON DELETE CASCADE,rating smallint,feedback text NOT NULL,
        context_type varchar(40) NOT NULL,context_id uuid,consent_to_quote boolean NOT NULL DEFAULT false,
        created_at timestamptz NOT NULL DEFAULT now(),updated_at timestamptz NOT NULL DEFAULT now(),version integer NOT NULL DEFAULT 1,
        CONSTRAINT ck_user_feedback_rating CHECK(rating IS NULL OR rating BETWEEN 1 AND 5),
        CONSTRAINT ck_user_feedback_body CHECK(length(trim(feedback)) BETWEEN 1 AND 4000)
      );
      CREATE INDEX idx_user_feedback_org_created ON user_feedback(organization_id,created_at DESC);
    `);
  }

  async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(
      `DROP TABLE IF EXISTS user_feedback,subscription_payments,subscriptions,pilot_users,organizations CASCADE`,
    );
  }
}

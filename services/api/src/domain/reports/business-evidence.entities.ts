import { Column, Entity, Index } from 'typeorm';
import { BaseEntity } from '../../infrastructure/database/entities/base.entity';

@Entity({ name: 'organizations' })
@Index('uq_organizations_slug', ['slug'], { unique: true })
export class Organization extends BaseEntity {
  @Column({ type: 'varchar', length: 160 }) name!: string;
  @Column({ type: 'varchar', length: 120 }) slug!: string;
  @Column({ type: 'varchar', length: 32 }) type!: string;
  @Column({ name: 'evidence_class', type: 'varchar', length: 16 }) evidenceClass!: string;
  @Column({ name: 'external_reference', type: 'varchar', length: 255, nullable: true })
  externalReference!: string | null;
}

@Entity({ name: 'pilot_users' })
@Index('uq_pilot_users_org_user', ['organizationId', 'userId'], { unique: true })
export class PilotUser extends BaseEntity {
  @Column({ name: 'organization_id', type: 'uuid', nullable: true }) organizationId!: string | null;
  @Column({ name: 'user_id', type: 'uuid' }) userId!: string;
  @Column({ type: 'varchar', length: 24 }) status!: string;
  @Column({ name: 'invited_at', type: 'timestamptz' }) invitedAt!: Date;
  @Column({ name: 'invited_by', type: 'uuid', nullable: true }) invitedBy!: string | null;
  @Column({ name: 'registered_at', type: 'timestamptz', nullable: true })
  registeredAt!: Date | null;
  @Column({ name: 'onboarded_at', type: 'timestamptz', nullable: true }) onboardedAt!: Date | null;
  @Column({ name: 'activated_at', type: 'timestamptz', nullable: true }) activatedAt!: Date | null;
  @Column({ name: 'completed_at', type: 'timestamptz', nullable: true }) completedAt!: Date | null;
  @Column({ name: 'dropped_at', type: 'timestamptz', nullable: true }) droppedAt!: Date | null;
  @Column({ type: 'varchar', length: 24, nullable: true }) source!: string | null;
  @Column({ name: 'evidence_reference', type: 'varchar', length: 255, nullable: true })
  evidenceReference!: string | null;
}

@Entity({ name: 'subscriptions' })
@Index('idx_subscriptions_org_status', ['organizationId', 'status'])
@Index('idx_subscriptions_user_status', ['userId', 'status'])
export class Subscription extends BaseEntity {
  @Column({ name: 'organization_id', type: 'uuid', nullable: true }) organizationId!: string | null;
  @Column({ name: 'user_id', type: 'uuid', nullable: true }) userId!: string | null;
  @Column({ name: 'plan_code', type: 'varchar', length: 40 }) planCode!: string;
  @Column({ type: 'varchar', length: 24 }) status!: string;
  @Column({ name: 'started_at', type: 'timestamptz' }) startedAt!: Date;
  @Column({ name: 'ended_at', type: 'timestamptz', nullable: true }) endedAt!: Date | null;
  @Column({ name: 'provider_customer_reference', type: 'varchar', length: 255, nullable: true })
  providerCustomerReference!: string | null;
}

@Entity({ name: 'subscription_payments' })
@Index('uq_subscription_payment_provider_ref', ['provider', 'providerPaymentReference'], {
  unique: true,
})
export class SubscriptionPayment extends BaseEntity {
  @Column({ name: 'subscription_id', type: 'uuid' }) subscriptionId!: string;
  @Column({ name: 'plan_code', type: 'varchar', length: 40, nullable: true })
  planCode!: string | null;
  @Column({ type: 'varchar', length: 40 }) provider!: string;
  @Column({ name: 'provider_payment_reference', type: 'varchar', length: 255 })
  providerPaymentReference!: string;
  @Column({ name: 'amount_minor', type: 'bigint' }) amountMinor!: string;
  @Column({ type: 'char', length: 3 }) currency!: string;
  @Column({ type: 'varchar', length: 16 }) status!: string;
  @Column({ name: 'paid_at', type: 'timestamptz', nullable: true }) paidAt!: Date | null;
  @Column({ name: 'verified_at', type: 'timestamptz', nullable: true }) verifiedAt!: Date | null;
  @Column({ name: 'verification_source', type: 'varchar', length: 255, nullable: true })
  verificationSource!: string | null;
  @Column({ name: 'verified_by_user_id', type: 'uuid', nullable: true })
  verifiedByUserId!: string | null;
  @Column({ type: 'text', nullable: true }) notes!: string | null;
}

@Entity({ name: 'user_feedback' })
@Index('idx_user_feedback_org_created', ['organizationId', 'createdAt'])
export class UserFeedback extends BaseEntity {
  @Column({ name: 'organization_id', type: 'uuid', nullable: true }) organizationId!: string | null;
  @Column({ name: 'user_id', type: 'uuid' }) userId!: string;
  @Column({ name: 'farm_id', type: 'uuid', nullable: true }) farmId!: string | null;
  @Column({ type: 'smallint', nullable: true }) rating!: number | null;
  @Column({ type: 'boolean', nullable: true }) useful!: boolean | null;
  @Column({ name: 'would_recommend', type: 'boolean', nullable: true }) wouldRecommend!:
    boolean | null;
  @Column({ type: 'text', nullable: true }) feedback!: string | null;
  @Column({ name: 'context_type', type: 'varchar', length: 40 }) contextType!: string;
  @Column({ name: 'context_id', type: 'uuid', nullable: true }) contextId!: string | null;
  @Column({ name: 'consent_to_quote', type: 'boolean', default: false }) consentToQuote!: boolean;
  @Column({ name: 'public_reference_url', type: 'varchar', length: 2048, nullable: true })
  publicReferenceUrl!: string | null;
  @Column({ name: 'published_at', type: 'timestamptz', nullable: true }) publishedAt!: Date | null;
  @Column({ name: 'published_by', type: 'uuid', nullable: true }) publishedBy!: string | null;
}

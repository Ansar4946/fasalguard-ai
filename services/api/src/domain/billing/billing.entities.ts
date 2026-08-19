import { Column, Entity, Index, PrimaryColumn } from 'typeorm';
import { BaseEntity } from '../../infrastructure/database/entities/base.entity';

export interface PlanLimits {
  maxFarms: number | null;
  maxActiveCropSeasons: number | null;
  geminiAnalysesPerMonth: number | null;
  satelliteMonitoring: boolean;
  advancedReports: boolean;
  maxTeamMembers: number | null;
}

@Entity({ name: 'subscription_plans' })
export class SubscriptionPlan {
  @PrimaryColumn({ type: 'varchar', length: 40 }) code!: string;
  @Column({ type: 'varchar', length: 120 }) name!: string;
  @Column({ name: 'price_minor', type: 'bigint', nullable: true }) priceMinor!: string | null;
  @Column({ type: 'char', length: 3 }) currency!: string;
  @Column({ name: 'billing_interval', type: 'varchar', length: 16 }) billingInterval!: string;
  @Column({ type: 'jsonb' }) limits!: PlanLimits;
  @Column({ name: 'is_active', type: 'boolean', default: true }) isActive!: boolean;
  @Column({ name: 'sort_order', type: 'integer', default: 0 }) sortOrder!: number;
  @Column({ name: 'stripe_price_id', type: 'varchar', length: 255, nullable: true })
  stripePriceId!: string | null;
  @Column({ name: 'created_at', type: 'timestamptz' }) createdAt!: Date;
  @Column({ name: 'updated_at', type: 'timestamptz' }) updatedAt!: Date;
  @Column({ type: 'integer' }) version!: number;
}

@Entity({ name: 'invoices' })
@Index('idx_invoices_subscription', ['subscriptionId', 'issuedAt'])
export class Invoice extends BaseEntity {
  @Column({ name: 'subscription_id', type: 'uuid' }) subscriptionId!: string;
  @Column({ name: 'payment_id', type: 'uuid', nullable: true }) paymentId!: string | null;
  @Column({ name: 'amount_minor', type: 'bigint' }) amountMinor!: string;
  @Column({ type: 'char', length: 3 }) currency!: string;
  @Column({ type: 'varchar', length: 16 }) status!: string;
  @Column({ name: 'line_description', type: 'varchar', length: 255 }) lineDescription!: string;
  @Column({ name: 'issued_at', type: 'timestamptz' }) issuedAt!: Date;
  @Column({ name: 'due_at', type: 'timestamptz', nullable: true }) dueAt!: Date | null;
}

@Entity({ name: 'billing_events' })
@Index('idx_billing_events_subscription', ['subscriptionId', 'createdAt'])
@Index('idx_billing_events_user', ['userId', 'createdAt'])
export class BillingEvent {
  @PrimaryColumn({ type: 'uuid' }) id!: string;
  @Column({ name: 'subscription_id', type: 'uuid', nullable: true })
  subscriptionId!: string | null;
  @Column({ name: 'user_id', type: 'uuid', nullable: true }) userId!: string | null;
  @Column({ type: 'varchar', length: 40 }) type!: string;
  @Column({ type: 'jsonb' }) payload!: Record<string, unknown>;
  @Column({ name: 'created_at', type: 'timestamptz' }) createdAt!: Date;
}

@Entity({ name: 'usage_records' })
@Index('uq_usage_records_user_metric_period', ['userId', 'metric', 'periodStart'], {
  unique: true,
})
export class UsageRecord {
  @PrimaryColumn({ type: 'uuid' }) id!: string;
  @Column({ name: 'user_id', type: 'uuid', nullable: true }) userId!: string | null;
  @Column({ name: 'organization_id', type: 'uuid', nullable: true })
  organizationId!: string | null;
  @Column({ type: 'varchar', length: 60 }) metric!: string;
  @Column({ name: 'period_start', type: 'date' }) periodStart!: string;
  @Column({ name: 'period_end', type: 'date' }) periodEnd!: string;
  @Column({ type: 'integer' }) count!: number;
  @Column({ name: 'computed_at', type: 'timestamptz' }) computedAt!: Date;
}

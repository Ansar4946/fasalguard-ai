import { BadRequestException, Injectable, NotFoundException } from '@nestjs/common';
import { InjectDataSource } from '@nestjs/typeorm';
import { randomUUID } from 'node:crypto';
import { DataSource } from 'typeorm';
import { activateSubscription, writeBillingEvent } from './billing.service';
import { BillingEventType, PaymentStatus, SubscriptionStatus } from './billing.enums';
/* eslint-disable @typescript-eslint/explicit-function-return-type */

interface PaymentRow {
  id: string;
  subscription_id: string;
  plan_code: string | null;
  status: PaymentStatus;
  amount_minor: string;
  currency: string;
}

@Injectable()
export class AdminBillingService {
  constructor(@InjectDataSource() private readonly db: DataSource) {}

  /**
   * Every value here is derived from real, persisted rows — an empty/unseeded database
   * legitimately returns zeros, matching the same "never fabricate" discipline as
   * `AnalyticsService.viability()`. Individual-user subscriptions owned by an account
   * flagged `is_test_account` are excluded; org-scoped (pilot/cooperative) subscriptions
   * have no `user_id` and are never excluded by this flag.
   */
  async revenue() {
    const rows = await this.db.query<
      Array<
        Record<string, string | null> & {
          totalRevenueByCurrency: Record<string, number> | null;
          monthlyRevenueByCurrency: Record<string, number> | null;
          mrrByCurrency: Record<string, number> | null;
          planDistribution: Array<{ planCode: string; count: number }> | null;
        }
      >
    >(`SELECT
      (SELECT COALESCE(jsonb_object_agg(currency,total),'{}'::jsonb) FROM
        (SELECT p.currency,sum(p.amount_minor)::numeric total FROM subscription_payments p JOIN subscriptions s ON s.id=p.subscription_id LEFT JOIN users u ON u.id=s.user_id WHERE p.status='PAID' AND p.verified_at IS NOT NULL AND (s.user_id IS NULL OR u.is_test_account=false) GROUP BY p.currency) x)::jsonb "totalRevenueByCurrency",
      (SELECT COALESCE(jsonb_object_agg(currency,total),'{}'::jsonb) FROM
        (SELECT p.currency,sum(p.amount_minor)::numeric total FROM subscription_payments p JOIN subscriptions s ON s.id=p.subscription_id LEFT JOIN users u ON u.id=s.user_id WHERE p.status='PAID' AND p.verified_at IS NOT NULL AND p.paid_at>=date_trunc('month',now()) AND (s.user_id IS NULL OR u.is_test_account=false) GROUP BY p.currency) x)::jsonb "monthlyRevenueByCurrency",
      (SELECT COALESCE(jsonb_object_agg(currency,total),'{}'::jsonb) FROM
        (SELECT sp.currency,sum(sp.price_minor)::numeric total FROM subscriptions s JOIN subscription_plans sp ON sp.code=s.plan_code LEFT JOIN users u ON u.id=s.user_id WHERE s.status='ACTIVE' AND sp.billing_interval='MONTHLY' AND sp.price_minor>0 AND (s.user_id IS NULL OR u.is_test_account=false) GROUP BY sp.currency) x)::jsonb "mrrByCurrency",
      (SELECT count(DISTINCT s.user_id) FROM subscriptions s JOIN users u ON u.id=s.user_id AND u.is_test_account=false WHERE s.status='ACTIVE' AND s.plan_code<>'FREE' AND EXISTS(SELECT 1 FROM subscription_payments p WHERE p.subscription_id=s.id AND p.status='PAID' AND p.verified_at IS NOT NULL))::text "payingUsersCount",
      (SELECT COALESCE(jsonb_agg(jsonb_build_object('planCode',plan_code,'count',count)),'[]'::jsonb) FROM
        (SELECT s.plan_code,count(*)::int count FROM subscriptions s LEFT JOIN users u ON u.id=s.user_id WHERE s.status IN('TRIAL','ACTIVE') AND (s.user_id IS NULL OR u.is_test_account=false) GROUP BY s.plan_code ORDER BY s.plan_code) x)::jsonb "planDistribution",
      (SELECT count(*) FROM subscription_payments p JOIN subscriptions s ON s.id=p.subscription_id LEFT JOIN users u ON u.id=s.user_id WHERE p.status='PAID' AND (s.user_id IS NULL OR u.is_test_account=false))::text "successfulPaymentsCount",
      (SELECT count(*) FROM subscription_payments p JOIN subscriptions s ON s.id=p.subscription_id LEFT JOIN users u ON u.id=s.user_id WHERE p.status='FAILED' AND (s.user_id IS NULL OR u.is_test_account=false))::text "failedPaymentsCount",
      (SELECT count(*) FROM subscription_payments p JOIN subscriptions s ON s.id=p.subscription_id LEFT JOIN users u ON u.id=s.user_id WHERE p.status='PENDING' AND (s.user_id IS NULL OR u.is_test_account=false))::text "pendingPaymentsCount",
      (SELECT count(*) FROM subscription_payments p JOIN subscriptions s ON s.id=p.subscription_id LEFT JOIN users u ON u.id=s.user_id WHERE p.status='REFUNDED' AND (s.user_id IS NULL OR u.is_test_account=false))::text "refundedPaymentsCount"`);
    const r = rows[0] ?? ({} as (typeof rows)[number]);
    return {
      generatedAt: new Date().toISOString(),
      scope: 'real-persisted-billing-events',
      policy: {
        mixedCurrenciesAreNeverSummed: true,
        revenueRequiresVerifiedPayment: true,
        excludesTestAccounts: true,
      },
      totalRevenueByCurrency: numberMap(r.totalRevenueByCurrency),
      monthlyRevenueByCurrency: numberMap(r.monthlyRevenueByCurrency),
      mrrByCurrency: numberMap(r.mrrByCurrency),
      payingUsersCount: Number(r.payingUsersCount ?? 0),
      planDistribution: r.planDistribution ?? [],
      successfulPaymentsCount: Number(r.successfulPaymentsCount ?? 0),
      failedPaymentsCount: Number(r.failedPaymentsCount ?? 0),
      pendingPaymentsCount: Number(r.pendingPaymentsCount ?? 0),
      refundedPaymentsCount: Number(r.refundedPaymentsCount ?? 0),
    };
  }

  /** Real plan catalog with real per-plan subscriber counts — same exclusions as revenue(). */
  async listPlans(): Promise<unknown[]> {
    const rows: Array<{
      code: string;
      name: string;
      priceMinor: string | null;
      currency: string;
      billingInterval: string;
      isActive: boolean;
      stripePriceId: string | null;
      activeSubscriptions: number;
    }> = await this.db.query(
      `SELECT sp.code,sp.name,sp.price_minor "priceMinor",sp.currency,sp.billing_interval "billingInterval",
        sp.is_active "isActive",sp.stripe_price_id "stripePriceId",
        (SELECT count(*) FROM subscriptions s LEFT JOIN users u ON u.id=s.user_id
         WHERE s.plan_code=sp.code AND s.status IN('TRIAL','ACTIVE') AND (s.user_id IS NULL OR u.is_test_account=false)
        )::int "activeSubscriptions"
       FROM subscription_plans sp ORDER BY sp.sort_order`,
    );
    // price_minor is a Postgres numeric column — node-pg returns it as a string to avoid
    // precision loss, matching the same Number() normalization billing.service.ts's
    // publicPlan() already does for the public /billing/plans endpoint.
    return rows.map((row) => ({
      ...row,
      priceMinor: row.priceMinor === null ? null : Number(row.priceMinor),
    }));
  }

  async listPayments(status?: string): Promise<unknown[]> {
    return this.db.query<unknown[]>(
      `SELECT p.id,p.subscription_id "subscriptionId",s.user_id "userId",p.plan_code "planCode",p.provider,
        p.provider_payment_reference "providerPaymentReference",p.amount_minor "amountMinor",p.currency,p.status,
        p.notes,p.paid_at "paidAt",p.verified_at "verifiedAt",p.created_at "createdAt"
       FROM subscription_payments p JOIN subscriptions s ON s.id=p.subscription_id
       WHERE $1::text IS NULL OR p.status=$1 ORDER BY p.created_at DESC LIMIT 200`,
      [status ?? null],
    );
  }

  async verifyPayment(adminUserId: string, paymentId: string, notes?: string) {
    return this.db.transaction(async (manager) => {
      const rows: PaymentRow[] = await manager.query(
        `SELECT id,subscription_id,plan_code,status,amount_minor,currency FROM subscription_payments WHERE id=$1 FOR UPDATE`,
        [paymentId],
      );
      const payment = rows[0];
      if (!payment) throw new NotFoundException('Payment was not found.');
      if (payment.status !== PaymentStatus.Pending)
        throw new BadRequestException({
          code: 'PAYMENT_NOT_PENDING',
          message: `Only a PENDING payment can be verified (current status: ${payment.status}).`,
        });
      await manager.query(
        `UPDATE subscription_payments SET status='PAID',paid_at=now(),verified_at=now(),verification_source='ADMIN_MANUAL_VERIFICATION',verified_by_user_id=$2,notes=COALESCE($3,notes),updated_at=now(),version=version+1 WHERE id=$1`,
        [paymentId, adminUserId, notes ?? null],
      );
      await manager.query(
        `UPDATE invoices SET status='PAID',updated_at=now(),version=version+1 WHERE payment_id=$1`,
        [paymentId],
      );
      if (payment.plan_code)
        await activateSubscription(
          manager,
          payment.subscription_id,
          payment.plan_code,
          paymentId,
          adminUserId,
        );
      return { id: paymentId, status: PaymentStatus.Paid };
    });
  }

  async rejectPayment(adminUserId: string, paymentId: string, reason: string) {
    return this.db.transaction(async (manager) => {
      const rows: PaymentRow[] = await manager.query(
        `SELECT id,subscription_id,plan_code,status,amount_minor,currency FROM subscription_payments WHERE id=$1 FOR UPDATE`,
        [paymentId],
      );
      const payment = rows[0];
      if (!payment) throw new NotFoundException('Payment was not found.');
      if (payment.status !== PaymentStatus.Pending)
        throw new BadRequestException({
          code: 'PAYMENT_NOT_PENDING',
          message: `Only a PENDING payment can be rejected (current status: ${payment.status}).`,
        });
      await manager.query(
        `UPDATE subscription_payments SET status='FAILED',verified_by_user_id=$2,notes=$3,updated_at=now(),version=version+1 WHERE id=$1`,
        [paymentId, adminUserId, reason],
      );
      await manager.query(
        `UPDATE invoices SET status='VOID',updated_at=now(),version=version+1 WHERE payment_id=$1`,
        [paymentId],
      );
      await writeBillingEvent(
        manager,
        payment.subscription_id,
        null,
        BillingEventType.PaymentRejected,
        { paymentId, rejectedBy: adminUserId, reason },
      );
      return { id: paymentId, status: PaymentStatus.Failed };
    });
  }

  async refundPayment(adminUserId: string, paymentId: string, reason: string) {
    return this.db.transaction(async (manager) => {
      const rows: PaymentRow[] = await manager.query(
        `SELECT id,subscription_id,plan_code,status,amount_minor,currency FROM subscription_payments WHERE id=$1 FOR UPDATE`,
        [paymentId],
      );
      const payment = rows[0];
      if (!payment) throw new NotFoundException('Payment was not found.');
      if (payment.status !== PaymentStatus.Paid)
        throw new BadRequestException({
          code: 'PAYMENT_NOT_PAID',
          message: `Only a PAID payment can be refunded (current status: ${payment.status}).`,
        });
      await manager.query(
        `UPDATE subscription_payments SET status='REFUNDED',verified_by_user_id=$2,notes=$3,updated_at=now(),version=version+1 WHERE id=$1`,
        [paymentId, adminUserId, reason],
      );
      await manager.query(
        `UPDATE subscriptions SET plan_code='FREE',updated_at=now(),version=version+1 WHERE id=$1`,
        [payment.subscription_id],
      );
      await writeBillingEvent(
        manager,
        payment.subscription_id,
        null,
        BillingEventType.PaymentRefunded,
        { paymentId, refundedBy: adminUserId, reason },
      );
      await writeBillingEvent(
        manager,
        payment.subscription_id,
        null,
        BillingEventType.SubscriptionDowngraded,
        { paymentId, planCode: 'FREE', reason: 'refund' },
      );
      return { id: paymentId, status: PaymentStatus.Refunded };
    });
  }

  async assignOrganizationPlan(adminUserId: string, organizationId: string, planCode: string) {
    return this.db.transaction(async (manager) => {
      const org: Array<{ id: string }> = await manager.query(
        `SELECT id FROM organizations WHERE id=$1`,
        [organizationId],
      );
      if (!org[0]) throw new NotFoundException('Organization was not found.');
      const plan: Array<{ code: string }> = await manager.query(
        `SELECT code FROM subscription_plans WHERE code=$1 AND is_active=true`,
        [planCode],
      );
      if (!plan[0])
        throw new BadRequestException({ code: 'UNKNOWN_PLAN', message: 'Plan was not found.' });
      const existing: Array<{ id: string }> = await manager.query(
        `SELECT id FROM subscriptions WHERE organization_id=$1 AND status IN('TRIAL','ACTIVE')`,
        [organizationId],
      );
      let subscriptionId: string;
      if (existing[0]) {
        subscriptionId = existing[0].id;
        await manager.query(
          `UPDATE subscriptions SET plan_code=$2,status='ACTIVE',updated_at=now(),version=version+1 WHERE id=$1`,
          [subscriptionId, planCode],
        );
      } else {
        subscriptionId = randomUUID();
        await manager.query(
          `INSERT INTO subscriptions(id,organization_id,plan_code,status,started_at) VALUES($1,$2,$3,$4,now())`,
          [subscriptionId, organizationId, planCode, SubscriptionStatus.Active],
        );
      }
      await writeBillingEvent(
        manager,
        subscriptionId,
        null,
        BillingEventType.OrganizationPlanAssigned,
        { organizationId, planCode, assignedBy: adminUserId },
      );
      return { subscriptionId, organizationId, planCode, status: SubscriptionStatus.Active };
    });
  }
}

function numberMap(value: Record<string, number> | null | undefined): Record<string, number> {
  return Object.fromEntries(Object.entries(value ?? {}).map(([k, v]) => [k, Number(v)]));
}

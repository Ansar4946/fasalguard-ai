import {
  BadRequestException,
  ForbiddenException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { InjectDataSource } from '@nestjs/typeorm';
import { randomUUID } from 'node:crypto';
import { DataSource, type EntityManager } from 'typeorm';
import { BillingEventType, PaymentStatus, SubscriptionStatus } from './billing.enums';
import type { RequestUpgradeDto } from './dto/billing.dto';
/* eslint-disable @typescript-eslint/explicit-function-return-type */

interface PlanRow {
  code: string;
  name: string;
  price_minor: string | null;
  currency: string;
  billing_interval: string;
  limits: Record<string, unknown>;
  sort_order: number;
}

interface SubscriptionRow {
  id: string;
  plan_code: string;
  status: string;
  started_at: Date;
  ended_at: Date | null;
}

@Injectable()
export class BillingService {
  constructor(@InjectDataSource() private readonly db: DataSource) {}

  async listPlans(): Promise<unknown[]> {
    const rows: PlanRow[] = await this.db.query(
      `SELECT code,name,price_minor,currency,billing_interval,limits,sort_order FROM subscription_plans WHERE is_active=true ORDER BY sort_order`,
    );
    return rows.map((row) => this.publicPlan(row));
  }

  async getMySubscription(userId: string): Promise<unknown> {
    const subscription = await this.ensureSubscription(userId, this.db);
    const plan: PlanRow[] = await this.db.query(
      `SELECT code,name,price_minor,currency,billing_interval,limits,sort_order FROM subscription_plans WHERE code=$1`,
      [subscription.plan_code],
    );
    const payments = await this.db.query<unknown[]>(
      `SELECT id,plan_code "planCode",provider,provider_payment_reference "providerPaymentReference",amount_minor "amountMinor",currency,status,paid_at "paidAt",created_at "createdAt" FROM subscription_payments WHERE subscription_id=$1 ORDER BY created_at DESC LIMIT 10`,
      [subscription.id],
    );
    const invoices = await this.db.query<unknown[]>(
      `SELECT id,amount_minor "amountMinor",currency,status,line_description "lineDescription",issued_at "issuedAt" FROM invoices WHERE subscription_id=$1 ORDER BY issued_at DESC LIMIT 10`,
      [subscription.id],
    );
    return {
      subscription: {
        id: subscription.id,
        status: subscription.status,
        startedAt: subscription.started_at,
        endedAt: subscription.ended_at,
      },
      plan: plan[0] ? this.publicPlan(plan[0]) : null,
      recentPayments: payments,
      recentInvoices: invoices,
    };
  }

  async requestUpgrade(userId: string, dto: RequestUpgradeDto): Promise<unknown> {
    return this.db.transaction(async (manager) => {
      const subscription = await this.ensureSubscription(userId, manager);
      const plans: PlanRow[] = await manager.query(
        `SELECT code,name,price_minor,currency,billing_interval,limits,sort_order FROM subscription_plans WHERE code=$1 AND is_active=true`,
        [dto.planCode],
      );
      const plan = plans[0];
      if (!plan)
        throw new BadRequestException({ code: 'UNKNOWN_PLAN', message: 'Plan was not found.' });
      if (plan.price_minor === null)
        throw new BadRequestException({
          code: 'PLAN_REQUIRES_MANUAL_ASSIGNMENT',
          message:
            'This plan is assigned by our team, not self-serve. Please contact us to be onboarded.',
        });
      const paymentId = randomUUID();
      await manager.query(
        `INSERT INTO subscription_payments(id,subscription_id,plan_code,provider,provider_payment_reference,amount_minor,currency,status,notes)
         VALUES($1,$2,$3,$4,$5,$6,$7,$8,$9)`,
        [
          paymentId,
          subscription.id,
          plan.code,
          dto.provider,
          dto.providerPaymentReference,
          plan.price_minor,
          plan.currency,
          PaymentStatus.Pending,
          dto.notes ?? null,
        ],
      );
      const invoiceId = randomUUID();
      await manager.query(
        `INSERT INTO invoices(id,subscription_id,payment_id,amount_minor,currency,status,line_description,issued_at)
         VALUES($1,$2,$3,$4,$5,'ISSUED',$6,now())`,
        [
          invoiceId,
          subscription.id,
          paymentId,
          plan.price_minor,
          plan.currency,
          `${plan.name} subscription`,
        ],
      );
      await writeBillingEvent(manager, subscription.id, userId, BillingEventType.UpgradeRequested, {
        planCode: plan.code,
        paymentId,
      });
      return {
        paymentId,
        invoiceId,
        status: PaymentStatus.Pending,
        planCode: plan.code,
        amountMinor: plan.price_minor,
        currency: plan.currency,
        message:
          'Your upgrade request has been recorded. An administrator will verify your payment before the plan activates.',
      };
    });
  }

  async cancelMyUpgradeRequest(userId: string, paymentId: string): Promise<unknown> {
    return this.db.transaction(async (manager) => {
      const rows: Array<{ id: string; subscription_id: string; status: PaymentStatus }> =
        await manager.query(
          `SELECT p.id,p.subscription_id,p.status FROM subscription_payments p
           JOIN subscriptions s ON s.id=p.subscription_id
           WHERE p.id=$1 AND s.user_id=$2`,
          [paymentId, userId],
        );
      const payment = rows[0];
      if (!payment) throw new NotFoundException('Upgrade request was not found.');
      if (payment.status !== PaymentStatus.Pending)
        throw new ForbiddenException('Only a pending upgrade request can be cancelled.');
      await manager.query(
        `UPDATE subscription_payments SET status=$2,updated_at=now(),version=version+1 WHERE id=$1`,
        [paymentId, PaymentStatus.Cancelled],
      );
      await writeBillingEvent(
        manager,
        payment.subscription_id,
        userId,
        BillingEventType.UpgradeCancelled,
        { paymentId },
      );
      return { id: paymentId, status: PaymentStatus.Cancelled };
    });
  }

  /** Every registered user has a subscription created at registration; this is a defensive
   * fallback only for accounts that predate the billing migration. */
  private async ensureSubscription(
    userId: string,
    runner: DataSource | EntityManager,
  ): Promise<SubscriptionRow> {
    const existing: SubscriptionRow[] = await runner.query(
      `SELECT id,plan_code,status,started_at,ended_at FROM subscriptions WHERE user_id=$1 ORDER BY created_at DESC LIMIT 1`,
      [userId],
    );
    if (existing[0]) return existing[0];
    const id = randomUUID();
    await runner.query(
      `INSERT INTO subscriptions(id,user_id,plan_code,status,started_at) VALUES($1,$2,'FREE',$3,now())`,
      [id, userId, SubscriptionStatus.Active],
    );
    await writeBillingEvent(runner, id, userId, BillingEventType.SubscriptionCreated, {
      planCode: 'FREE',
      reason: 'backfilled-on-first-billing-access',
    });
    const rows: SubscriptionRow[] = await runner.query(
      `SELECT id,plan_code,status,started_at,ended_at FROM subscriptions WHERE id=$1`,
      [id],
    );
    return rows[0]!;
  }

  private publicPlan(row: PlanRow) {
    return {
      code: row.code,
      name: row.name,
      priceMinor: row.price_minor === null ? null : Number(row.price_minor),
      currency: row.currency,
      billingInterval: row.billing_interval,
      limits: row.limits,
    };
  }
}

export async function writeBillingEvent(
  runner: DataSource | EntityManager,
  subscriptionId: string | null,
  userId: string | null,
  type: BillingEventType,
  payload: Record<string, unknown>,
): Promise<void> {
  await runner.query(
    `INSERT INTO billing_events(id,subscription_id,user_id,type,payload) VALUES($1,$2,$3,$4,$5)`,
    [randomUUID(), subscriptionId, userId, type, JSON.stringify(payload)],
  );
}

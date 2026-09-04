import { BadRequestException, Injectable, ServiceUnavailableException } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { InjectDataSource } from '@nestjs/typeorm';
import { randomUUID } from 'node:crypto';
import Stripe from 'stripe';
import { DataSource } from 'typeorm';
import { activateSubscription, BillingService } from './billing.service';
import { PaymentProvider, PlanCode } from './billing.enums';
/* TypeORM raw query results are constrained by each explicit SQL projection below. */

interface PlanRow {
  code: string;
  name: string;
  price_minor: string | null;
  currency: string;
  stripe_price_id: string | null;
}

/**
 * Real Stripe Checkout integration — a second, auto-verifying `PaymentProvider` sitting
 * alongside the existing manual bank-transfer/JazzCash/EasyPaisa channels (never replacing
 * them). Blank Stripe keys behave like every other unconfigured provider in this codebase:
 * a clean `PAYMENT_NOT_CONFIGURED` 503, never a crash or a faked success.
 */
@Injectable()
export class StripeService {
  private client: Stripe | null = null;

  constructor(
    @InjectDataSource() private readonly db: DataSource,
    private readonly config: ConfigService,
    private readonly billing: BillingService,
  ) {}

  private getClient(): Stripe {
    if (this.client) return this.client;
    const secretKey = this.config.get<string>('stripeSecretKey', '');
    if (!secretKey)
      throw new ServiceUnavailableException({
        code: 'PAYMENT_NOT_CONFIGURED',
        message: 'Card payment is not configured yet.',
      });
    this.client = new Stripe(secretKey);
    return this.client;
  }

  status(): { configured: boolean; webhookConfigured: boolean } {
    return {
      configured: Boolean(this.config.get<string>('stripeSecretKey', '')),
      webhookConfigured: Boolean(this.config.get<string>('stripeWebhookSecret', '')),
    };
  }

  async setPriceId(planCode: string, stripePriceId: string): Promise<{ code: string }> {
    const rows: Array<{ code: string }> = await this.db.query(
      `UPDATE subscription_plans SET stripe_price_id=$2,updated_at=now(),version=version+1 WHERE code=$1 RETURNING code`,
      [planCode, stripePriceId],
    );
    if (!rows[0])
      throw new BadRequestException({ code: 'UNKNOWN_PLAN', message: 'Plan was not found.' });
    return rows[0];
  }

  async createCheckoutSession(userId: string, planCode: PlanCode): Promise<{ url: string }> {
    const stripe = this.getClient();
    const plans: PlanRow[] = await this.db.query(
      `SELECT code,name,price_minor,currency,stripe_price_id FROM subscription_plans WHERE code=$1 AND is_active=true`,
      [planCode],
    );
    const plan = plans[0];
    if (!plan)
      throw new BadRequestException({ code: 'UNKNOWN_PLAN', message: 'Plan was not found.' });
    if (plan.price_minor === null)
      throw new BadRequestException({
        code: 'PLAN_REQUIRES_MANUAL_ASSIGNMENT',
        message: 'This plan is assigned by our team, not self-serve. Please contact us.',
      });
    if (!plan.stripe_price_id)
      throw new ServiceUnavailableException({
        code: 'STRIPE_PRICE_NOT_CONFIGURED',
        message: 'Card payment for this plan is not set up yet.',
      });

    const subscription = await this.billing.ensureSubscription(userId, this.db);
    const customerId = await this.resolveCustomerId(stripe, subscription.id, userId);
    const webUrl = this.config.get<string>('webAppUrl', 'http://localhost:3000').replace(/\/$/, '');

    const session = await stripe.checkout.sessions.create({
      mode: 'subscription',
      customer: customerId,
      client_reference_id: userId,
      line_items: [{ price: plan.stripe_price_id, quantity: 1 }],
      success_url: `${webUrl}/billing/upgrade?checkout=success`,
      cancel_url: `${webUrl}/billing/upgrade?checkout=cancelled`,
      metadata: { userId, planCode: plan.code, subscriptionId: subscription.id },
    });
    if (!session.url)
      throw new ServiceUnavailableException({
        code: 'STRIPE_SESSION_FAILED',
        message: 'Could not start a Stripe checkout session.',
      });
    return { url: session.url };
  }

  private async resolveCustomerId(
    stripe: Stripe,
    subscriptionId: string,
    userId: string,
  ): Promise<string> {
    const rows: Array<{ providerCustomerReference: string | null }> = await this.db.query(
      `SELECT provider_customer_reference "providerCustomerReference" FROM subscriptions WHERE id=$1`,
      [subscriptionId],
    );
    const existing = rows[0]?.providerCustomerReference;
    if (existing) return existing;

    const userRows: Array<{ email: string | null }> = await this.db.query(
      `SELECT email FROM users WHERE id=$1`,
      [userId],
    );
    const customer = await stripe.customers.create({
      email: userRows[0]?.email ?? undefined,
      metadata: { userId },
    });
    await this.db.query(
      `UPDATE subscriptions SET provider_customer_reference=$2,updated_at=now(),version=version+1 WHERE id=$1`,
      [subscriptionId, customer.id],
    );
    return customer.id;
  }

  async handleWebhook(rawBody: Buffer, signature: string | undefined): Promise<{ received: true }> {
    const stripe = this.getClient();
    const webhookSecret = this.config.get<string>('stripeWebhookSecret', '');
    if (!webhookSecret || !signature)
      throw new ServiceUnavailableException({
        code: 'PAYMENT_NOT_CONFIGURED',
        message: 'Stripe webhook verification is not configured yet.',
      });
    let event: Stripe.Event;
    try {
      event = stripe.webhooks.constructEvent(rawBody, signature, webhookSecret);
    } catch {
      throw new BadRequestException({
        code: 'INVALID_STRIPE_SIGNATURE',
        message: 'Webhook signature verification failed.',
      });
    }

    switch (event.type) {
      case 'checkout.session.completed':
        await this.onCheckoutCompleted(event.data.object);
        break;
      case 'customer.subscription.deleted':
        await this.onSubscriptionEnded(event.data.object);
        break;
      case 'invoice.payment_failed':
        await this.onPaymentFailed(event.data.object);
        break;
      case 'invoice.paid':
        await this.onInvoicePaid(event.data.object);
        break;
      default:
        break; // every other event type is intentionally ignored
    }
    return { received: true };
  }

  private async onCheckoutCompleted(session: Stripe.Checkout.Session): Promise<void> {
    const userId = session.metadata?.userId;
    const planCode = session.metadata?.planCode;
    const subscriptionId = session.metadata?.subscriptionId;
    if (!userId || !planCode || !subscriptionId) return; // not one of ours

    const plans: Array<{ price_minor: string | null; currency: string; name: string }> =
      await this.db.query(
        `SELECT price_minor,currency,name FROM subscription_plans WHERE code=$1`,
        [planCode],
      );
    const plan = plans[0];
    if (!plan || plan.price_minor === null) return;

    await this.db.transaction(async (manager) => {
      const paymentId = randomUUID();
      try {
        await manager.query(
          `INSERT INTO subscription_payments(id,subscription_id,plan_code,provider,provider_payment_reference,amount_minor,currency,status,paid_at,verified_at,verification_source)
           VALUES($1,$2,$3,$4,$5,$6,$7,'PAID',now(),now(),'STRIPE_WEBHOOK')`,
          [
            paymentId,
            subscriptionId,
            planCode,
            PaymentProvider.Stripe,
            session.id,
            plan.price_minor,
            plan.currency,
          ],
        );
      } catch (error) {
        if (this.isUniqueViolation(error)) return; // duplicate webhook redelivery — real no-op
        throw error;
      }
      await manager.query(
        `INSERT INTO invoices(id,subscription_id,payment_id,amount_minor,currency,status,line_description,issued_at)
         VALUES($1,$2,$3,$4,$5,'PAID',$6,now())`,
        [
          randomUUID(),
          subscriptionId,
          paymentId,
          plan.price_minor,
          plan.currency,
          `${plan.name} subscription (Stripe)`,
        ],
      );
      await activateSubscription(manager, subscriptionId, planCode, paymentId);
    });
  }

  private async onInvoicePaid(invoice: Stripe.Invoice): Promise<void> {
    // The first invoice of a subscription is already recorded by onCheckoutCompleted() (keyed by
    // session.id) — this handler exists for renewals, which Stripe bills automatically and never
    // route through Checkout at all. Skipping subscription_create here avoids double-counting the
    // first period's revenue under two different provider_payment_reference values.
    if (invoice.billing_reason === 'subscription_create') return;
    const customerId =
      typeof invoice.customer === 'string' ? invoice.customer : (invoice.customer?.id ?? null);
    if (!customerId) return;

    const subs: Array<{ id: string; plan_code: string }> = await this.db.query(
      `SELECT id,plan_code FROM subscriptions WHERE provider_customer_reference=$1`,
      [customerId],
    );
    const subscription = subs[0];
    if (!subscription) return;

    const plans: Array<{ price_minor: string | null; currency: string; name: string }> =
      await this.db.query(
        `SELECT price_minor,currency,name FROM subscription_plans WHERE code=$1`,
        [subscription.plan_code],
      );
    const plan = plans[0];
    if (!plan || plan.price_minor === null) return;

    await this.db.transaction(async (manager) => {
      const paymentId = randomUUID();
      try {
        await manager.query(
          `INSERT INTO subscription_payments(id,subscription_id,plan_code,provider,provider_payment_reference,amount_minor,currency,status,paid_at,verified_at,verification_source)
           VALUES($1,$2,$3,$4,$5,$6,$7,'PAID',now(),now(),'STRIPE_WEBHOOK')`,
          [
            paymentId,
            subscription.id,
            subscription.plan_code,
            PaymentProvider.Stripe,
            invoice.id,
            plan.price_minor,
            plan.currency,
          ],
        );
      } catch (error) {
        if (this.isUniqueViolation(error)) return; // duplicate webhook redelivery — real no-op
        throw error;
      }
      await manager.query(
        `INSERT INTO invoices(id,subscription_id,payment_id,amount_minor,currency,status,line_description,issued_at)
         VALUES($1,$2,$3,$4,$5,'PAID',$6,now())`,
        [
          randomUUID(),
          subscription.id,
          paymentId,
          plan.price_minor,
          plan.currency,
          `${plan.name} renewal (Stripe)`,
        ],
      );
      // Also recovers a subscription that had drifted to PAST_DUE once its retry succeeds.
      await activateSubscription(manager, subscription.id, subscription.plan_code, paymentId);
    });
  }

  private async onSubscriptionEnded(subscription: Stripe.Subscription): Promise<void> {
    const customerId =
      typeof subscription.customer === 'string' ? subscription.customer : subscription.customer.id;
    await this.db.query(
      `UPDATE subscriptions SET plan_code='FREE',status='CANCELLED',updated_at=now(),version=version+1 WHERE provider_customer_reference=$1 AND status='ACTIVE'`,
      [customerId],
    );
  }

  private async onPaymentFailed(invoice: Stripe.Invoice): Promise<void> {
    const customerId =
      typeof invoice.customer === 'string' ? invoice.customer : (invoice.customer?.id ?? null);
    if (!customerId) return;
    await this.db.query(
      `UPDATE subscriptions SET status='PAST_DUE',updated_at=now(),version=version+1 WHERE provider_customer_reference=$1 AND status='ACTIVE'`,
      [customerId],
    );
  }

  private isUniqueViolation(e: unknown): boolean {
    return (
      typeof e === 'object' &&
      e !== null &&
      'code' in e &&
      (e as { code?: string }).code === '23505'
    );
  }
}

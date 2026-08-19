import { BadRequestException, ServiceUnavailableException } from '@nestjs/common';
import { StripeService } from '../src/domain/billing/stripe.service';

const constructEventMock = jest.fn();
jest.mock('stripe', () => {
  // The real `stripe` package ships both `module.exports = Stripe` and
  // `module.exports.default = Stripe` (a real interop shim) — replicate that shape so
  // `import Stripe from 'stripe'` resolves the same way it does against the real package.
  const StripeMock = jest.fn().mockImplementation(() => ({
    webhooks: { constructEvent: constructEventMock },
    customers: { create: jest.fn() },
    checkout: { sessions: { create: jest.fn() } },
  })) as jest.Mock & { default?: jest.Mock };
  StripeMock.default = StripeMock;
  return StripeMock;
});

function fakeDb(): {
  query: jest.Mock<Promise<unknown>, [string, unknown[]?]>;
  transaction: jest.Mock;
} {
  const query = jest.fn<Promise<unknown>, [string, unknown[]?]>().mockResolvedValue([]);
  const transaction = jest.fn((callback: (manager: { query: typeof query }) => unknown) =>
    callback({ query }),
  );
  return { query, transaction };
}

function fakeConfig(overrides: Record<string, string> = {}): { get: jest.Mock } {
  const values: Record<string, string> = {
    stripeSecretKey: 'sk_test_fake',
    stripeWebhookSecret: 'whsec_fake',
    webAppUrl: 'http://localhost:3000',
    ...overrides,
  };
  return { get: jest.fn((key: string, fallback?: string) => values[key] ?? fallback ?? '') };
}

function fakeBillingService(): { ensureSubscription: jest.Mock } {
  return {
    ensureSubscription: jest
      .fn()
      .mockResolvedValue({ id: 'sub-1', plan_code: 'FREE', status: 'ACTIVE' }),
  };
}

describe('StripeService', () => {
  beforeEach(() => constructEventMock.mockReset());

  it('createCheckoutSession 503s when the plan has no stripe_price_id configured', async () => {
    const db = fakeDb();
    db.query.mockResolvedValueOnce([
      {
        code: 'FARMER_PRO',
        name: 'Farmer Pro',
        price_minor: '99900',
        currency: 'PKR',
        stripe_price_id: null,
      },
    ]);
    const service = new StripeService(
      db as never,
      fakeConfig() as never,
      fakeBillingService() as never,
    );
    await expect(
      service.createCheckoutSession('user-1', 'FARMER_PRO' as never),
    ).rejects.toBeInstanceOf(ServiceUnavailableException);
  });

  it('createCheckoutSession rejects a plan that requires manual assignment', async () => {
    const db = fakeDb();
    db.query.mockResolvedValueOnce([
      {
        code: 'COOPERATIVE',
        name: 'Cooperative',
        price_minor: null,
        currency: 'PKR',
        stripe_price_id: null,
      },
    ]);
    const service = new StripeService(
      db as never,
      fakeConfig() as never,
      fakeBillingService() as never,
    );
    await expect(
      service.createCheckoutSession('user-1', 'COOPERATIVE' as never),
    ).rejects.toBeInstanceOf(BadRequestException);
  });

  it('createCheckoutSession 503s when Stripe is not configured at all', async () => {
    const db = fakeDb();
    const service = new StripeService(
      db as never,
      fakeConfig({ stripeSecretKey: '' }) as never,
      fakeBillingService() as never,
    );
    await expect(
      service.createCheckoutSession('user-1', 'FARMER_PRO' as never),
    ).rejects.toBeInstanceOf(ServiceUnavailableException);
  });

  it('handleWebhook rejects an invalid signature', async () => {
    const db = fakeDb();
    constructEventMock.mockImplementation(() => {
      throw new Error('bad signature');
    });
    const service = new StripeService(
      db as never,
      fakeConfig() as never,
      fakeBillingService() as never,
    );
    await expect(service.handleWebhook(Buffer.from('{}'), 'sig')).rejects.toBeInstanceOf(
      BadRequestException,
    );
  });

  it('handleWebhook 503s when webhook verification is not configured', async () => {
    const db = fakeDb();
    const service = new StripeService(
      db as never,
      fakeConfig({ stripeWebhookSecret: '' }) as never,
      fakeBillingService() as never,
    );
    await expect(service.handleWebhook(Buffer.from('{}'), 'sig')).rejects.toBeInstanceOf(
      ServiceUnavailableException,
    );
  });

  it('activates the real subscription on checkout.session.completed', async () => {
    const db = fakeDb();
    constructEventMock.mockReturnValue({
      type: 'checkout.session.completed',
      data: {
        object: {
          id: 'cs_test_1',
          metadata: { userId: 'user-1', planCode: 'FARMER_PRO', subscriptionId: 'sub-1' },
        },
      },
    });
    db.query.mockResolvedValueOnce([{ price_minor: '99900', currency: 'PKR', name: 'Farmer Pro' }]);
    const service = new StripeService(
      db as never,
      fakeConfig() as never,
      fakeBillingService() as never,
    );
    const result = await service.handleWebhook(Buffer.from('{}'), 'sig');
    expect(result).toEqual({ received: true });
    expect(db.transaction).toHaveBeenCalled();
  });

  it('is idempotent on a duplicate webhook redelivery (real unique-constraint no-op)', async () => {
    const db = fakeDb();
    constructEventMock.mockReturnValue({
      type: 'checkout.session.completed',
      data: {
        object: {
          id: 'cs_test_1',
          metadata: { userId: 'user-1', planCode: 'FARMER_PRO', subscriptionId: 'sub-1' },
        },
      },
    });
    db.query.mockResolvedValueOnce([{ price_minor: '99900', currency: 'PKR', name: 'Farmer Pro' }]);
    db.query.mockRejectedValueOnce(Object.assign(new Error('duplicate key'), { code: '23505' }));
    const service = new StripeService(
      db as never,
      fakeConfig() as never,
      fakeBillingService() as never,
    );
    await expect(service.handleWebhook(Buffer.from('{}'), 'sig')).resolves.toEqual({
      received: true,
    });
  });

  it('downgrades to PAST_DUE on invoice.payment_failed', async () => {
    const db = fakeDb();
    constructEventMock.mockReturnValue({
      type: 'invoice.payment_failed',
      data: { object: { customer: 'cus_test_1' } },
    });
    const service = new StripeService(
      db as never,
      fakeConfig() as never,
      fakeBillingService() as never,
    );
    await service.handleWebhook(Buffer.from('{}'), 'sig');
    const [sql, params] = db.query.mock.calls[0] as [string, unknown[]];
    expect(sql).toContain("status='PAST_DUE'");
    expect(params).toEqual(['cus_test_1']);
  });

  it('status() reports configured booleans without echoing secrets', () => {
    const service = new StripeService(
      fakeDb() as never,
      fakeConfig() as never,
      fakeBillingService() as never,
    );
    expect(service.status()).toEqual({ configured: true, webhookConfigured: true });
  });
});

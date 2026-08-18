import { AdminBillingService } from '../src/domain/billing/admin-billing.service';

function fakeDb(): {
  query: jest.Mock<Promise<unknown[]>, [string, unknown[]?]>;
  transaction: jest.Mock;
} {
  const query = jest.fn<Promise<unknown[]>, [string, unknown[]?]>().mockResolvedValue([]);
  const transaction = jest.fn((callback: (manager: { query: typeof query }) => unknown) =>
    callback({ query }),
  );
  return { query, transaction };
}

describe('AdminBillingService', () => {
  it('returns an honest all-zero shape when no billing events have ever been persisted', async () => {
    const db = fakeDb();
    db.query.mockResolvedValueOnce([
      {
        totalRevenueByCurrency: {},
        monthlyRevenueByCurrency: {},
        mrrByCurrency: {},
        payingUsersCount: '0',
        planDistribution: [],
        successfulPaymentsCount: '0',
        failedPaymentsCount: '0',
        pendingPaymentsCount: '0',
        refundedPaymentsCount: '0',
      },
    ]);
    const result = await new AdminBillingService(db as never).revenue();
    expect(result.totalRevenueByCurrency).toEqual({});
    expect(result.payingUsersCount).toBe(0);
    expect(result.planDistribution).toEqual([]);
    expect(result.policy.excludesTestAccounts).toBe(true);
  });

  it('keeps mixed currencies separate and never sums them', async () => {
    const db = fakeDb();
    db.query.mockResolvedValueOnce([
      {
        totalRevenueByCurrency: { PKR: 99900, USD: 500 },
        monthlyRevenueByCurrency: { PKR: 99900 },
        mrrByCurrency: { PKR: 99900 },
        payingUsersCount: '1',
        planDistribution: [{ planCode: 'FARMER_PRO', count: 1 }],
        successfulPaymentsCount: '1',
        failedPaymentsCount: '0',
        pendingPaymentsCount: '0',
        refundedPaymentsCount: '0',
      },
    ]);
    const result = await new AdminBillingService(db as never).revenue();
    expect(result.totalRevenueByCurrency).toEqual({ PKR: 99900, USD: 500 });
    expect(result.payingUsersCount).toBe(1);
  });

  it('verifies a pending payment, activates the subscription plan, and records billing events', async () => {
    const db = fakeDb();
    db.query.mockResolvedValueOnce([
      {
        id: 'payment-1',
        subscription_id: 'sub-1',
        plan_code: 'FARMER_PRO',
        status: 'PENDING',
        amount_minor: '99900',
        currency: 'PKR',
      },
    ]);
    const result = await new AdminBillingService(db as never).verifyPayment('admin-1', 'payment-1');
    expect(result).toEqual({ id: 'payment-1', status: 'PAID' });
    const statements = db.query.mock.calls.map((call) => String(call[0]));
    expect(statements.some((sql) => sql.includes("SET status='PAID'"))).toBe(true);
    expect(statements.some((sql) => sql.includes('UPDATE subscriptions SET plan_code=$2'))).toBe(
      true,
    );
  });

  it('rejects verifying a payment that is not PENDING', async () => {
    const db = fakeDb();
    db.query.mockResolvedValueOnce([
      {
        id: 'payment-1',
        subscription_id: 'sub-1',
        plan_code: 'FARMER_PRO',
        status: 'PAID',
        amount_minor: '99900',
        currency: 'PKR',
      },
    ]);
    await expect(
      new AdminBillingService(db as never).verifyPayment('admin-1', 'payment-1'),
    ).rejects.toMatchObject({ response: { code: 'PAYMENT_NOT_PENDING' } });
  });

  it('refunding a paid payment reverts the subscription to FREE', async () => {
    const db = fakeDb();
    db.query.mockResolvedValueOnce([
      {
        id: 'payment-1',
        subscription_id: 'sub-1',
        plan_code: 'FARMER_PRO',
        status: 'PAID',
        amount_minor: '99900',
        currency: 'PKR',
      },
    ]);
    const result = await new AdminBillingService(db as never).refundPayment(
      'admin-1',
      'payment-1',
      'Customer requested refund',
    );
    expect(result).toEqual({ id: 'payment-1', status: 'REFUNDED' });
    const statements = db.query.mock.calls.map((call) => String(call[0]));
    expect(statements.some((sql) => sql.includes("plan_code='FREE'"))).toBe(true);
  });
});

import { FunnelAnalyticsService } from '../src/domain/growth/funnel-analytics.service';

describe('FunnelAnalyticsService', () => {
  it('returns an honest all-zero funnel when no real events have ever been persisted', async () => {
    const db = {
      query: jest.fn().mockResolvedValue([
        {
          landingViews: '0',
          pilotLeads: '0',
          registered: '0',
          onboarded: '0',
          activated: '0',
          active: '0',
          eligibleForReturn: '0',
          returnedAfter7Days: '0',
          upgradeRequested: '0',
          paid: '0',
          referralSignups: '0',
        },
      ]),
    };
    const result = await new FunnelAnalyticsService(db as never).funnel();
    expect(result.funnel.registered).toBe(0);
    expect(result.funnel.activated).toBe(0);
    expect(result.sevenDayReturn.rate).toBeNull();
    expect(result.policy.excludesTestAccounts).toBe(true);
  });

  it('computes a real 7-day return rate from persisted counts', async () => {
    const db = {
      query: jest.fn().mockResolvedValue([
        {
          landingViews: '120',
          pilotLeads: '4',
          registered: '10',
          onboarded: '6',
          activated: '3',
          active: '5',
          eligibleForReturn: '8',
          returnedAfter7Days: '2',
          upgradeRequested: '2',
          paid: '1',
          referralSignups: '1',
        },
      ]),
    };
    const result = await new FunnelAnalyticsService(db as never).funnel();
    expect(result.funnel.registered).toBe(10);
    expect(result.sevenDayReturn.rate).toBe(0.25);
    expect(result.funnel.paid).toBe(1);
  });

  it('sets the test-account flag via a real UPDATE', async () => {
    const query = jest.fn().mockResolvedValue([]);
    const result = await new FunnelAnalyticsService({ query } as never).setTestAccountFlag(
      'user-1',
      true,
    );
    expect(result).toEqual({ userId: 'user-1', isTestAccount: true });
    expect(query).toHaveBeenCalledWith(expect.stringContaining('SET is_test_account=$2'), [
      'user-1',
      true,
    ]);
  });
});

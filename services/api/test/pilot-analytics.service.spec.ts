import { PilotAnalyticsService } from '../src/domain/growth/pilot-analytics.service';

function fakeDb(): { query: jest.Mock<Promise<unknown[]>, [string, unknown[]?]> } {
  const query = jest.fn<Promise<unknown[]>, [string, unknown[]?]>().mockResolvedValue([]);
  return { query };
}

describe('PilotAnalyticsService', () => {
  it('returns an honest all-zero shape for an empty pilot cohort', async () => {
    const db = fakeDb();
    db.query.mockResolvedValueOnce([
      {
        usersAcquired: '0',
        usersOnboarded: '0',
        activeUsers: '0',
        cohortSize: '0',
        farmsCreated: '0',
        cropSeasons: '0',
        eligibleForReturn: '0',
        returnedAfter7Days: '0',
      },
    ]);
    const result = await new PilotAnalyticsService(db as never).summary();
    expect(result.usersAcquired).toBe(0);
    expect(result.farmsCreated).toBe(0);
    expect(result.returningUsers.rate).toBeNull();
    expect(result.policy.excludesTestAccounts).toBe(true);
  });

  it('computes real counts and a non-null returning-user rate when data exists', async () => {
    const db = fakeDb();
    db.query.mockResolvedValueOnce([
      {
        usersAcquired: '5',
        usersOnboarded: '3',
        activeUsers: '2',
        cohortSize: '6',
        farmsCreated: '4',
        cropSeasons: '7',
        eligibleForReturn: '4',
        returnedAfter7Days: '1',
      },
    ]);
    const result = await new PilotAnalyticsService(db as never).summary();
    expect(result.usersAcquired).toBe(5);
    expect(result.usersOnboarded).toBe(3);
    expect(result.activeUsers).toBe(2);
    expect(result.farmsCreated).toBe(4);
    expect(result.cropSeasons).toBe(7);
    expect(result.returningUsers.rate).toBeCloseTo(0.25);
  });
});

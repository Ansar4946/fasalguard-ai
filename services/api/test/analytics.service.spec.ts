import { AnalyticsService } from '../src/domain/reports/analytics.service';
describe('AnalyticsService', () => {
  it('returns numeric aggregate metrics without PII', async () => {
    const db = {
      query: jest.fn().mockResolvedValue([
        {
          registeredFarmers: '12',
          activeFarms: '8',
          activeFields: '14',
          satelliteScans: '20',
          cropScans: '18',
          expertConfirmedCases: '4',
          alertsGenerated: '9',
          farmersAlerted: '6',
          outbreakClusters: '2',
          averageExpertResponseMinutes: '31.5',
          resolvedCases: '3',
        },
      ]),
    };
    const result = await new AnalyticsService(db as never).impact();
    expect(result.scope).toBe('aggregate');
    expect(result.metrics.registeredFarmers).toBe(12);
    expect(result.metrics.averageExpertResponseMinutes).toBe(31.5);
    expect(JSON.stringify(result)).not.toMatch(/email|phone|name|coordinate/i);
  });
});

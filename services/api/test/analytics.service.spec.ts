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

  it('reports only persisted viability evidence and preserves currency boundaries', async () => {
    const db = {
      query: jest.fn().mockResolvedValue([
        {
          farmersOnboarded: '3',
          farmsMonitored: '4',
          geminiAnalyses: '8',
          anomaliesInvestigated: '5',
          incidentsConfirmed: '2',
          actionsGenerated: '6',
          followUpsCompleted: '1',
          customersPaid: '2',
          revenueByCurrency: { PKR: 150000, USD: 2500 },
          feedbackRecords: '21',
        },
      ]),
    };
    const result = await new AnalyticsService(db as never).viability();
    expect(result.scope).toBe('verified-live-and-pilot-evidence');
    expect(result.metrics.geminiAnalyses).toBe(8);
    expect(result.metrics.revenueMinorByCurrency).toEqual({ PKR: 150000, USD: 2500 });
    expect(result.policy.excludesEvidenceClasses).toEqual(['DEMO', 'TEST']);
  });
});

import { ImpactAnalyticsService } from '../src/domain/impact/impact-analytics.service';

function fakeDb(): { query: jest.Mock<Promise<unknown[]>, [string, unknown[]?]> } {
  const query = jest.fn<Promise<unknown[]>, [string, unknown[]?]>().mockResolvedValue([]);
  return { query };
}

describe('ImpactAnalyticsService', () => {
  it('returns an honest all-null/zero shape when no incidents have ever been persisted', async () => {
    const db = fakeDb();
    db.query.mockResolvedValueOnce([
      {
        avgDetectionLatencySeconds: null,
        detectionLatencySampleSize: '0',
        avgNotificationLatencySeconds: null,
        notificationLatencySampleSize: '0',
        avgAcknowledgementLatencySeconds: null,
        acknowledgementSampleSize: '0',
        aiTasksCompleted: '0',
        aiTasksTotal: '0',
        incidentsResolved: '0',
        incidentsEligibleForResolution: '0',
        incidentsWithFollowUp: '0',
        incidentsTotal: '0',
        confirmedTrue: '0',
        confirmedResponses: '0',
        avgRiskReduction: null,
        riskReductionSampleSize: '0',
        avgAffectedAreaChangeHectares: null,
        affectedAreaChangeSampleSize: '0',
      },
    ]);
    const result = await new ImpactAnalyticsService(db as never).summary();
    expect(result.timeToDetection.avgSeconds).toBeNull();
    expect(result.taskCompletionRate.rate).toBeNull();
    expect(result.incidentResolutionRate.rate).toBeNull();
    expect(result.riskReduction.avg).toBeNull();
    expect(result.policy.neverClaimsLossPrevented).toBe(true);
    expect(result.policy.excludesTestAccounts).toBe(true);
  });

  it('computes rates and sample sizes from real counts, never dividing by a zero denominator', async () => {
    const db = fakeDb();
    db.query.mockResolvedValueOnce([
      {
        avgDetectionLatencySeconds: '42.5',
        detectionLatencySampleSize: '4',
        avgNotificationLatencySeconds: '10',
        notificationLatencySampleSize: '4',
        avgAcknowledgementLatencySeconds: '300',
        acknowledgementSampleSize: '2',
        aiTasksCompleted: '6',
        aiTasksTotal: '10',
        incidentsResolved: '3',
        incidentsEligibleForResolution: '4',
        incidentsWithFollowUp: '3',
        incidentsTotal: '4',
        confirmedTrue: '2',
        confirmedResponses: '3',
        avgRiskReduction: '0.35',
        riskReductionSampleSize: '3',
        avgAffectedAreaChangeHectares: '-0.8',
        affectedAreaChangeSampleSize: '3',
      },
    ]);
    const result = await new ImpactAnalyticsService(db as never).summary();
    expect(result.timeToDetection.avgSeconds).toBe(42.5);
    expect(result.timeToDetection.sampleSize).toBe(4);
    expect(result.taskCompletionRate.rate).toBeCloseTo(0.6);
    expect(result.incidentResolutionRate.rate).toBe(0.75);
    expect(result.followUpCompletionRate.rate).toBe(0.75);
    // denominator is responses (3), not all incidents (4) — silence isn't disagreement
    expect(result.confirmedAlertRate.rate).toBeCloseTo(2 / 3);
    expect(result.riskReduction.avg).toBeCloseTo(0.35);
    expect(result.affectedAreaChangeHectares.avg).toBeCloseTo(-0.8);
  });

  it('scopes mySeasonSummary to one farmer and one farm', async () => {
    const db = fakeDb();
    db.query.mockResolvedValueOnce([
      {
        incidentsTotal: '2',
        incidentsResolved: '1',
        incidentsEligibleForResolution: '2',
        avgResolutionSeconds: '3600',
        resolutionLatencySampleSize: '1',
        tasksCompleted: '1',
        tasksTotal: '2',
        avgRiskReduction: null,
        riskReductionSampleSize: '0',
      },
    ]);
    const result = await new ImpactAnalyticsService(db as never).mySeasonSummary(
      'user-1',
      'farm-1',
    );
    expect(result.incidentsTotal).toBe(2);
    expect(result.resolutionRate).toBe(0.5);
    expect(result.taskCompletionRate).toBe(0.5);
    expect(result.riskReduction.avg).toBeNull();
    const [, params] = db.query.mock.calls[0] as [string, unknown[]];
    expect(params).toEqual(['user-1', 'farm-1']);
  });
});

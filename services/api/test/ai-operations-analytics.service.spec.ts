import { AiOperationsAnalyticsService } from '../src/domain/ai-ops/ai-operations-analytics.service';

describe('AiOperationsAnalyticsService', () => {
  it('returns an honest all-zero, null-rate summary when no AI runs have ever been persisted', async () => {
    const db = {
      query: jest.fn().mockResolvedValue([
        {
          geminiCalls: '0',
          completedCalls: '0',
          failedCalls: '0',
          totalCalls: '0',
          avgLatencyMs: null,
          p95LatencyMs: null,
          toolCallCount: '0',
          farmAnalyses: '0',
          incidentsCreated: '0',
          actionsTriggered: '0',
          byOperation: [],
          byProvider: [],
        },
      ]),
    };
    const result = await new AiOperationsAnalyticsService(db as never).summary();
    expect(result.totalCalls).toBe(0);
    expect(result.successRate).toBeNull();
    expect(result.avgLatencyMs).toBeNull();
    expect(result.policy.excludesTestAccounts).toBe(true);
    expect(result.policy.chainOfThoughtExcluded).toBe(true);
  });

  it('computes a real success rate from persisted counts', async () => {
    const db = {
      query: jest.fn().mockResolvedValue([
        {
          geminiCalls: '9',
          completedCalls: '8',
          failedCalls: '1',
          totalCalls: '9',
          avgLatencyMs: '4200.5',
          p95LatencyMs: '9000',
          toolCallCount: '14',
          farmAnalyses: '9',
          incidentsCreated: '2',
          actionsTriggered: '5',
          byOperation: [{ operation: 'FARM_HEALTH_ANALYSIS', count: 9 }],
          byProvider: [{ provider: 'GOOGLE_GEMINI', count: 9 }],
        },
      ]),
    };
    const result = await new AiOperationsAnalyticsService(db as never).summary();
    expect(result.successRate).toBeCloseTo(8 / 9);
    expect(result.avgLatencyMs).toBe(4200.5);
    expect(result.incidentsCreated).toBe(2);
    expect(result.byOperation).toEqual([{ operation: 'FARM_HEALTH_ANALYSIS', count: 9 }]);
  });

  it('exportRows returns real per-run rows for the judge-facing CSV, excluding test accounts', async () => {
    const query = jest
      .fn()
      .mockResolvedValue([
        { id: 'run-1', createdAt: new Date(), operation: 'CROP_ANALYSIS', status: 'COMPLETED' },
      ]);
    const rows = await new AiOperationsAnalyticsService({ query } as never).exportRows();
    expect(rows).toHaveLength(1);
    expect(query).toHaveBeenCalledWith(expect.stringContaining('u.is_test_account=false'));
  });
});

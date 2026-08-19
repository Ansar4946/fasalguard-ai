import { AIRunLogger } from '../src/domain/ai-ops/ai-run-logger.service';
import { AIOperation, AIRunStatus, HumanReviewStatus } from '../src/domain/ai-ops/ai-run.enums';

function fakeConfig(overrides: Record<string, unknown> = {}): { get: jest.Mock } {
  return { get: jest.fn((key: string, fallback?: unknown) => overrides[key] ?? fallback ?? null) };
}

describe('AIRunLogger', () => {
  it('persists a completed run with a real computed latency and no cost when pricing is unconfigured', async () => {
    const query = jest.fn().mockResolvedValue([]);
    const logger = new AIRunLogger({ query } as never, fakeConfig() as never);
    const startedAt = new Date('2026-08-19T00:00:00.000Z');
    const completedAt = new Date('2026-08-19T00:00:03.500Z');
    await logger.record({
      userId: 'user-1',
      farmId: 'farm-1',
      operation: AIOperation.FarmHealthAnalysis,
      provider: 'GOOGLE_GEMINI',
      model: 'gemini-3.6-flash',
      status: AIRunStatus.Completed,
      startedAt,
      completedAt,
      toolCalls: [{ name: 'createIncident', status: 'AWAITING_CONFIRMATION' }],
      inputTokens: 8000,
      outputTokens: 500,
      humanReviewStatus: HumanReviewStatus.Required,
    });
    expect(query).toHaveBeenCalledTimes(1);
    const [sql, params] = query.mock.calls[0] as [string, unknown[]];
    expect(sql).toContain('INSERT INTO ai_runs');
    expect(params[9]).toBe(startedAt);
    expect(params[11]).toBe(3500); // latency_ms
    expect(params[15]).toBe(1); // tool_call_count
    expect(params[16]).toBe(false); // incident_created — proposed, not yet EXECUTED
    expect(params[21]).toBeNull(); // estimated_cost — no pricing configured
  });

  it('estimates a real cost only when both pricing env vars are configured', async () => {
    const query = jest.fn().mockResolvedValue([]);
    const logger = new AIRunLogger(
      { query } as never,
      fakeConfig({
        geminiInputPricePerMillionTokens: 0.1,
        geminiOutputPricePerMillionTokens: 0.4,
      }) as never,
    );
    await logger.record({
      operation: AIOperation.FarmHealthAnalysis,
      provider: 'GOOGLE_GEMINI',
      model: 'gemini-3.6-flash',
      status: AIRunStatus.Completed,
      startedAt: new Date(),
      inputTokens: 1_000_000,
      outputTokens: 1_000_000,
    });
    const [, params] = query.mock.calls[0] as [string, unknown[]];
    expect(params[21]).toBe('0.500000');
    expect(params[22]).toBe('USD');
  });

  it('marks incident_created true only when a createIncident tool call actually executed', async () => {
    const query = jest.fn().mockResolvedValue([]);
    const logger = new AIRunLogger({ query } as never, fakeConfig() as never);
    await logger.record({
      operation: AIOperation.FarmHealthAnalysis,
      provider: 'GOOGLE_GEMINI',
      model: 'gemini-3.6-flash',
      status: AIRunStatus.Completed,
      startedAt: new Date(),
      toolCalls: [{ name: 'createIncident', status: 'EXECUTED' }],
    });
    const [, params] = query.mock.calls[0] as [string, unknown[]];
    expect(params[16]).toBe(true);
  });

  it('never throws — a logging failure is swallowed so it can never break the real AI operation', async () => {
    const query = jest.fn().mockRejectedValue(new Error('db unavailable'));
    const logger = new AIRunLogger({ query } as never, fakeConfig() as never);
    await expect(
      logger.record({
        operation: AIOperation.CropAnalysis,
        provider: 'ROBOFLOW',
        model: 'x',
        status: AIRunStatus.Failed,
        startedAt: new Date(),
        errorCode: 'TIMEOUT',
      }),
    ).resolves.toBeUndefined();
  });
});

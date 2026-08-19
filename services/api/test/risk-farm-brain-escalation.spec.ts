import { RiskAssessmentService } from '../src/domain/risk/risk.service';
import { FieldRiskLevel, RiskTrigger } from '../src/domain/risk/risk.enums';
import type { RiskEngine } from '../src/domain/risk/risk.engine';
import type { FarmBrainService } from '../src/domain/farm-brain/farm-brain.service';

function fakeDb(overrides: Record<string, unknown[]> = {}): { query: jest.Mock } {
  const query = jest.fn((sql: string) => {
    if (sql.includes('FROM field_risk_rulesets'))
      return Promise.resolve([
        {
          rulesetVersion: 'TEST_V1',
          weights: { weatherRisk: 1 },
          thresholds: { low: 20, moderate: 40, high: 60, critical: 80 },
          validityHours: 6,
          validationStatus: 'DEMO_UNVERIFIED',
          description: 'test ruleset',
        },
      ]);
    if (sql.includes('FROM weather_risk_assessments')) return Promise.resolve([]);
    if (sql.includes('FROM community_reports'))
      return Promise.resolve([{ count: 0, confirmed: 0, ids: [] }]);
    if (sql.includes('FROM outbreak_clusters')) return Promise.resolve([{ count: 0, ids: [] }]);
    if (sql.includes('FROM field_health_scores')) return Promise.resolve([]);
    if (sql.includes('FROM crop_scans'))
      return Promise.resolve([{ count: 0, highCount: 0, ids: [] }]);
    if (sql.includes('INSERT INTO field_risk_assessments'))
      return Promise.resolve([{ id: 'assessment-1' }]);
    if (sql.includes('fa.id "farmId"'))
      return Promise.resolve(overrides.owner ?? [{ farmId: 'farm-1', userId: 'user-1' }]);
    if (sql.includes('cc.id "cropCycleId"'))
      return Promise.resolve([
        { fieldId: 'field-1', cropCycleId: null, cropId: null, cropName: null, growthStage: null },
      ]);
    return Promise.resolve([]);
  });
  return { query };
}

function fakeEngine(level: FieldRiskLevel, score: number): RiskEngine {
  return {
    calculate: jest.fn().mockReturnValue({
      score,
      level,
      evidence: [],
      factors: [],
      explanation: { increasedRisk: [], reducedRisk: [], uncertain: [], summary: '' },
    }),
  };
}

describe('RiskAssessmentService autonomous Farm Brain escalation', () => {
  it('starts a Farm Brain investigation when the computed level is HIGH', async () => {
    const db = fakeDb();
    const queue = { add: jest.fn() };
    const start = jest.fn().mockResolvedValue({ id: 'run-1' });
    const farmBrain = { start } as unknown as FarmBrainService;
    const service = new RiskAssessmentService(
      db as never,
      queue as never,
      fakeEngine(FieldRiskLevel.High, 72),
      farmBrain,
    );
    await service.assessField('field-1', RiskTrigger.Weather);
    expect(start).toHaveBeenCalledWith('user-1', 'farm-1', 'field-1');
  });

  it('does not start a Farm Brain investigation when the computed level is LOW', async () => {
    const db = fakeDb();
    const queue = { add: jest.fn() };
    const start = jest.fn();
    const farmBrain = { start } as unknown as FarmBrainService;
    const service = new RiskAssessmentService(
      db as never,
      queue as never,
      fakeEngine(FieldRiskLevel.Low, 15),
      farmBrain,
    );
    await service.assessField('field-1', RiskTrigger.Weather);
    expect(start).not.toHaveBeenCalled();
  });

  it('never lets a Farm Brain failure (e.g. an entitlement limit) break the risk assessment response', async () => {
    const db = fakeDb();
    const queue = { add: jest.fn() };
    const start = jest.fn().mockRejectedValue(new Error('ENTITLEMENT_LIMIT_REACHED'));
    const farmBrain = { start } as unknown as FarmBrainService;
    const service = new RiskAssessmentService(
      db as never,
      queue as never,
      fakeEngine(FieldRiskLevel.Critical, 90),
      farmBrain,
    );
    const result = (await service.assessField('field-1', RiskTrigger.Satellite)) as {
      level: string;
    };
    expect(result.level).toBe(FieldRiskLevel.Critical);
    expect(start).toHaveBeenCalled();
  });

  it('skips escalation silently when the field has no resolvable owner', async () => {
    const db = fakeDb({ owner: [] });
    const queue = { add: jest.fn() };
    const start = jest.fn();
    const farmBrain = { start } as unknown as FarmBrainService;
    const service = new RiskAssessmentService(
      db as never,
      queue as never,
      fakeEngine(FieldRiskLevel.Critical, 85),
      farmBrain,
    );
    await service.assessField('field-1', RiskTrigger.Weather);
    expect(start).not.toHaveBeenCalled();
  });
});

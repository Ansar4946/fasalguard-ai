import { RiskEngine, type RiskEvidence, type RiskRules } from '../src/domain/risk/risk.engine';
import { FieldRiskLevel } from '../src/domain/risk/risk.enums';
const rules: RiskRules = {
  version: 'TEST_V1',
  weights: {
    weatherRisk: 0.25,
    nearbyReports: 0.2,
    confirmedOutbreak: 0.2,
    satelliteDecline: 0.2,
    fieldHistory: 0.15,
  },
  thresholds: { low: 20, moderate: 40, high: 60, critical: 80 },
};
const evidence = (value: number | null): RiskEvidence[] =>
  ['weatherRisk', 'nearbyReports', 'confirmedOutbreak', 'satelliteDecline', 'fieldHistory'].map(
    (key) => ({ key, value, description: key, sourceType: 'TEST', sourceId: null }),
  );
describe('Explainable field risk engine', () => {
  const engine = new RiskEngine();
  it.each([
    [0, FieldRiskLevel.VeryLow],
    [20, FieldRiskLevel.Low],
    [40, FieldRiskLevel.Moderate],
    [60, FieldRiskLevel.High],
    [80, FieldRiskLevel.Critical],
  ] as const)('maps deterministic score %s to %s', (value, level) => {
    const result = engine.calculate(evidence(value), rules);
    expect(result.score).toBe(value);
    expect(result.level).toBe(level);
    expect(result.explanation.summary).toContain('not a disease prediction');
  });
  it('renormalizes around missing evidence and records uncertainty', () => {
    const inputs = evidence(50);
    inputs[0]!.value = null;
    const result = engine.calculate(inputs, rules);
    expect(result.score).toBe(50);
    expect(result.explanation.uncertain).toEqual(['weatherRisk is unavailable.']);
    expect(result.factors).toHaveLength(4);
  });
  it('uses only configured weights and remains deterministic for conflicting evidence', () => {
    const inputs = evidence(0);
    inputs[0]!.value = 100;
    inputs[1]!.value = 100;
    const first = engine.calculate(inputs, rules);
    const second = engine.calculate(inputs, rules);
    expect(first).toEqual(second);
    expect(first.score).toBe(45);
    expect(first.level).toBe(FieldRiskLevel.Moderate);
  });
});

import {
  SeverityEngine,
  type SeverityEvidence,
  type SeverityRules,
} from '../src/domain/severity/severity.engine';
import { SeverityLevel } from '../src/domain/severity/severity.enums';
const rules: SeverityRules = {
  engineVersion: 'demo-test',
  weights: {
    imageConfidenceRisk: 20,
    visualExtent: 15,
    fieldAffected: 20,
    spreadRate: 15,
    historyTrend: 10,
    satelliteDecline: 8,
    nearbyReports: 5,
    weatherRisk: 7,
  },
  thresholds: { moderate: 30, high: 55, critical: 80 },
};
const e = (key: SeverityEvidence['key'], value: number | null): SeverityEvidence => ({
  key,
  value,
  reference: { type: 'TEST', id: key },
  description: key,
});
describe('SeverityEngine', () => {
  const engine = new SeverityEngine();
  it('deterministically applies configured weights and severity thresholds', () => {
    const result = engine.calculate(
      [
        e('imageConfidenceRisk', 80),
        e('fieldAffected', 70),
        e('spreadRate', 90),
        e('weatherRisk', 60),
      ],
      rules,
      { lowConfidence: false, rapidSpread: false, unknownCondition: false },
    );
    expect(result.calculatedScore).toBeCloseTo(76.94, 2);
    expect(result.severity).toBe(SeverityLevel.High);
    expect(result.engineVersion).toBe('demo-test');
    expect(result.weightsUsed).toEqual(rules.weights);
  });
  it('does not treat missing evidence as zero risk', () => {
    const result = engine.calculate([e('fieldAffected', 60), e('nearbyReports', null)], rules, {
      lowConfidence: false,
      rapidSpread: false,
      unknownCondition: false,
    });
    expect(result.calculatedScore).toBe(60);
    expect(result.explanation.whatRemainsUncertain).toContain('nearbyReports was unavailable.');
  });
  it.each([
    {
      flags: { lowConfidence: true, rapidSpread: false, unknownCondition: false },
      reason: 'LOW_MODEL_CONFIDENCE',
    },
    {
      flags: { lowConfidence: false, rapidSpread: true, unknownCondition: false },
      reason: 'RAPID_SPREAD',
    },
    {
      flags: { lowConfidence: false, rapidSpread: false, unknownCondition: true },
      reason: 'UNKNOWN_CONDITION',
    },
  ])('escalates deterministic rule $reason', ({ flags, reason }) => {
    const result = engine.calculate([e('fieldAffected', 10)], rules, flags);
    expect(result.expertEscalation).toBe(true);
    expect(result.escalationReasons).toContain(reason);
  });
  it('escalates critical severity regardless of other flags', () => {
    const result = engine.calculate([e('fieldAffected', 95)], rules, {
      lowConfidence: false,
      rapidSpread: false,
      unknownCondition: false,
    });
    expect(result.severity).toBe(SeverityLevel.Critical);
    expect(result.escalationReasons).toContain('CRITICAL_SEVERITY');
  });
});

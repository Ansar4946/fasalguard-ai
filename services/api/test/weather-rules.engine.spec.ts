import { WeatherRulesEngine, type EvaluatedRule } from '../src/domain/weather/weather-rules.engine';
import { RuleValidationStatus, WeatherSuitability } from '../src/domain/weather/weather.enums';
import type { WeatherPoint } from '../src/domain/weather/providers/weather.provider';
const point: WeatherPoint = {
  time: '2026-08-13T00:00:00Z',
  temperatureC: 40,
  relativeHumidityPercent: 90,
  precipitationMm: 0,
  precipitationProbabilityPercent: 10,
  windSpeedKph: 35,
  windGustKph: 50,
  solarRadiationWm2: 500,
  et0Mm: 0.3,
  soilMoistureM3M3: 0.2,
  soilTemperatureC: 30,
};
const rule = (
  id: string,
  suitability: WeatherSuitability,
  priority: number,
  status = RuleValidationStatus.DemoUnverified,
): EvaluatedRule => ({
  id,
  category: id,
  suitability,
  priority,
  conditions: { all: [{ variable: 'temperatureC', operator: 'gte', value: 35 }] },
  message: id,
  source: 'test',
  validationStatus: status,
});
describe('WeatherRulesEngine', () => {
  const engine = new WeatherRulesEngine();
  it('uses severity before priority for conflicting conditions', () => {
    const result = engine.evaluate(
      [point],
      [
        rule('caution', WeatherSuitability.Caution, 999),
        rule('critical', WeatherSuitability.Critical, 1),
      ],
    );
    expect(result.assessment).toBe(WeatherSuitability.Critical);
    expect(result.matches.map((x) => x.id)).toEqual(['critical', 'caution']);
  });
  it('never promotes demo rules into production guidance', () => {
    const result = engine.evaluate([point], [rule('demo', WeatherSuitability.Harmful, 10)]);
    expect(result.productionAssessment).toBeNull();
    expect(result.recommendationAllowed).toBe(false);
    expect(result.matches[0]?.isExpertApproved).toBe(false);
  });
  it('selects expert-approved production precedence independently', () => {
    const result = engine.evaluate(
      [point],
      [
        rule('demo-critical', WeatherSuitability.Critical, 1),
        rule(
          'approved-harmful',
          WeatherSuitability.Harmful,
          1,
          RuleValidationStatus.ExpertApproved,
        ),
      ],
    );
    expect(result.assessment).toBe(WeatherSuitability.Critical);
    expect(result.productionAssessment).toBe(WeatherSuitability.Harmful);
    expect(result.recommendationAllowed).toBe(true);
  });
});

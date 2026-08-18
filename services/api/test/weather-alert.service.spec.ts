import type { DataSource } from 'typeorm';
import type { ConfigService } from '@nestjs/config';
import { WeatherAlertService } from '../src/domain/weather/weather-alert.service';
import { WeatherSuitability } from '../src/domain/weather/weather.enums';
import type { WeatherService } from '../src/domain/weather/weather.service';
import type { EmailProvider } from '../src/domain/auth/email/email-provider';

const dueField = {
  fieldId: 'f1',
  fieldName: 'North Plot',
  userId: 'u1',
  email: 'farmer@example.com',
};

function makeService(opts: {
  matches: Array<{
    category: string;
    suitability: WeatherSuitability;
    priority: number;
    message: string;
  }>;
  consentGranted: boolean;
  upsertReturnsRow: boolean;
}): { service: WeatherAlertService; sendWeatherAlert: jest.Mock; query: jest.Mock } {
  const query = jest.fn().mockImplementation((sql: string) => {
    if (sql.includes('FROM fields fi JOIN farms')) return Promise.resolve([dueField]);
    if (sql.includes('FROM consents'))
      return Promise.resolve(opts.consentGranted ? [{ granted: true }] : []);
    if (sql.includes('INSERT INTO weather_risk_alerts'))
      return Promise.resolve(opts.upsertReturnsRow ? [{ id: 'alert-1' }] : []);
    throw new Error(`unexpected query: ${sql}`);
  });
  const sendWeatherAlert = jest.fn().mockResolvedValue(undefined);
  const assessField = jest.fn().mockResolvedValue({
    fieldId: dueField.fieldId,
    crop: 'Cotton',
    provider: 'OPEN_METEO',
    assessment: opts.matches[0]?.suitability ?? null,
    productionAssessment: null,
    matches: opts.matches.map((m) => ({
      id: m.category,
      category: m.category,
      suitability: m.suitability,
      priority: m.priority,
      conditions: {},
      message: m.message,
      source: 'test',
      validationStatus: 'DEMO_UNVERIFIED',
      isExpertApproved: false,
      recommendationAllowed: false,
    })),
    recommendationAllowed: false,
    disclaimer: 'demo',
    ruleProvenance: { hasExpertApprovedRules: false, demoRuleCount: 1 },
  });
  const service = new WeatherAlertService(
    { query } as unknown as DataSource,
    { assessField } as unknown as WeatherService,
    { sendWeatherAlert } as unknown as EmailProvider,
    { get: jest.fn().mockReturnValue(12) } as unknown as ConfigService,
  );
  return { service, sendWeatherAlert, query };
}

describe('WeatherAlertService', () => {
  it('does not alert when the worst match is only CAUTION-level', async () => {
    const { service, sendWeatherAlert } = makeService({
      matches: [
        {
          category: 'HIGH_HUMIDITY',
          suitability: WeatherSuitability.Caution,
          priority: 10,
          message: 'humid',
        },
      ],
      consentGranted: true,
      upsertReturnsRow: true,
    });
    const result = await service.dispatchAlerts();
    expect(result).toEqual({ evaluated: 1, alerted: 0 });
    expect(sendWeatherAlert).not.toHaveBeenCalled();
  });

  it('sends an alert for a HARMFUL/CRITICAL match when consent is granted and no recent alert exists', async () => {
    const { service, sendWeatherAlert } = makeService({
      matches: [
        {
          category: 'STRONG_WIND',
          suitability: WeatherSuitability.Harmful,
          priority: 80,
          message: 'Wind conditions may make field operations unsafe.',
        },
      ],
      consentGranted: true,
      upsertReturnsRow: true,
    });
    const result = await service.dispatchAlerts();
    expect(result).toEqual({ evaluated: 1, alerted: 1 });
    expect(sendWeatherAlert).toHaveBeenCalledWith({
      recipient: dueField.email,
      fieldName: dueField.fieldName,
      condition: 'Strong Wind',
      suitability: WeatherSuitability.Harmful,
      guidance: 'Wind conditions may make field operations unsafe.',
    });
  });

  it('does not email when the farmer has not granted NOTIFICATIONS consent', async () => {
    const { service, sendWeatherAlert } = makeService({
      matches: [
        {
          category: 'STRONG_WIND',
          suitability: WeatherSuitability.Critical,
          priority: 80,
          message: 'wind',
        },
      ],
      consentGranted: false,
      upsertReturnsRow: true,
    });
    const result = await service.dispatchAlerts();
    expect(result).toEqual({ evaluated: 1, alerted: 0 });
    expect(sendWeatherAlert).not.toHaveBeenCalled();
  });

  it('does not re-email when the dedup window has not elapsed and severity is unchanged', async () => {
    const { service, sendWeatherAlert } = makeService({
      matches: [
        {
          category: 'STRONG_WIND',
          suitability: WeatherSuitability.Harmful,
          priority: 80,
          message: 'wind',
        },
      ],
      consentGranted: true,
      upsertReturnsRow: false,
    });
    const result = await service.dispatchAlerts();
    expect(result).toEqual({ evaluated: 1, alerted: 0 });
    expect(sendWeatherAlert).not.toHaveBeenCalled();
  });

  it('continues evaluating other fields when one field fails', async () => {
    const fields = [dueField, { ...dueField, fieldId: 'f2', email: 'other@example.com' }];
    const query = jest.fn().mockImplementation((sql: string) => {
      if (sql.includes('FROM fields fi JOIN farms')) return Promise.resolve(fields);
      if (sql.includes('FROM consents')) return Promise.resolve([{ granted: true }]);
      if (sql.includes('INSERT INTO weather_risk_alerts')) return Promise.resolve([{ id: 'a' }]);
      throw new Error(`unexpected query: ${sql}`);
    });
    const sendWeatherAlert = jest.fn().mockResolvedValue(undefined);
    const assessField = jest
      .fn()
      .mockRejectedValueOnce(new Error('provider outage'))
      .mockResolvedValueOnce({
        fieldId: 'f2',
        crop: 'Cotton',
        provider: 'OPEN_METEO',
        assessment: WeatherSuitability.Critical,
        productionAssessment: null,
        matches: [
          {
            id: 'HEAT_STRESS',
            category: 'HEAT_STRESS',
            suitability: WeatherSuitability.Critical,
            priority: 90,
            conditions: {},
            message: 'Extreme heat expected.',
            source: 'test',
            validationStatus: 'DEMO_UNVERIFIED',
            isExpertApproved: false,
            recommendationAllowed: false,
          },
        ],
        recommendationAllowed: false,
        disclaimer: 'demo',
        ruleProvenance: { hasExpertApprovedRules: false, demoRuleCount: 1 },
      });
    const service = new WeatherAlertService(
      { query } as unknown as DataSource,
      { assessField } as unknown as WeatherService,
      { sendWeatherAlert } as unknown as EmailProvider,
      { get: jest.fn().mockReturnValue(12) } as unknown as ConfigService,
    );
    const result = await service.dispatchAlerts();
    expect(result).toEqual({ evaluated: 2, alerted: 1 });
    expect(sendWeatherAlert).toHaveBeenCalledTimes(1);
    expect(sendWeatherAlert).toHaveBeenCalledWith(
      expect.objectContaining({ recipient: 'other@example.com', condition: 'Heat Stress' }),
    );
  });
});

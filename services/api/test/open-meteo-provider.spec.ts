import { ConfigService } from '@nestjs/config';
import type { DataSource } from 'typeorm';
import { OpenMeteoWeatherProvider } from '../src/domain/weather/providers/open-meteo-weather.provider';
describe('OpenMeteoWeatherProvider', () => {
  it('retrieves all weather variables in one normalized request', async () => {
    const requestedUrls: string[] = [];
    const fetcher = jest.fn((input: string | URL | Request) => {
      requestedUrls.push(
        typeof input === 'string' ? input : input instanceof URL ? input.href : input.url,
      );
      return Promise.resolve(
        new Response(
          JSON.stringify({
            latitude: 30.2,
            longitude: 71.5,
            timezone: 'Asia/Karachi',
            current: {
              time: '2026-08-13T12:00',
              temperature_2m: 34,
              relative_humidity_2m: 72,
              precipitation: 1,
              precipitation_probability: 20,
              wind_speed_10m: 12,
              wind_gusts_10m: 22,
              shortwave_radiation: 450,
              et0_fao_evapotranspiration: 0.4,
              soil_moisture_0_to_1cm: 0.24,
              soil_temperature_0cm: 31,
            },
            hourly: {
              time: ['2026-08-13T13:00'],
              temperature_2m: [35],
              relative_humidity_2m: [70],
              precipitation: [0],
              precipitation_probability: [10],
              wind_speed_10m: [13],
              wind_gusts_10m: [23],
              shortwave_radiation: [500],
              et0_fao_evapotranspiration: [0.5],
              soil_moisture_0_to_1cm: [0.23],
              soil_temperature_0cm: [32],
            },
          }),
          { status: 200 },
        ),
      );
    }) as typeof fetch;
    const query = jest.fn().mockResolvedValue([]);
    const db = { query } as unknown as DataSource;
    const provider = new OpenMeteoWeatherProvider(
      db,
      new ConfigService({ openMeteoBaseUrl: 'https://api.open-meteo.com' }),
      fetcher,
    );
    const result = await provider.getWeather(30.2, 71.5);
    expect(fetcher).toHaveBeenCalledTimes(1);
    const url = requestedUrls[0] ?? '';
    expect(url).toContain('soil_moisture_0_to_1cm');
    expect(url).toContain('et0_fao_evapotranspiration');
    expect(result.current).toMatchObject({
      temperatureC: 34,
      relativeHumidityPercent: 72,
      soilMoistureM3M3: 0.24,
    });
    expect(result.hourly).toHaveLength(1);
    expect(query).toHaveBeenCalled();
  });
});

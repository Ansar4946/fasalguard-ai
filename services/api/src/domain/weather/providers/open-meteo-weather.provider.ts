import { Injectable, Optional } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { InjectDataSource } from '@nestjs/typeorm';
import { DataSource } from 'typeorm';
import type { WeatherBundle, WeatherPoint, WeatherProvider } from './weather.provider';
import { WeatherProviderError } from './weather.provider';
import { MetricsService } from '../../../observability/metrics.service';
type Fetcher = typeof fetch;
interface OpenMeteoResponse {
  latitude: number;
  longitude: number;
  timezone: string;
  current?: Record<string, number | string | null>;
  hourly?: Record<string, Array<number | string | null>>;
}
const variables = [
  'temperature_2m',
  'relative_humidity_2m',
  'precipitation',
  'precipitation_probability',
  'wind_speed_10m',
  'wind_gusts_10m',
  'shortwave_radiation',
  'et0_fao_evapotranspiration',
  'soil_moisture_0_to_1cm',
  'soil_temperature_0cm',
];
@Injectable()
export class OpenMeteoWeatherProvider implements WeatherProvider {
  constructor(
    @InjectDataSource() private readonly db: DataSource,
    private readonly config: ConfigService,
    @Optional() private readonly fetcher: Fetcher = fetch,
    @Optional() private readonly metrics?: MetricsService,
  ) {}
  async getWeather(latitude: number, longitude: number): Promise<WeatherBundle> {
    const url = new URL(
      '/v1/forecast',
      this.config.get<string>('openMeteoBaseUrl', 'https://api.open-meteo.com'),
    );
    url.searchParams.set('latitude', String(latitude));
    url.searchParams.set('longitude', String(longitude));
    url.searchParams.set('timezone', 'auto');
    url.searchParams.set('forecast_days', '7');
    url.searchParams.set('current', variables.join(','));
    url.searchParams.set('hourly', variables.join(','));
    const started = Date.now();
    let status: number | null = null;
    try {
      const response = await this.fetchWithRetry(url);
      status = response.status;
      if (!response.ok)
        throw new WeatherProviderError(
          status === 429
            ? 'WEATHER_RATE_LIMITED'
            : status >= 500
              ? 'WEATHER_PROVIDER_OUTAGE'
              : 'WEATHER_REQUEST_REJECTED',
          'Weather provider request failed.',
          status === 429 || status >= 500,
          status,
        );
      const raw = (await response.json()) as OpenMeteoResponse;
      const current = this.point(raw.current ?? {}, 0);
      const times = raw.hourly?.time ?? [];
      const hourly = times.map((_, i) => this.point(raw.hourly ?? {}, i));
      await this.log(started, status, true, null);
      return {
        provider: 'OPEN_METEO',
        latitude: raw.latitude,
        longitude: raw.longitude,
        timezone: raw.timezone,
        fetchedAt: new Date().toISOString(),
        current,
        hourly,
        rawMetadata: { forecastHours: hourly.length },
      };
    } catch (error) {
      await this.log(
        started,
        status,
        false,
        error instanceof WeatherProviderError ? error.code : 'WEATHER_TIMEOUT',
      );
      if (error instanceof WeatherProviderError) throw error;
      throw new WeatherProviderError(
        'WEATHER_PROVIDER_OUTAGE',
        'Weather provider is temporarily unavailable.',
        true,
      );
    }
  }
  private async fetchWithRetry(url: URL): Promise<Response> {
    let lastError: unknown;
    for (let attempt = 0; attempt < 3; attempt += 1) {
      try {
        const response = await this.fetcher(url, { signal: AbortSignal.timeout(12_000) });
        if ((response.status === 429 || response.status >= 500) && attempt < 2) {
          const retryAfter = Number(response.headers.get('retry-after'));
          await new Promise<void>((resolve) =>
            setTimeout(
              resolve,
              Number.isFinite(retryAfter) ? retryAfter * 1000 : 150 * 2 ** attempt,
            ),
          );
          continue;
        }
        return response;
      } catch (error) {
        lastError = error;
        if (attempt === 2) throw error;
        await new Promise<void>((resolve) => setTimeout(resolve, 150 * 2 ** attempt));
      }
    }
    throw lastError;
  }
  private point(
    data: Record<string, number | string | null | Array<number | string | null>>,
    i: number,
  ): WeatherPoint {
    const v = (key: string): number | null => {
      const raw = Array.isArray(data[key]) ? data[key][i] : data[key];
      return typeof raw === 'number' ? raw : null;
    };
    const t = Array.isArray(data.time) ? data.time[i] : data.time;
    return {
      time: typeof t === 'string' ? t : new Date().toISOString(),
      temperatureC: v('temperature_2m'),
      relativeHumidityPercent: v('relative_humidity_2m'),
      precipitationMm: v('precipitation'),
      precipitationProbabilityPercent: v('precipitation_probability'),
      windSpeedKph: v('wind_speed_10m'),
      windGustKph: v('wind_gusts_10m'),
      solarRadiationWm2: v('shortwave_radiation'),
      et0Mm: v('et0_fao_evapotranspiration'),
      soilMoistureM3M3: v('soil_moisture_0_to_1cm'),
      soilTemperatureC: v('soil_temperature_0cm'),
    };
  }
  private async log(
    started: number,
    status: number | null,
    success: boolean,
    errorCode: string | null,
  ): Promise<void> {
    const duration = (Date.now() - started) / 1000;
    this.metrics?.increment('fasalguard_weather_api_requests_total', { success });
    this.metrics?.observe('fasalguard_provider_latency_seconds', duration, {
      provider: 'open_meteo',
      operation: 'forecast',
    });
    if (!success) {
      this.metrics?.increment('fasalguard_external_api_failures_total', {
        provider: 'open_meteo',
        operation: 'forecast',
      });
    }
    try {
      await this.db.query(
        `INSERT INTO integration_usage(provider,operation,request_count,status_code,duration_ms,success,error_code) VALUES('OPEN_METEO','FORECAST',1,$1,$2,$3,$4)`,
        [status, Date.now() - started, success, errorCode],
      );
    } catch {
      /* Usage logging must not mask weather results. */
    }
  }
}

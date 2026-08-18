import { Injectable, Optional } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { InjectDataSource } from '@nestjs/typeorm';
import { DataSource } from 'typeorm';
import type { WeatherBundle, WeatherPoint, WeatherProvider } from './weather.provider';
import { WeatherProviderError } from './weather.provider';
import { MetricsService } from '../../../observability/metrics.service';

type Fetcher = typeof fetch;

interface OpenWeatherMapListItem {
  dt: number;
  dt_txt: string;
  main: {
    temp: number | null;
    humidity: number | null;
  };
  wind?: { speed: number | null; gust?: number | null };
  rain?: { '3h'?: number };
  pop?: number;
}

interface OpenWeatherMapResponse {
  cod: string;
  city: { coord: { lat: number; lon: number }; timezone: number };
  list: OpenWeatherMapListItem[];
}

/**
 * Uses the free "5 day / 3 hour forecast" endpoint, which every OpenWeatherMap API
 * key supports without a separate paid subscription. This genuinely only covers
 * ~5 days, not 7 — Open-Meteo (the default provider) already covers a full 7 days
 * for free with no key, so this exists to make a supplied OWM key usable, not
 * because it's a strict upgrade.
 */
@Injectable()
export class OpenWeatherMapWeatherProvider implements WeatherProvider {
  constructor(
    @InjectDataSource() private readonly db: DataSource,
    private readonly config: ConfigService,
    @Optional() private readonly fetcher: Fetcher = fetch,
    @Optional() private readonly metrics?: MetricsService,
  ) {}

  async getWeather(latitude: number, longitude: number): Promise<WeatherBundle> {
    const apiKey = this.config.get<string>('openWeatherMapApiKey', '');
    if (!apiKey)
      throw new WeatherProviderError(
        'WEATHER_PROVIDER_NOT_CONFIGURED',
        'OpenWeatherMap API key is not configured.',
        false,
      );
    const url = new URL(
      '/data/2.5/forecast',
      this.config.get<string>('openWeatherMapBaseUrl', 'https://api.openweathermap.org'),
    );
    url.searchParams.set('lat', String(latitude));
    url.searchParams.set('lon', String(longitude));
    url.searchParams.set('units', 'metric');
    url.searchParams.set('appid', apiKey);
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
      const raw = (await response.json()) as OpenWeatherMapResponse;
      const hourly = raw.list.map((item) => this.point(item));
      const current = hourly[0] ?? this.emptyPoint();
      await this.log(started, status, true, null);
      return {
        provider: 'OPENWEATHERMAP',
        latitude: raw.city.coord.lat,
        longitude: raw.city.coord.lon,
        timezone: `UTC${raw.city.timezone >= 0 ? '+' : ''}${raw.city.timezone / 3600}`,
        fetchedAt: new Date().toISOString(),
        current,
        hourly,
        rawMetadata: { forecastPoints: hourly.length, horizonDays: 5 },
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

  private point(item: OpenWeatherMapListItem): WeatherPoint {
    return {
      time: new Date(item.dt * 1000).toISOString(),
      temperatureC: item.main.temp ?? null,
      relativeHumidityPercent: item.main.humidity ?? null,
      precipitationMm: item.rain?.['3h'] ?? 0,
      precipitationProbabilityPercent: typeof item.pop === 'number' ? item.pop * 100 : null,
      windSpeedKph: typeof item.wind?.speed === 'number' ? item.wind.speed * 3.6 : null,
      windGustKph: typeof item.wind?.gust === 'number' ? item.wind.gust * 3.6 : null,
      solarRadiationWm2: null,
      et0Mm: null,
      soilMoistureM3M3: null,
      soilTemperatureC: null,
    };
  }

  private emptyPoint(): WeatherPoint {
    return {
      time: new Date().toISOString(),
      temperatureC: null,
      relativeHumidityPercent: null,
      precipitationMm: null,
      precipitationProbabilityPercent: null,
      windSpeedKph: null,
      windGustKph: null,
      solarRadiationWm2: null,
      et0Mm: null,
      soilMoistureM3M3: null,
      soilTemperatureC: null,
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
      provider: 'openweathermap',
      operation: 'forecast',
    });
    if (!success) {
      this.metrics?.increment('fasalguard_external_api_failures_total', {
        provider: 'openweathermap',
        operation: 'forecast',
      });
    }
    try {
      await this.db.query(
        `INSERT INTO integration_usage(provider,operation,request_count,status_code,duration_ms,success,error_code) VALUES('OPENWEATHERMAP','FORECAST',1,$1,$2,$3,$4)`,
        [status, Date.now() - started, success, errorCode],
      );
    } catch {
      /* Usage logging must not mask weather results. */
    }
  }
}

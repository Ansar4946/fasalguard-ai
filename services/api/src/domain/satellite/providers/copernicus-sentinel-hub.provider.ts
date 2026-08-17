import { Injectable, Optional } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { InjectDataSource } from '@nestjs/typeorm';
import { DataSource } from 'typeorm';
import { MetricsService } from '../../../observability/metrics.service';
import { IntegrationOperation } from '../satellite.enums';
import type { CatalogScene, CatalogSearch, SatelliteProvider } from './satellite.provider';
import { SatelliteProviderError } from './satellite.provider';
import { ProviderRateLimiter } from '../provider-rate-limiter';

type Fetcher = typeof fetch;
interface TokenResponse {
  access_token: string;
  expires_in: number;
}
interface CatalogFeature {
  id: string;
  properties?: {
    datetime?: string;
    platform?: string;
    constellation?: string;
    'eo:cloud_cover'?: number;
  };
  [key: string]: unknown;
}
interface CatalogResponse {
  features?: CatalogFeature[];
}

@Injectable()
export class CopernicusSentinelHubProvider implements SatelliteProvider {
  private token: { value: string; expiresAt: number } | null = null;
  private tokenPromise: Promise<string> | null = null;
  private readonly baseUrl: string;
  private readonly clientId: string;
  private readonly clientSecret: string;
  constructor(
    config: ConfigService,
    @InjectDataSource() private readonly db: DataSource,
    @Optional() private readonly fetcher: Fetcher = fetch,
    private readonly limiter?: ProviderRateLimiter,
    @Optional() private readonly metrics?: MetricsService,
  ) {
    this.baseUrl = config
      .get<string>('sentinelHubBaseUrl', 'https://services.sentinel-hub.com')
      .replace(/\/$/, '');
    this.clientId = config.get<string>('sentinelHubClientId', '');
    this.clientSecret = config.get<string>('sentinelHubClientSecret', '');
  }
  async searchCatalog(input: CatalogSearch): Promise<CatalogScene[]> {
    const body = {
      collections: ['sentinel-2-l2a'],
      intersects: input.polygon,
      datetime: `${input.from.toISOString()}/${input.to.toISOString()}`,
      filter: `eo:cloud_cover <= ${input.maxCloudCoverage}`,
      'filter-lang': 'cql2-text',
      limit: input.limit ?? 20,
    };
    const data = await this.request<CatalogResponse>(
      '/api/v1/catalog/1.0.0/search',
      IntegrationOperation.Catalog,
      body,
    );
    return (data.features ?? []).map((f) => ({
      id: f.id,
      satellite: f.properties?.platform ?? f.properties?.constellation ?? 'Sentinel-2',
      acquiredAt: new Date(f.properties?.datetime ?? 0),
      cloudCoverage: Number(f.properties?.['eo:cloud_cover'] ?? 100),
      rawMetadata: this.sanitize(f),
    }));
  }
  process<T>(payload: Record<string, unknown>): Promise<T> {
    return this.request<T>('/api/v1/process', IntegrationOperation.Process, payload);
  }
  async render(payload: Record<string, unknown>): Promise<{ body: Buffer; contentType: string }> {
    const token = await this.getToken();
    const started = Date.now();
    let status: number | null = null;
    try {
      const response = await this.fetcher(`${this.baseUrl}/api/v1/process`, {
        method: 'POST',
        signal: AbortSignal.timeout(30_000),
        headers: {
          authorization: `Bearer ${token}`,
          'content-type': 'application/json',
          accept: 'image/tiff',
        },
        body: JSON.stringify(payload),
      });
      status = response.status;
      if (!response.ok) throw this.errorFor(status);
      const body = Buffer.from(await response.arrayBuffer());
      await this.log(IntegrationOperation.Process, started, status, true, response.headers);
      return { body, contentType: response.headers.get('content-type') ?? 'image/tiff' };
    } catch (error) {
      await this.log(IntegrationOperation.Process, started, status, false);
      throw this.normalize(error);
    }
  }
  statistics<T>(payload: Record<string, unknown>): Promise<T> {
    return this.request<T>('/api/v1/statistics', IntegrationOperation.Statistical, payload);
  }
  private async getToken(): Promise<string> {
    if (this.token && this.token.expiresAt > Date.now() + 30_000) return this.token.value;
    if (this.tokenPromise) return this.tokenPromise;
    this.tokenPromise = this.fetchToken().finally(() => {
      this.tokenPromise = null;
    });
    return this.tokenPromise;
  }
  private async fetchToken(): Promise<string> {
    if (!this.clientId || !this.clientSecret)
      throw new SatelliteProviderError(
        'PROVIDER_NOT_CONFIGURED',
        'Copernicus Sentinel Hub credentials are not configured.',
        false,
      );
    const started = Date.now();
    let status: number | null = null;
    try {
      await this.limiter?.consume('COPERNICUS_SENTINEL_HUB');
      const response = await this.fetcher(
        `${this.baseUrl}/auth/realms/main/protocol/openid-connect/token`,
        {
          method: 'POST',
          signal: AbortSignal.timeout(10_000),
          headers: { 'content-type': 'application/x-www-form-urlencoded' },
          body: new URLSearchParams({
            grant_type: 'client_credentials',
            client_id: this.clientId,
            client_secret: this.clientSecret,
          }),
        },
      );
      status = response.status;
      if (!response.ok) throw this.errorFor(response.status);
      const body = (await response.json()) as TokenResponse;
      this.token = { value: body.access_token, expiresAt: Date.now() + body.expires_in * 1000 };
      await this.log(IntegrationOperation.OAuth, started, status, true, response.headers);
      return body.access_token;
    } catch (error) {
      await this.log(IntegrationOperation.OAuth, started, status, false);
      throw this.normalize(error);
    }
  }
  private async request<T>(
    path: string,
    operation: IntegrationOperation,
    body: Record<string, unknown>,
  ): Promise<T> {
    const token = await this.getToken();
    let last: unknown;
    for (let attempt = 0; attempt < 3; attempt++) {
      const started = Date.now();
      let status: number | null = null;
      try {
        await this.limiter?.consume('COPERNICUS_SENTINEL_HUB');
        const response = await this.fetcher(`${this.baseUrl}${path}`, {
          method: 'POST',
          signal: AbortSignal.timeout(20_000),
          headers: { authorization: `Bearer ${token}`, 'content-type': 'application/json' },
          body: JSON.stringify(body),
        });
        status = response.status;
        if (!response.ok) throw this.errorFor(response.status);
        const data = (await response.json()) as T;
        await this.log(operation, started, status, true, response.headers);
        return data;
      } catch (error) {
        last = this.normalize(error);
        await this.log(operation, started, status, false);
        if (!(last instanceof SatelliteProviderError) || !last.retryable || attempt === 2)
          throw last;
        await this.delay(this.retryDelay(attempt, last.statusCode));
      }
    }
    throw last;
  }
  private errorFor(status: number): SatelliteProviderError {
    if (status === 429)
      return new SatelliteProviderError(
        'PROVIDER_RATE_LIMITED',
        'Satellite provider rate limit reached.',
        true,
        status,
      );
    if (status >= 500)
      return new SatelliteProviderError(
        'PROVIDER_UNAVAILABLE',
        'Satellite provider is temporarily unavailable.',
        true,
        status,
      );
    if (status === 401 || status === 403)
      return new SatelliteProviderError(
        'PROVIDER_AUTH_FAILED',
        'Satellite provider authentication failed.',
        false,
        status,
      );
    return new SatelliteProviderError(
      'PROVIDER_REQUEST_REJECTED',
      'Satellite provider rejected the request.',
      false,
      status,
    );
  }
  private normalize(error: unknown): SatelliteProviderError {
    if (error instanceof SatelliteProviderError) return error;
    if (error instanceof Error && (error.name === 'TimeoutError' || error.name === 'AbortError'))
      return new SatelliteProviderError(
        'PROVIDER_TIMEOUT',
        'Satellite provider request timed out.',
        true,
      );
    return new SatelliteProviderError(
      'PROVIDER_NETWORK_ERROR',
      'Satellite provider request failed.',
      true,
    );
  }
  private retryDelay(attempt: number, status?: number): number {
    return (status === 429 ? 1000 : 250) * 2 ** attempt + Math.floor(Math.random() * 100);
  }
  private delay(ms: number): Promise<void> {
    return new Promise((resolve) => setTimeout(resolve, ms));
  }
  private sanitize(feature: CatalogFeature): Record<string, unknown> {
    const safe = { ...feature };
    delete safe.assets;
    delete safe.links;
    return safe;
  }
  private async log(
    operation: IntegrationOperation,
    started: number,
    status: number | null,
    success: boolean,
    headers?: Headers,
  ): Promise<void> {
    const duration = (Date.now() - started) / 1000;
    this.metrics?.observe('fasalguard_provider_latency_seconds', duration, {
      provider: 'copernicus',
      operation,
    });
    if (!success)
      this.metrics?.increment('fasalguard_external_api_failures_total', {
        provider: 'copernicus',
        operation,
      });
    try {
      await this.db.query(
        `INSERT INTO integration_usage(provider,operation,request_id,status_code,duration_ms,quota_units,success,error_code) VALUES('COPERNICUS_SENTINEL_HUB',$1,$2,$3,$4,$5,$6,$7)`,
        [
          operation,
          headers?.get('x-request-id') ?? null,
          status,
          Date.now() - started,
          Number(headers?.get('x-processingunits-spent') ?? 0) || null,
          success,
          success ? null : status === 429 ? 'PROVIDER_RATE_LIMITED' : 'PROVIDER_ERROR',
        ],
      );
    } catch {
      /* Usage logging must not mask the provider result. */
    }
  }
}

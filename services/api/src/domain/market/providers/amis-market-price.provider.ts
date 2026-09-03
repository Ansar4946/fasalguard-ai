import { Injectable, Optional } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import {
  MarketPriceProviderError,
  type MarketPriceObservation,
  type MarketPriceProvider,
} from './market-price.provider';

interface ScraperResponse {
  provider: 'AMIS';
  fetchedAt: string;
  records: MarketPriceObservation[];
}

const commodities = [
  { name: 'Wheat', commodityId: '1' },
  { name: 'Maize', commodityId: '17' },
  { name: 'Rice (IRRI)', commodityId: '4' },
  { name: 'Seed Cotton(Phutti)', commodityId: '49' },
  { name: 'sugarcane', commodityId: '125' },
];

@Injectable()
export class AmisMarketPriceProvider implements MarketPriceProvider {
  constructor(
    private readonly config: ConfigService,
    @Optional() private readonly fetcher: typeof fetch = fetch,
  ) {}

  async fetchCurrentPrices(): Promise<MarketPriceObservation[]> {
    const enabled = this.config.get<boolean>('amisSyncEnabled', false);
    if (!enabled)
      throw new MarketPriceProviderError(
        'AMIS_SYNC_DISABLED',
        'AMIS synchronization requires explicit operator approval.',
        false,
      );
    const base = this.config.getOrThrow<string>('geospatialAiUrl').replace(/\/$/, '');
    const controller = new AbortController();
    const timeout = setTimeout(
      () => controller.abort(),
      this.config.get<number>('amisScrapeTimeoutMs', 120_000),
    );
    try {
      const response = await this.fetcher(`${base}/v1/market/amis/prices`, {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ commodities }),
        signal: controller.signal,
      });
      if (!response.ok)
        throw new MarketPriceProviderError(
          response.status === 503 ? 'AMIS_SYNC_DISABLED' : 'AMIS_UPSTREAM_FAILURE',
          'AMIS market data is temporarily unavailable.',
          response.status >= 500,
        );
      const payload = (await response.json()) as ScraperResponse;
      if (payload.provider !== 'AMIS' || !Array.isArray(payload.records))
        throw new MarketPriceProviderError('AMIS_INVALID_RESPONSE', 'Invalid AMIS response.', true);
      return payload.records;
    } catch (error) {
      if (error instanceof MarketPriceProviderError) throw error;
      throw new MarketPriceProviderError('AMIS_UPSTREAM_FAILURE', 'AMIS request failed.', true);
    } finally {
      clearTimeout(timeout);
    }
  }
}

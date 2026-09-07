import { Injectable, Optional } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import {
  MarketPriceProviderError,
  type MarketPriceObservation,
  type MarketPriceProvider,
} from './market-price.provider';
import { parseAmisCommodityPage } from './amis-html.parser';

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
    const base = this.approvedBaseUrl();
    const records: MarketPriceObservation[] = [];
    for (const [index, commodity] of commodities.entries()) {
      if (index > 0) await this.delay(this.config.get<number>('amisRequestDelaySeconds', 1) * 1000);
      const target = new URL(
        `ViewPrices.aspx?searchType=0&commodityId=${commodity.commodityId}`,
        base,
      );
      const html = await this.fetchHtml(target);
      try {
        records.push(...parseAmisCommodityPage(html, commodity.name, target.toString()));
      } catch {
        throw new MarketPriceProviderError(
          'AMIS_INVALID_RESPONSE',
          `AMIS returned no usable ${commodity.name} prices.`,
          true,
        );
      }
    }
    return records;
  }

  private approvedBaseUrl(): URL {
    const target = new URL(this.config.get<string>('amisBaseUrl', 'http://www.amis.pk'));
    if (
      !['http:', 'https:'].includes(target.protocol) ||
      !['amis.pk', 'www.amis.pk'].includes(target.hostname) ||
      target.username ||
      target.password
    )
      throw new MarketPriceProviderError('AMIS_INVALID_ORIGIN', 'AMIS origin is not approved.', false);
    target.pathname = target.pathname.replace(/\/?$/, '/');
    target.search = '';
    target.hash = '';
    return target;
  }

  private async fetchHtml(target: URL): Promise<string> {
    const timeoutMs = this.config.get<number>('amisTimeoutSeconds', 30) * 1000;
    for (let attempt = 0; attempt < 3; attempt += 1) {
      const controller = new AbortController();
      const timeout = setTimeout(() => controller.abort(), timeoutMs);
      try {
        const response = await this.fetcher(target, {
          headers: {
            accept: 'text/html,application/xhtml+xml',
            'user-agent': 'FasalGuard-MarketBot/1.0 (+market-data ingestion)',
          },
          redirect: 'error',
          signal: controller.signal,
        });
        if (!response.ok) {
          if (attempt < 2 && [429, 500, 502, 503, 504].includes(response.status)) {
            await this.delay(500 * 2 ** attempt);
            continue;
          }
          throw new MarketPriceProviderError(
            'AMIS_UPSTREAM_FAILURE',
            'AMIS market data is temporarily unavailable.',
            response.status >= 500 || response.status === 429,
          );
        }
        if (!(response.headers.get('content-type') ?? '').toLowerCase().includes('text/html'))
          throw new MarketPriceProviderError('AMIS_INVALID_RESPONSE', 'AMIS returned non-HTML data.', true);
        const html = await response.text();
        if (Buffer.byteLength(html, 'utf8') > 2_000_000)
          throw new MarketPriceProviderError('AMIS_INVALID_RESPONSE', 'AMIS response was too large.', true);
        return html;
      } catch (error) {
        if (error instanceof MarketPriceProviderError) throw error;
        if (attempt === 2)
          throw new MarketPriceProviderError('AMIS_UPSTREAM_FAILURE', 'AMIS request failed.', true);
        await this.delay(500 * 2 ** attempt);
      } finally {
        clearTimeout(timeout);
      }
    }
    throw new MarketPriceProviderError('AMIS_UPSTREAM_FAILURE', 'AMIS request failed.', true);
  }

  private delay(milliseconds: number): Promise<void> {
    return new Promise((resolve) => setTimeout(resolve, milliseconds));
  }
}

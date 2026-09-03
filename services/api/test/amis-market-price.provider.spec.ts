import { ConfigService } from '@nestjs/config';
import { AmisMarketPriceProvider } from '../src/domain/market/providers/amis-market-price.provider';

const config = (enabled: boolean): ConfigService =>
  new ConfigService({
    amisSyncEnabled: enabled,
    amisScrapeTimeoutMs: 5000,
    geospatialAiUrl: 'http://geospatial-ai:8000',
  });

describe('AmisMarketPriceProvider', () => {
  it('cannot be used unless an operator explicitly enables AMIS synchronization', async () => {
    const provider = new AmisMarketPriceProvider(config(false), jest.fn());
    await expect(provider.fetchCurrentPrices()).rejects.toMatchObject({
      code: 'AMIS_SYNC_DISABLED',
      retryable: false,
    });
  });

  it('normalizes the internal scraper boundary without exposing upstream details', async () => {
    const fetcher = jest.fn().mockResolvedValue({
      ok: true,
      json: () =>
        Promise.resolve({
          provider: 'AMIS',
          fetchedAt: '2026-09-03T03:00:00.000Z',
          records: [
            {
              crop: 'Wheat',
              market: 'Lahore Mandi',
              district: 'Lahore',
              province: 'Punjab',
              minimumPrice: 4000,
              maximumPrice: 4300,
              averagePrice: 4150,
              quantity: 100,
              unit: 'KG',
              source: 'AMIS',
              priceDate: '2026-09-03',
              sourceIdentifier: 'AMIS:Wheat:Lahore Mandi:2026-09-03',
              sourceUrl: 'http://www.amis.pk/ViewPrices.aspx?searchType=0&commodityId=1',
            },
          ],
        }),
    });
    const provider = new AmisMarketPriceProvider(config(true), fetcher);

    await expect(provider.fetchCurrentPrices()).resolves.toEqual([
      expect.objectContaining({ crop: 'Wheat', market: 'Lahore Mandi', averagePrice: 4150 }),
    ]);
    expect(fetcher).toHaveBeenCalledWith(
      'http://geospatial-ai:8000/v1/market/amis/prices',
      expect.objectContaining({ method: 'POST' }),
    );
  });

  it('rejects malformed scraper responses', async () => {
    const fetcher = jest.fn().mockResolvedValue({
      ok: true,
      json: () => Promise.resolve({ records: {} }),
    });
    const provider = new AmisMarketPriceProvider(config(true), fetcher);
    await expect(provider.fetchCurrentPrices()).rejects.toMatchObject({
      code: 'AMIS_INVALID_RESPONSE',
    });
  });
});

/* Mock assertions inspect method references without invoking them detached. */
/* eslint-disable @typescript-eslint/unbound-method */
import { ConfigService } from '@nestjs/config';
import type { DataSource } from 'typeorm';
import type { RedisService } from '../src/infrastructure/redis/redis.service';
import { MarketService, type MarketPriceRow } from '../src/domain/market/market.service';
import { MarketProcessor } from '../src/domain/market/market.processor';
import { approvedAmisUrl, dateAgeDays } from '../src/domain/market/market-data-policy';
import type { MarketPriceObservation } from '../src/domain/market/providers/market-price.provider';

const row: MarketPriceRow = {
  id: 'test-only',
  cropName: 'Wheat',
  marketName: 'Lahore',
  district: 'Lahore',
  province: 'Punjab',
  minimumPrice: 9900,
  averagePrice: 10000,
  maximumPrice: 10100,
  quantity: 100,
  unit: 'KG',
  source: 'AMIS',
  sourceUrl: 'http://www.amis.pk/ViewPrices.aspx?commodityId=1',
  sourceIdentifier: 'AMIS:Wheat:Lahore:2026-10-14',
  priceDate: '2026-10-14',
  observedAt: '2026-10-14T09:00:00Z',
};
function setup(records: MarketPriceRow[] = [row]): {
  query: jest.Mock;
  db: DataSource;
  redis: { get: jest.Mock; setJson: jest.Mock };
  service: MarketService;
} {
  const query = jest
    .fn()
    .mockImplementation((sql: string) =>
      Promise.resolve(sql.startsWith('SET LOCAL') ? [] : records),
    );
  const db = {
    transaction: jest.fn().mockImplementation((fn: (manager: unknown) => unknown) => fn({ query })),
  } as unknown as DataSource;
  const redis = {
    get: jest.fn().mockResolvedValue(null),
    setJson: jest.fn().mockResolvedValue(undefined),
  };
  return {
    query,
    db,
    redis,
    service: new MarketService(
      db,
      redis as unknown as RedisService,
      new ConfigService({ marketMaxAgeDays: 1, marketCacheTtlSeconds: 60 }),
    ),
  };
}
describe('Market observation policy', () => {
  beforeEach(() => {
    jest.useFakeTimers();
    jest.setSystemTime(new Date('2026-10-14T10:00:00Z'));
  });
  afterEach(() => jest.useRealTimers());
  it('reclassifies a cached observation across Pakistan midnight', async () => {
    const { redis, service } = setup();
    redis.get.mockResolvedValue(JSON.stringify([{ ...row, priceDate: '2026-10-13' }]));
    expect(await service.current({ limit: 50 })).toMatchObject({ freshness: 'LIVE', cache: 'HIT' });
    jest.setSystemTime(new Date('2026-10-14T19:01:00Z'));
    expect(await service.current({ limit: 50 })).toMatchObject({
      freshness: 'STALE',
      records: [{ ageDays: 2 }],
    });
  });
  it('cache outage preserves database observations and bounded reads', async () => {
    const { redis, query, service } = setup();
    redis.get.mockRejectedValue(new Error('test outage'));
    expect(await service.current({ limit: 50 })).toMatchObject({
      freshness: 'LIVE',
      records: [{ currency: 'PKR', district: null, districtVerified: false }],
    });
    expect(query).toHaveBeenCalledWith("SET LOCAL statement_timeout = '8s'");
  });
  it('database failures produce a safe503 without raw errors', async () => {
    const { db, service } = setup();
    jest.mocked(db.transaction).mockRejectedValue(new Error('private database details'));
    await expect(service.current({ limit: 50 })).rejects.toMatchObject({
      status: 503,
      response: { code: 'MARKET_DATA_UNAVAILABLE' },
    });
  });
  it('unverified districts cannot filter fabricated geography', async () => {
    const { service, db } = setup();
    await expect(service.current({ limit: 50, district: 'Lahore' })).rejects.toMatchObject({
      status: 400,
    });
    expect(db.transaction).not.toHaveBeenCalled();
  });
  it('excludes the partial oldest day when a row limit truncates history', async () => {
    const { service } = setup([
      row,
      { ...row, priceDate: '2026-10-13' },
      { ...row, priceDate: '2026-10-13', marketName: 'Multan' },
    ]);
    expect(await service.history({ crop: 'Wheat', days: 30, limit: 2 })).toMatchObject({
      historyTruncated: true,
      excludedPartialDate: '2026-10-13',
      records: [{ priceDate: '2026-10-14' }],
    });
  });
  it('rejects future observations and does not invent a forecast', async () => {
    const { service } = setup([{ ...row, priceDate: '2099-01-01' }]);
    expect(await service.current({ limit: 50 })).toMatchObject({
      records: [],
      freshness: 'UNAVAILABLE',
      forecast: { status: 'UNAVAILABLE' },
    });
    expect(dateAgeDays('2026-02-30')).toBeNull();
    expect(approvedAmisUrl('https://amis.pk@evil.example/')).toBe(false);
  });
});
describe('Market ingestion conflict detection', () => {
  beforeEach(() => {
    jest.useFakeTimers();
    jest.setSystemTime(new Date('2026-10-14T10:00:00Z'));
  });
  afterEach(() => jest.useRealTimers());
  const observation: MarketPriceObservation = {
    crop: 'Wheat',
    market: 'Lahore',
    district: 'Unknown',
    province: 'Punjab',
    minimumPrice: 9900,
    maximumPrice: 10100,
    averagePrice: 10000,
    quantity: 100,
    unit: 'KG',
    source: 'AMIS',
    sourceUrl: row.sourceUrl,
    sourceIdentifier: row.sourceIdentifier,
    priceDate: '2026-10-14',
  };
  function processor(existing: Partial<MarketPriceRow> | null): {
    worker: MarketProcessor;
    market: MarketService;
  } {
    const query = jest
      .fn()
      .mockImplementation((sql: string) =>
        Promise.resolve(sql.startsWith('INSERT') ? [] : existing ? [existing] : []),
      );
    const db = {
      transaction: jest
        .fn()
        .mockImplementation((fn: (manager: unknown) => unknown) => fn({ query })),
      query: jest.fn().mockResolvedValue([]),
    } as unknown as DataSource;
    const market = {
      invalidateCache: jest.fn().mockResolvedValue(undefined),
    } as unknown as MarketService;
    return {
      worker: new MarketProcessor(
        db,
        {
          fetchCurrentPrices: (): Promise<MarketPriceObservation[]> =>
            Promise.resolve([observation]),
        },
        market,
      ),
      market,
    };
  }
  it('identical retry succeeds without inserting a duplicate', async () => {
    const { worker } = processor(row);
    await expect(worker.process({ name: 'sync_mandi_rates' } as never)).resolves.toEqual({
      received: 1,
      inserted: 0,
    });
  });
  it.each([
    { ...row, averagePrice: 10001 },
    { ...row, sourceIdentifier: 'AMIS:WheatOther:Lahore:2026-10-14' },
    null,
  ])('conflicting retry fails and does not invalidate cache', async (existing) => {
    const { worker, market } = processor(existing);
    await expect(worker.process({ name: 'sync_mandi_rates' } as never)).rejects.toMatchObject({
      code: 'AMIS_OBSERVATION_CONFLICT',
      retryable: false,
    });
    expect(market.invalidateCache).not.toHaveBeenCalled();
  });
});

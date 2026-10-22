import { Inject } from '@nestjs/common';
import { Processor, WorkerHost } from '@nestjs/bullmq';
import { InjectDataSource } from '@nestjs/typeorm';
import type { Job } from 'bullmq';
import { DataSource } from 'typeorm';
import { MARKET_QUEUE, type MarketSyncJob } from './market.scheduler';
import { MarketService } from './market.service';
import { approvedAmisUrl, dateAgeDays } from './market-data-policy';
import {
  MARKET_PRICE_PROVIDER,
  MarketPriceProviderError,
  type MarketPriceObservation,
  type MarketPriceProvider,
} from './providers/market-price.provider';

@Processor(MARKET_QUEUE, { concurrency: 1, limiter: { max: 1, duration: 60_000 } })
export class MarketProcessor extends WorkerHost {
  constructor(
    @InjectDataSource() private readonly db: DataSource,
    @Inject(MARKET_PRICE_PROVIDER) private readonly provider: MarketPriceProvider,
    private readonly market: MarketService,
  ) {
    super();
  }

  async process(job: Job<MarketSyncJob>): Promise<{ received: number; inserted: number }> {
    if (job.name !== 'sync_mandi_rates') throw new Error(`Unsupported market job: ${job.name}`);
    const started = Date.now();
    try {
      const records = await this.provider.fetchCurrentPrices();
      // A reachable source that yields nothing is indistinguishable from a parser break or an
      // unpublished day; it must never be logged or reported as a successful sync.
      if (records.length === 0)
        throw new MarketPriceProviderError(
          'AMIS_NO_RECORDS',
          'AMIS returned no parseable price records; nothing was synced.',
          true,
        );
      const inserted = await this.persist(records);
      await this.market.invalidateCache();
      await this.logUsage(started, true, null);
      return { received: records.length, inserted };
    } catch (error) {
      const normalized =
        error instanceof MarketPriceProviderError
          ? error
          : new MarketPriceProviderError('AMIS_SYNC_FAILED', 'Market sync failed.', true);
      await this.logUsage(started, false, normalized.code);
      throw normalized;
    }
  }

  private async persist(records: MarketPriceObservation[]): Promise<number> {
    return this.db.transaction(async (manager) => {
      await manager.query("SET LOCAL lock_timeout = '3s'");
      await manager.query("SET LOCAL statement_timeout = '8s'");
      let inserted = 0;
      for (const record of records) {
        if (
          ![record.minimumPrice, record.maximumPrice, record.averagePrice].every((v) =>
            Number.isSafeInteger(v),
          ) ||
          record.source !== 'AMIS' ||
          record.unit !== 'KG' ||
          record.quantity !== 100 ||
          !approvedAmisUrl(record.sourceUrl) ||
          dateAgeDays(record.priceDate) === null ||
          record.minimumPrice <= 0 ||
          record.maximumPrice < record.minimumPrice ||
          record.averagePrice < record.minimumPrice ||
          record.averagePrice > record.maximumPrice
        )
          throw new MarketPriceProviderError(
            'AMIS_INVALID_OBSERVATION',
            'AMIS observation failed validation; nothing from this batch was committed.',
            false,
          );
        const rows: Array<{ id: string }> = await manager.query(
          `INSERT INTO mandi_prices(crop_name,market_name,district,province,minimum_price,maximum_price,average_price,quantity,unit,source,source_identifier,source_url,price_date)
           VALUES($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13)
           ON CONFLICT(crop_name,market_name,price_date,source) DO NOTHING RETURNING id`,
          [
            record.crop,
            record.market,
            record.district,
            record.province,
            record.minimumPrice,
            record.maximumPrice,
            record.averagePrice,
            record.quantity,
            record.unit,
            record.source,
            record.sourceIdentifier,
            record.sourceUrl,
            record.priceDate,
          ],
        );
        if (!rows.length) {
          const existing = await manager.query<
            Array<{
              minimumPrice: number;
              maximumPrice: number;
              averagePrice: number;
              quantity: number;
              unit: string;
              sourceIdentifier: string;
            }>
          >(
            `SELECT minimum_price "minimumPrice",maximum_price "maximumPrice",
             average_price "averagePrice",quantity,unit,source_identifier "sourceIdentifier"
             FROM mandi_prices WHERE crop_name=$1 AND market_name=$2 AND price_date=$3 AND source=$4 FOR UPDATE`,
            [record.crop, record.market, record.priceDate, record.source],
          );
          const previous = existing[0];
          const variant = (identifier: string): string =>
            (/^AMIS:([^:]+):/.exec(identifier)?.[1] ?? '').toLowerCase().replace(/[^a-z0-9]/g, '');
          if (
            !previous ||
            !variant(record.sourceIdentifier) ||
            previous.minimumPrice !== record.minimumPrice ||
            previous.maximumPrice !== record.maximumPrice ||
            previous.averagePrice !== record.averagePrice ||
            previous.quantity !== record.quantity ||
            previous.unit !== record.unit ||
            variant(previous.sourceIdentifier) !== variant(record.sourceIdentifier)
          )
            throw new MarketPriceProviderError(
              'AMIS_OBSERVATION_CONFLICT',
              'An existing AMIS observation differs from this batch; no batch changes were committed.',
              false,
            );
        }
        inserted += rows.length;
      }
      return inserted;
    });
  }

  private async logUsage(
    started: number,
    success: boolean,
    errorCode: string | null,
  ): Promise<void> {
    try {
      await this.db.transaction(async (manager) => {
        await manager.query("SET LOCAL lock_timeout = '3s'");
        await manager.query("SET LOCAL statement_timeout = '8s'");
        await manager.query(
          `INSERT INTO integration_usage(provider,operation,request_count,duration_ms,success,error_code) VALUES('AMIS','MARKET_SYNC',1,$1,$2,$3)`,
          [Date.now() - started, success, errorCode],
        );
      });
    } catch {
      // Usage logging must not mask the ingestion result.
    }
  }
}

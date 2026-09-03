import { Inject } from '@nestjs/common';
import { Processor, WorkerHost } from '@nestjs/bullmq';
import { InjectDataSource } from '@nestjs/typeorm';
import type { Job } from 'bullmq';
import { DataSource } from 'typeorm';
import { MARKET_QUEUE, type MarketSyncJob } from './market.scheduler';
import { MarketService } from './market.service';
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
      let inserted = 0;
      for (const record of records) {
        if (
          record.minimumPrice <= 0 ||
          record.maximumPrice < record.minimumPrice ||
          record.averagePrice < record.minimumPrice ||
          record.averagePrice > record.maximumPrice
        )
          continue;
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
      await this.db.query(
        `INSERT INTO integration_usage(provider,operation,request_count,duration_ms,success,error_code) VALUES('AMIS','MARKET_SYNC',1,$1,$2,$3)`,
        [Date.now() - started, success, errorCode],
      );
    } catch {
      // Usage logging must not mask the ingestion result.
    }
  }
}

import { InjectQueue } from '@nestjs/bullmq';
import { Injectable } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { Cron } from '@nestjs/schedule';
import type { Queue } from 'bullmq';

export const MARKET_QUEUE = 'market';
export interface MarketSyncJob {
  requestedAt: string;
}

@Injectable()
export class MarketScheduler {
  constructor(
    @InjectQueue(MARKET_QUEUE) private readonly queue: Queue<MarketSyncJob>,
    private readonly config: ConfigService,
  ) {}

  @Cron('0 0 8 * * *', { name: 'sync_mandi_rates', timeZone: 'Asia/Karachi' })
  async scheduleDailySync(): Promise<boolean> {
    if (!this.config.get<boolean>('amisSyncEnabled', false)) return false;
    const now = new Date();
    const karachiDate = new Intl.DateTimeFormat('en-CA', {
      timeZone: 'Asia/Karachi',
      year: 'numeric',
      month: '2-digit',
      day: '2-digit',
    }).format(now);
    await this.queue.add(
      'sync_mandi_rates',
      { requestedAt: now.toISOString() },
      {
        jobId: `sync_mandi_rates-${karachiDate}`,
        attempts: 4,
        backoff: { type: 'exponential', delay: 30_000 },
        removeOnComplete: 100,
        removeOnFail: 500,
      },
    );
    return true;
  }
}

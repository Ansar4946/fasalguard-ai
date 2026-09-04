import { InjectQueue } from '@nestjs/bullmq';
import { Injectable, type OnApplicationBootstrap } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import type { Queue } from 'bullmq';

export const MARKET_QUEUE = 'market';
export const MARKET_DAILY_SCHEDULER_ID = 'sync_mandi_rates-daily-0800-pkt';
export interface MarketSyncJob {
  requestedAt: string;
}

@Injectable()
export class MarketScheduler implements OnApplicationBootstrap {
  constructor(
    @InjectQueue(MARKET_QUEUE) private readonly queue: Queue<MarketSyncJob>,
    private readonly config: ConfigService,
  ) {}

  /**
   * Nest cron jobs do not replay an occurrence missed while the API was offline.
   * After an API restart at or after 08:00 PKT, enqueue today's deterministic job.
   * The daily job id makes this safe across repeated restarts and multiple replicas.
   */
  async onApplicationBootstrap(): Promise<void> {
    await this.ensurePersistentSchedule();
    await this.catchUpAfterStartup();
  }

  async ensurePersistentSchedule(now = new Date()): Promise<boolean> {
    if (!this.config.get<boolean>('amisSyncEnabled', false)) return false;
    await this.queue.upsertJobScheduler(
      MARKET_DAILY_SCHEDULER_ID,
      { pattern: '0 0 8 * * *', tz: 'Asia/Karachi' },
      {
        name: 'sync_mandi_rates',
        data: { requestedAt: now.toISOString() },
        opts: {
          attempts: 4,
          backoff: { type: 'exponential', delay: 30_000 },
          removeOnComplete: 100,
          removeOnFail: 500,
        },
      },
    );
    return true;
  }

  async catchUpAfterStartup(now = new Date()): Promise<boolean> {
    const hour = Number(
      new Intl.DateTimeFormat('en-GB', {
        timeZone: 'Asia/Karachi',
        hour: '2-digit',
        hourCycle: 'h23',
      }).format(now),
    );
    if (!Number.isFinite(hour) || hour < 8) return false;
    return this.scheduleDailySync(now);
  }

  async scheduleDailySync(now = new Date()): Promise<boolean> {
    if (!this.config.get<boolean>('amisSyncEnabled', false)) return false;
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

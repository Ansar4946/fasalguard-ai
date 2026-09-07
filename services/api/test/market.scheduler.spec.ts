import { ConfigService } from '@nestjs/config';
import type { Queue } from 'bullmq';
import {
  MARKET_DAILY_SCHEDULER_ID,
  MarketScheduler,
  type MarketSyncJob,
} from '../src/domain/market/market.scheduler';

describe('MarketScheduler', () => {
  it('does not enqueue scraping while AMIS is disabled', async () => {
    const add = jest.fn();
    const queue = { add } as unknown as Queue<MarketSyncJob>;
    const scheduler = new MarketScheduler(queue, new ConfigService({ amisSyncEnabled: false }));
    await expect(scheduler.scheduleDailySync()).resolves.toBe(false);
    expect(add).not.toHaveBeenCalled();
  });

  it('uses a daily deterministic id to deduplicate jobs', async () => {
    const add = jest.fn().mockResolvedValue(undefined);
    const queue = { add } as unknown as Queue<MarketSyncJob>;
    const scheduler = new MarketScheduler(queue, new ConfigService({ amisSyncEnabled: true }));
    await expect(scheduler.scheduleDailySync()).resolves.toBe(true);
    const [name, data, options] = add.mock.calls[0] as [string, MarketSyncJob, { jobId: string }];
    expect(name).toBe('sync_mandi_rates');
    expect(Date.parse(data.requestedAt)).not.toBeNaN();
    expect(options.jobId).toMatch(/^sync_mandi_rates-\d{4}-\d{2}-\d{2}-direct-v1$/);
  });

  it('registers a persistent BullMQ schedule for 8 AM Pakistan time', async () => {
    const upsertJobScheduler = jest.fn().mockResolvedValue(undefined);
    const queue = { upsertJobScheduler } as unknown as Queue<MarketSyncJob>;
    const scheduler = new MarketScheduler(queue, new ConfigService({ amisSyncEnabled: true }));

    await expect(
      scheduler.ensurePersistentSchedule(new Date('2026-09-04T05:30:00.000Z')),
    ).resolves.toBe(true);
    const [schedulerId, repeat, template] = upsertJobScheduler.mock.calls[0] as unknown as [
      string,
      { pattern: string; tz: string },
      { name: string; opts: { attempts: number } },
    ];
    expect(schedulerId).toBe(MARKET_DAILY_SCHEDULER_ID);
    expect(repeat).toEqual({ pattern: '0 0 8 * * *', tz: 'Asia/Karachi' });
    expect(template.name).toBe('sync_mandi_rates');
    expect(template.opts.attempts).toBe(4);
  });

  it('catches up a missed daily sync when the API starts after 8 AM Karachi time', async () => {
    const add = jest.fn().mockResolvedValue(undefined);
    const queue = { add } as unknown as Queue<MarketSyncJob>;
    const scheduler = new MarketScheduler(queue, new ConfigService({ amisSyncEnabled: true }));

    await expect(scheduler.catchUpAfterStartup(new Date('2026-09-04T05:15:00.000Z'))).resolves.toBe(
      true,
    );
    expect(add).toHaveBeenCalledTimes(1);
    const [, , options] = add.mock.calls[0] as unknown as [
      string,
      MarketSyncJob,
      { jobId: string },
    ];
    expect(options).toMatchObject({ jobId: 'sync_mandi_rates-2026-09-04-direct-v1' });
  });

  it('waits for the regular cron when the API starts before 8 AM Karachi time', async () => {
    const add = jest.fn().mockResolvedValue(undefined);
    const queue = { add } as unknown as Queue<MarketSyncJob>;
    const scheduler = new MarketScheduler(queue, new ConfigService({ amisSyncEnabled: true }));

    await expect(scheduler.catchUpAfterStartup(new Date('2026-09-04T02:59:59.000Z'))).resolves.toBe(
      false,
    );
    expect(add).not.toHaveBeenCalled();
  });
});

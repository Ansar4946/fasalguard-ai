import { ConfigService } from '@nestjs/config';
import type { Queue } from 'bullmq';
import { MarketScheduler, type MarketSyncJob } from '../src/domain/market/market.scheduler';

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
    expect(options.jobId).toMatch(/^sync_mandi_rates-\d{4}-\d{2}-\d{2}$/);
  });
});

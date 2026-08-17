import type { Job } from 'bullmq';
import type { DataSource } from 'typeorm';
import { NotificationProcessor } from '../src/domain/notifications/notification.processor';
import type { NotificationJob } from '../src/domain/notifications/notification.service';
import type { PushNotificationProvider } from '../src/domain/notifications/providers/push-notification.provider';

describe('NotificationProcessor', () => {
  it('deactivates an invalid FCM token and records INVALID_TOKEN idempotently', async () => {
    const query = jest.fn().mockResolvedValueOnce([
      {
        id: 'delivery-1',
        status: 'SCHEDULED',
        title: 'Inspection suggested',
        body: 'Please inspect North Field.',
        data: {},
        token: 'stale-token',
        tokenId: 'token-1',
        active: true,
      },
    ]);
    const transaction = jest.fn(async (work: (tx: { query: jest.Mock }) => Promise<void>) => {
      await work({ query });
    });
    const send = jest.fn().mockResolvedValue({ messageId: null, status: 'INVALID_TOKEN' });
    const provider: PushNotificationProvider = { send };
    const processor = new NotificationProcessor(
      { query, transaction } as unknown as DataSource,
      provider,
    );
    await processor.process({ data: { deliveryId: 'delivery-1' } } as Job<NotificationJob>);
    expect(send).toHaveBeenCalledTimes(1);
    expect(query).toHaveBeenCalledWith(
      expect.stringContaining('UPDATE device_tokens SET active=false'),
      ['token-1'],
    );
  });

  it('does not redeliver an already processed delivery', async () => {
    const query = jest.fn().mockResolvedValue([{ status: 'SENT', active: true }]);
    const send = jest.fn();
    const provider: PushNotificationProvider = { send };
    const processor = new NotificationProcessor({ query } as unknown as DataSource, provider);
    await processor.process({ data: { deliveryId: 'delivery-1' } } as Job<NotificationJob>);
    expect(send).not.toHaveBeenCalled();
  });
});

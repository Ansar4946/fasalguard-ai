import { DevelopmentPushProvider } from '../src/domain/notifications/providers/development-push.provider';
describe('DevelopmentPushProvider', () => {
  const provider = new DevelopmentPushProvider();
  it('returns a provider identifier without contacting production FCM', async () =>
    expect(
      await provider.send({
        token: 'development-token-value',
        title: 'Task due',
        body: 'Inspect field',
        data: { taskId: '1' },
      }),
    ).toMatchObject({ status: 'SENT' }));
  it('deterministically identifies test invalid tokens', async () =>
    expect(
      await provider.send({ token: 'invalid:stale-device-token', title: 'x', body: 'x', data: {} }),
    ).toEqual({ messageId: null, status: 'INVALID_TOKEN' }));
});

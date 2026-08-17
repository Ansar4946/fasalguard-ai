import { ServiceUnavailableException } from '@nestjs/common';
import { HealthController } from '../src/health/health.controller';
import type { HealthService } from '../src/health/health.service';
describe('HealthController', () => {
  const readiness = jest.fn();
  const controller = new HealthController({ readiness } as unknown as HealthService);
  beforeEach(() => readiness.mockReset());
  it('reports process liveness', () =>
    expect(controller.health()).toEqual(
      expect.objectContaining({ status: 'ok', service: 'fasalguard-api' }),
    ));
  it('reports dependency readiness', async () => {
    readiness.mockResolvedValue({
      database: 'up',
      postgis: 'up',
      redis: 'up',
      objectStorage: 'up',
      aiService: 'down',
    });
    await expect(controller.ready()).resolves.toEqual({
      status: 'ready',
      dependencies: {
        database: 'up',
        postgis: 'up',
        redis: 'up',
        objectStorage: 'up',
        aiService: 'down',
      },
    });
  });
  it('fails readiness when a dependency is down', async () => {
    readiness.mockResolvedValue({
      database: 'up',
      postgis: 'down',
      redis: 'up',
      objectStorage: 'up',
      aiService: 'up',
    });
    await expect(controller.ready()).rejects.toBeInstanceOf(ServiceUnavailableException);
  });
});

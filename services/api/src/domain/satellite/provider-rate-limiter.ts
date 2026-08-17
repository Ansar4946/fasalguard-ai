import { Injectable, type OnModuleDestroy } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { Redis } from 'ioredis';
import { SatelliteProviderError } from './providers/satellite.provider';
@Injectable()
export class ProviderRateLimiter implements OnModuleDestroy {
  private readonly redis: Redis;
  private readonly limit: number;
  constructor(config: ConfigService) {
    this.redis = new Redis(config.getOrThrow<string>('redisUrl'), {
      lazyConnect: false,
      maxRetriesPerRequest: 2,
    });
    this.limit = config.get<number>('satelliteProviderRequestsPerMinute', 30);
  }
  async consume(provider: string): Promise<void> {
    const bucket = Math.floor(Date.now() / 60_000);
    const key = `provider-rate:${provider}:${bucket}`;
    const count = await this.redis.incr(key);
    if (count === 1) await this.redis.expire(key, 70);
    if (count > this.limit)
      throw new SatelliteProviderError(
        'LOCAL_PROVIDER_RATE_LIMIT',
        'Satellite provider request budget is temporarily exhausted.',
        true,
        429,
      );
  }
  async onModuleDestroy(): Promise<void> {
    if (this.redis.status !== 'end') await this.redis.quit();
  }
}

import { Injectable, type OnModuleDestroy, type OnModuleInit } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { Redis } from 'ioredis';
@Injectable()
export class RedisService implements OnModuleInit, OnModuleDestroy {
  private readonly client: Redis;
  constructor(config: ConfigService) {
    this.client = new Redis(config.getOrThrow<string>('redisUrl'), {
      lazyConnect: true,
      connectTimeout: 5000,
      commandTimeout: 3000,
      maxRetriesPerRequest: 2,
      enableReadyCheck: true,
    });
  }
  async onModuleInit(): Promise<void> {
    await this.client.connect();
  }
  ping(): Promise<string> {
    return this.client.ping();
  }
  get(key: string): Promise<string | null> {
    return this.client.get(key);
  }
  async setJson(key: string, value: unknown, ttlSeconds: number): Promise<void> {
    await this.client.set(key, JSON.stringify(value), 'EX', ttlSeconds);
  }
  async delete(...keys: string[]): Promise<number> {
    return keys.length ? this.client.del(...keys) : 0;
  }
  async onModuleDestroy(): Promise<void> {
    if (this.client.status !== 'end') await this.client.quit();
  }
}

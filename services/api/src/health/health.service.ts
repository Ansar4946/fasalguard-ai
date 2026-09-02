import { Injectable } from '@nestjs/common';
import { InjectDataSource } from '@nestjs/typeorm';
import type { DataSource } from 'typeorm';
import { RedisService } from '../infrastructure/redis/redis.service';
import { ConfigService } from '@nestjs/config';
export interface DependencyStatus {
  database: 'up' | 'down';
  postgis: 'up' | 'down';
  redis: 'up' | 'down';
  objectStorage: 'up' | 'down';
  aiService: 'up' | 'down' | 'not_configured';
}
@Injectable()
export class HealthService {
  constructor(
    @InjectDataSource() private readonly dataSource: DataSource,
    private readonly redis: RedisService,
    private readonly config: ConfigService,
  ) {}
  async readiness(): Promise<DependencyStatus> {
    const status: DependencyStatus = {
      database: 'down',
      postgis: 'down',
      redis: 'down',
      objectStorage: 'down',
      aiService: 'not_configured',
    };
    try {
      await this.dataSource.query('SELECT 1');
      status.database = 'up';
      const rows: Array<{ enabled: boolean }> = await this.dataSource.query(
        "SELECT EXISTS (SELECT 1 FROM pg_extension WHERE extname='postgis') AS enabled",
      );
      status.postgis = rows[0]?.enabled ? 'up' : 'down';
    } catch {
      // Readiness reports dependency state without exposing connection details.
    }
    try {
      status.redis = (await this.redis.ping()) === 'PONG' ? 'up' : 'down';
    } catch {
      // Readiness reports dependency state without exposing connection details.
    }
    const storage = this.config.get<string>('objectStorageProvider', 'mock');
    const notProduction = this.config.get<string>('nodeEnv') !== 'production';
    status.objectStorage =
      (storage === 'mock' || storage === 'local-disk') && notProduction
        ? 'up'
        : storage === 'alibaba' &&
            Boolean(this.config.get<string>('ossRegion')) &&
            Boolean(this.config.get<string>('ossBucket')) &&
            Boolean(this.config.get<string>('ossAccessKeyId')) &&
            Boolean(this.config.get<string>('ossAccessKeySecret'))
          ? 'up'
          : 'down';
    const aiUrl = this.config.get<string>('selfHostedVisionUrl', '');
    if (aiUrl) {
      try {
        const response = await fetch(new URL('/health', aiUrl), {
          signal: AbortSignal.timeout(2000),
          redirect: 'error',
        });
        status.aiService = response.ok ? 'up' : 'down';
      } catch {
        status.aiService = 'down';
      }
    }
    return status;
  }
}

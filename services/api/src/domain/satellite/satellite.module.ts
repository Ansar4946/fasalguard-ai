import { Module } from '@nestjs/common';
import { BullModule } from '@nestjs/bullmq';
import { ConfigService } from '@nestjs/config';
import { CopernicusSentinelHubProvider } from './providers/copernicus-sentinel-hub.provider';
import { SATELLITE_PROVIDER } from './providers/satellite.provider';
import { SatelliteController } from './satellite.controller';
import { SatelliteProcessor } from './satellite.processor';
import { SATELLITE_QUEUE, SatelliteService } from './satellite.service';
import { MediaModule } from '../media/media.module';
import { StressAnalysisClient } from './stress-analysis.client';
import { ScheduleModule } from '@nestjs/schedule';
import {
  AutomaticMonitoringService,
  SATELLITE_MONITORING_QUEUE,
} from './automatic-monitoring.service';
import { AutomaticMonitoringProcessor } from './automatic-monitoring.processor';
import { ProviderRateLimiter } from './provider-rate-limiter';
import { IntegrationUsageController } from './integration-usage.controller';
import { RiskModule } from '../risk/risk.module';
import { schedulerEnabled, workersEnabled } from '../../infrastructure/execution-role';
@Module({
  imports: [
    MediaModule,
    RiskModule,
    ScheduleModule.forRoot(),
    BullModule.forRootAsync({
      inject: [ConfigService],
      useFactory: (config: ConfigService) => {
        const url = new URL(config.getOrThrow<string>('redisUrl'));
        return {
          prefix:
            config.get<string>('nodeEnv') === 'test'
              ? `fasalguard:test:${process.pid}`
              : 'fasalguard:satellite',
          connection: {
            host: url.hostname,
            port: Number(url.port || 6379),
            username: url.username || undefined,
            password: url.password || undefined,
            tls: url.protocol === 'rediss:' ? {} : undefined,
          },
        };
      },
    }),
    BullModule.registerQueue({ name: SATELLITE_QUEUE }),
    BullModule.registerQueue({ name: SATELLITE_MONITORING_QUEUE }),
  ],
  controllers: [SatelliteController, IntegrationUsageController],
  providers: [
    SatelliteService,
    ...(workersEnabled() ? [SatelliteProcessor] : []),
    StressAnalysisClient,
    ...(schedulerEnabled() ? [AutomaticMonitoringService] : []),
    ...(workersEnabled() ? [AutomaticMonitoringProcessor] : []),
    ProviderRateLimiter,
    CopernicusSentinelHubProvider,
    { provide: SATELLITE_PROVIDER, useExisting: CopernicusSentinelHubProvider },
  ],
  exports: [SATELLITE_PROVIDER],
})
export class SatelliteModule {}

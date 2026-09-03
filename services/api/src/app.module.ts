import { Module } from '@nestjs/common';
import { APP_GUARD } from '@nestjs/core';
import { ThrottlerGuard, ThrottlerModule } from '@nestjs/throttler';
import { ConfigModule, ConfigService } from '@nestjs/config';
import { LoggerModule } from 'nestjs-pino';
import configuration from './config/configuration';
import { environmentSchema } from './config/environment';
import { createRequestId } from './common/middleware/request-id.middleware';
import { HealthModule } from './health/health.module';
import { DatabaseModule } from './infrastructure/database/database.module';
import { RedisModule } from './infrastructure/redis/redis.module';
import { GeospatialModule } from './domain/geospatial/geospatial.module';
import { AuthModule } from './domain/auth/auth.module';
import { JwtAuthGuard } from './domain/auth/guards/jwt-auth.guard';
import { RolesGuard } from './domain/auth/guards/roles.guard';
import { FarmManagementModule } from './domain/farms/farm-management.module';
import { MediaModule } from './domain/media/media.module';
import { SatelliteModule } from './domain/satellite/satellite.module';
import { WeatherModule } from './domain/weather/weather.module';
import { CropScanModule } from './domain/crop-scans/crop-scan.module';
import { FollowUpModule } from './domain/follow-up/follow-up.module';
import { SeverityModule } from './domain/severity/severity.module';
import { KnowledgeModule } from './domain/knowledge/knowledge.module';
import { ExpertReviewModule } from './domain/expert-review/expert-review.module';
import { OutbreakModule } from './domain/outbreaks/outbreak.module';
import { RiskModule } from './domain/risk/risk.module';
import { NotificationModule } from './domain/notifications/notification.module';
import { AssistantModule } from './domain/assistant/assistant.module';
import { SyncModule } from './domain/sync/sync.module';
import { ReportModule } from './domain/reports/report.module';
import { ObservabilityModule } from './observability/observability.module';
import { FarmDigitalTwinModule } from './domain/digital-twin/farm-digital-twin.module';
import { ApiExceptionFilter } from './common/filters/api-exception.filter';
import { FarmBrainModule } from './domain/farm-brain/farm-brain.module';
import { BillingModule } from './domain/billing/billing.module';
import { GrowthModule } from './domain/growth/growth.module';
import { AiOpsModule } from './domain/ai-ops/ai-ops.module';
import { ImpactModule } from './domain/impact/impact.module';
import { MarketModule } from './domain/market/market.module';
@Module({
  imports: [
    ConfigModule.forRoot({
      isGlobal: true,
      cache: true,
      load: [configuration],
      validationSchema: environmentSchema,
      validationOptions: { allowUnknown: true, abortEarly: false },
    }),
    ObservabilityModule,
    LoggerModule.forRootAsync({
      inject: [ConfigService],
      useFactory: (config: ConfigService) => ({
        pinoHttp: {
          level: config.get<string>('logLevel', 'info'),
          autoLogging: true,
          genReqId: createRequestId,
          redact: {
            paths: [
              'req.headers.authorization',
              'req.headers.cookie',
              'req.headers.x-api-key',
              'res.headers["set-cookie"]',
              'req.body.password',
              'req.body.refreshToken',
              'req.body.token',
              'req.body.apiKey',
              'req.body.checksum',
              'res.body.accessToken',
              'res.body.refreshToken',
              '*.password',
              '*.secret',
              '*.privateKey',
              '*.apiKey',
            ],
            censor: '[REDACTED]',
          },
        },
      }),
    }),
    DatabaseModule,
    RedisModule,
    HealthModule,
    GeospatialModule,
    ThrottlerModule.forRoot([{ ttl: 60_000, limit: 120 }]),
    AuthModule,
    FarmManagementModule,
    MediaModule,
    SatelliteModule,
    WeatherModule,
    CropScanModule,
    FollowUpModule,
    SeverityModule,
    KnowledgeModule,
    ExpertReviewModule,
    OutbreakModule,
    RiskModule,
    NotificationModule,
    AssistantModule,
    SyncModule,
    ReportModule,
    FarmDigitalTwinModule,
    FarmBrainModule,
    BillingModule,
    GrowthModule,
    AiOpsModule,
    ImpactModule,
    MarketModule,
  ],
  providers: [
    ApiExceptionFilter,
    { provide: APP_GUARD, useClass: ThrottlerGuard },
    { provide: APP_GUARD, useClass: JwtAuthGuard },
    { provide: APP_GUARD, useClass: RolesGuard },
  ],
})
export class AppModule {}

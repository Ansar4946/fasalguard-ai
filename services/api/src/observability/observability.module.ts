import { Global, Module } from '@nestjs/common';
import { APP_INTERCEPTOR } from '@nestjs/core';
import { ERROR_REPORTER, SentryCompatibleErrorReporter } from './error-reporter';
import { MetricsController } from './metrics.controller';
import { MetricsService } from './metrics.service';
import { RequestObservabilityInterceptor } from './request-observability.interceptor';
@Global()
@Module({
  controllers: [MetricsController],
  providers: [
    MetricsService,
    SentryCompatibleErrorReporter,
    { provide: ERROR_REPORTER, useExisting: SentryCompatibleErrorReporter },
    { provide: APP_INTERCEPTOR, useClass: RequestObservabilityInterceptor },
  ],
  exports: [MetricsService, ERROR_REPORTER],
})
export class ObservabilityModule {}

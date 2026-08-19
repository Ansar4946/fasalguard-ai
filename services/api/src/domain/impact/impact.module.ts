import { Module } from '@nestjs/common';
import { AdminImpactController } from './admin-impact.controller';
import { IncidentController } from './incident.controller';
import { IncidentLifecycleService } from './incident-lifecycle.service';
import { ImpactAnalyticsService } from './impact-analytics.service';

@Module({
  controllers: [IncidentController, AdminImpactController],
  providers: [IncidentLifecycleService, ImpactAnalyticsService],
  exports: [IncidentLifecycleService, ImpactAnalyticsService],
})
export class ImpactModule {}

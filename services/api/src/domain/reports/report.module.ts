import { BullModule } from '@nestjs/bullmq';
import { Module } from '@nestjs/common';
import { BillingModule } from '../billing/billing.module';
import { MediaModule } from '../media/media.module';
import { AnalyticsController } from './analytics.controller';
import { AnalyticsService } from './analytics.service';
import { ReportController } from './report.controller';
import { ReportProcessor } from './report.processor';
import { REPORT_QUEUE, ReportService } from './report.service';
import { workersEnabled } from '../../infrastructure/execution-role';
@Module({
  imports: [BullModule.registerQueue({ name: REPORT_QUEUE }), MediaModule, BillingModule],
  controllers: [ReportController, AnalyticsController],
  providers: [ReportService, ...(workersEnabled() ? [ReportProcessor] : []), AnalyticsService],
  exports: [ReportService, AnalyticsService],
})
export class ReportModule {}

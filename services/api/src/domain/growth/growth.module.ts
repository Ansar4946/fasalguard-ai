import { Module } from '@nestjs/common';
import { AuthModule } from '../auth/auth.module';
import { schedulerEnabled } from '../../infrastructure/execution-role';
import { AdminFunnelController } from './admin-funnel.controller';
import { FunnelAnalyticsService } from './funnel-analytics.service';
import { GrowthController } from './growth.controller';
import { LandingViewService } from './landing-view.service';
import { LifecycleEmailService } from './lifecycle-email.service';
import { OnboardingReminderService } from './onboarding-reminder.service';
import { PilotLeadService } from './pilot-lead.service';
import { ReferralService } from './referral.service';
import { WeeklySummaryService } from './weekly-summary.service';

@Module({
  imports: [AuthModule],
  controllers: [GrowthController, AdminFunnelController],
  providers: [
    PilotLeadService,
    LandingViewService,
    ReferralService,
    FunnelAnalyticsService,
    LifecycleEmailService,
    ...(schedulerEnabled() ? [OnboardingReminderService, WeeklySummaryService] : []),
  ],
  exports: [ReferralService, LifecycleEmailService],
})
export class GrowthModule {}

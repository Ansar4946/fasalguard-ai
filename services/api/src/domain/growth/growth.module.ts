import { Module } from '@nestjs/common';
import { AuthModule } from '../auth/auth.module';
import { schedulerEnabled } from '../../infrastructure/execution-role';
import { AdminFeedbackController } from './admin-feedback.controller';
import { AdminFunnelController } from './admin-funnel.controller';
import { AdminPilotController } from './admin-pilot.controller';
import { FeedbackService } from './feedback.service';
import { FunnelAnalyticsService } from './funnel-analytics.service';
import { GrowthController } from './growth.controller';
import { LandingViewService } from './landing-view.service';
import { LifecycleEmailService } from './lifecycle-email.service';
import { OnboardingReminderService } from './onboarding-reminder.service';
import { PilotAnalyticsService } from './pilot-analytics.service';
import { PilotEnrollmentService } from './pilot-enrollment.service';
import { PilotLeadService } from './pilot-lead.service';
import { PilotLifecycleSyncService } from './pilot-lifecycle-sync.service';
import { ReferralService } from './referral.service';
import { WeeklySummaryService } from './weekly-summary.service';

@Module({
  imports: [AuthModule],
  controllers: [
    GrowthController,
    AdminFunnelController,
    AdminPilotController,
    AdminFeedbackController,
  ],
  providers: [
    PilotLeadService,
    LandingViewService,
    ReferralService,
    FunnelAnalyticsService,
    LifecycleEmailService,
    PilotEnrollmentService,
    PilotAnalyticsService,
    FeedbackService,
    ...(schedulerEnabled()
      ? [OnboardingReminderService, WeeklySummaryService, PilotLifecycleSyncService]
      : []),
  ],
  exports: [ReferralService, LifecycleEmailService],
})
export class GrowthModule {}

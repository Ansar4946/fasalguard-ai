import { Body, Controller, Get, HttpCode, HttpStatus, Post } from '@nestjs/common';
import { ApiOperation, ApiTags } from '@nestjs/swagger';
import { Throttle } from '@nestjs/throttler';
import type { AuthPrincipal } from '../auth/auth.types';
import { CurrentPrincipal } from '../auth/decorators/current-user.decorator';
import { Public } from '../auth/decorators/public.decorator';
import {
  CreatePilotLeadDto,
  RespondToPilotInviteDto,
  SubmitEventFeedbackDto,
  SubmitFeedbackDto,
} from './dto/growth.dto';
import { FeedbackService } from './feedback.service';
import { LandingViewService } from './landing-view.service';
import { PilotEnrollmentService } from './pilot-enrollment.service';
import { PilotLeadService } from './pilot-lead.service';
import { ReferralService } from './referral.service';
/* eslint-disable @typescript-eslint/explicit-function-return-type */

@ApiTags('Growth')
@Controller({ path: 'growth', version: '1' })
export class GrowthController {
  constructor(
    private readonly pilotLeads: PilotLeadService,
    private readonly landingViews: LandingViewService,
    private readonly referral: ReferralService,
    private readonly pilotEnrollment: PilotEnrollmentService,
    private readonly feedback: FeedbackService,
  ) {}

  @Public()
  @Throttle({ default: { limit: 5, ttl: 60_000 } })
  @HttpCode(HttpStatus.ACCEPTED)
  @ApiOperation({ summary: 'Submit a pre-account pilot lead from the "Join Free Pilot" form' })
  @Post('pilot-leads')
  submitPilotLead(@Body() dto: CreatePilotLeadDto) {
    return this.pilotLeads.submit(dto);
  }

  @Public()
  @Throttle({ default: { limit: 20, ttl: 60_000 } })
  @HttpCode(HttpStatus.NO_CONTENT)
  @ApiOperation({ summary: 'Record one landing-page view for the daily counter' })
  @Post('landing-view')
  async recordLandingView(): Promise<void> {
    await this.landingViews.recordView();
  }

  @ApiOperation({ summary: "Get the caller's referral code and real invite count" })
  @Get('referral')
  myReferral(@CurrentPrincipal() p: AuthPrincipal) {
    return this.referral.myReferral(p.userId);
  }

  @ApiOperation({ summary: 'Accept or decline a real pilot-program invitation' })
  @Post('pilot-enrollment/respond')
  respondToPilotInvite(@CurrentPrincipal() p: AuthPrincipal, @Body() dto: RespondToPilotInviteDto) {
    return this.pilotEnrollment.respondToInvite(p.userId, dto.accepted);
  }

  @ApiOperation({ summary: 'Submit real farmer feedback' })
  @Post('feedback')
  submitFeedback(@CurrentPrincipal() p: AuthPrincipal, @Body() dto: SubmitFeedbackDto) {
    return this.feedback.submit(p.userId, dto);
  }

  @ApiOperation({
    summary:
      'Submit feedback tied to a real completed event (roadmap/incident/weekly report/diagnosis) — validated against the real record',
  })
  @Post('feedback/events')
  submitEventFeedback(@CurrentPrincipal() p: AuthPrincipal, @Body() dto: SubmitEventFeedbackDto) {
    return this.feedback.submitEvent(p.userId, dto);
  }

  @Public()
  @ApiOperation({
    summary: 'Real, published testimonials — only rows an admin has explicitly published',
  })
  @Get('testimonials')
  publicTestimonials() {
    return this.feedback.listPublished();
  }
}

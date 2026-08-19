import { Body, Controller, Get, Param, ParseUUIDPipe, Post } from '@nestjs/common';
import { ApiBearerAuth, ApiOperation, ApiTags } from '@nestjs/swagger';
import type { AuthPrincipal } from '../auth/auth.types';
import { CurrentPrincipal } from '../auth/decorators/current-user.decorator';
import { Roles } from '../auth/decorators/roles.decorator';
import { UserRole } from '../identity/identity.enums';
import { PublishFeedbackDto } from './dto/growth.dto';
import { FeedbackService } from './feedback.service';
/* eslint-disable @typescript-eslint/explicit-function-return-type */

@ApiTags('Admin feedback')
@ApiBearerAuth()
@Roles(UserRole.Admin, UserRole.SuperAdmin)
@Controller({ path: 'admin/feedback', version: '1' })
export class AdminFeedbackController {
  constructor(private readonly feedback: FeedbackService) {}

  @ApiOperation({ summary: 'Real feedback rows, with consent-to-quote and publish state' })
  @Get()
  list() {
    return this.feedback.listForAdmin();
  }

  @ApiOperation({
    summary: 'Feedback count, positive rate, feature breakdown, testimonial-candidate count',
  })
  @Get('report')
  report() {
    return this.feedback.report();
  }

  @ApiOperation({ summary: 'Consented, positive, not-yet-published feedback awaiting curation' })
  @Get('testimonial-candidates')
  candidates() {
    return this.feedback.listTestimonialCandidates();
  }

  @ApiOperation({
    summary: 'Publish one piece of feedback as a public testimonial — requires real user consent',
  })
  @Post(':id/publish')
  publish(
    @CurrentPrincipal() p: AuthPrincipal,
    @Param('id', new ParseUUIDPipe({ version: '4' })) id: string,
    @Body() dto: PublishFeedbackDto,
  ) {
    return this.feedback.publish(p.userId, id, dto);
  }

  @ApiOperation({ summary: 'Retract a published testimonial' })
  @Post(':id/unpublish')
  unpublish(
    @CurrentPrincipal() p: AuthPrincipal,
    @Param('id', new ParseUUIDPipe({ version: '4' })) id: string,
  ) {
    return this.feedback.unpublish(p.userId, id);
  }
}

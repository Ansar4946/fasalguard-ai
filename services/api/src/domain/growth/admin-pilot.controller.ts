import { Body, Controller, Get, Param, ParseUUIDPipe, Post } from '@nestjs/common';
import { ApiBearerAuth, ApiOperation, ApiTags } from '@nestjs/swagger';
import type { AuthPrincipal } from '../auth/auth.types';
import { CurrentPrincipal } from '../auth/decorators/current-user.decorator';
import { Roles } from '../auth/decorators/roles.decorator';
import { UserRole } from '../identity/identity.enums';
import { InviteToPilotDto } from './dto/growth.dto';
import { PilotAnalyticsService } from './pilot-analytics.service';
import { PilotEnrollmentService } from './pilot-enrollment.service';
/* eslint-disable @typescript-eslint/explicit-function-return-type */

@ApiTags('Admin pilot program')
@ApiBearerAuth()
@Roles(UserRole.Admin, UserRole.SuperAdmin)
@Controller({ path: 'admin/pilot', version: '1' })
export class AdminPilotController {
  constructor(
    private readonly enrollment: PilotEnrollmentService,
    private readonly analytics: PilotAnalyticsService,
  ) {}

  @ApiOperation({
    summary:
      'Real pilot-cohort KPIs: users acquired, onboarded, active, farms created, crop seasons, returning users',
  })
  @Get('summary')
  summary() {
    return this.analytics.summary();
  }

  @ApiOperation({ summary: 'List real pilot enrollments' })
  @Get('enrollments')
  list() {
    return this.enrollment.list();
  }

  @ApiOperation({ summary: 'Invite an existing, registered farmer into the pilot cohort' })
  @Post('enrollments')
  invite(@CurrentPrincipal() p: AuthPrincipal, @Body() dto: InviteToPilotDto) {
    return this.enrollment.invite(p.userId, dto.userId, dto.organizationId);
  }

  @ApiOperation({ summary: 'Mark a pilot enrollment as completed' })
  @Post('enrollments/:id/complete')
  complete(
    @CurrentPrincipal() p: AuthPrincipal,
    @Param('id', new ParseUUIDPipe({ version: '4' })) id: string,
  ) {
    return this.enrollment.complete(p.userId, id);
  }

  @ApiOperation({ summary: 'Drop a pilot enrollment' })
  @Post('enrollments/:id/drop')
  drop(
    @CurrentPrincipal() p: AuthPrincipal,
    @Param('id', new ParseUUIDPipe({ version: '4' })) id: string,
  ) {
    return this.enrollment.drop(p.userId, id);
  }
}

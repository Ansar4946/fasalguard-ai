import { Body, Controller, Get, Param, ParseUUIDPipe, Post } from '@nestjs/common';
import { ApiBearerAuth, ApiOperation, ApiTags } from '@nestjs/swagger';
import type { AuthPrincipal } from '../auth/auth.types';
import { CurrentPrincipal } from '../auth/decorators/current-user.decorator';
import { Roles } from '../auth/decorators/roles.decorator';
import { UserRole } from '../identity/identity.enums';
import { ExpertConfirmIncidentDto } from './dto/impact.dto';
import { IncidentLifecycleService } from './incident-lifecycle.service';
import { ImpactAnalyticsService } from './impact-analytics.service';
/* eslint-disable @typescript-eslint/explicit-function-return-type */

@ApiTags('Admin impact')
@ApiBearerAuth()
@Roles(UserRole.Admin, UserRole.SuperAdmin)
@Controller({ version: '1' })
export class AdminImpactController {
  constructor(
    private readonly analytics: ImpactAnalyticsService,
    private readonly lifecycle: IncidentLifecycleService,
  ) {}

  @ApiOperation({
    summary: 'Real, evidence-derived outcome metrics — never claims crop loss prevented',
  })
  @Get('admin/impact')
  summary() {
    return this.analytics.summary();
  }

  @ApiOperation({ summary: 'Expert confirms or disputes whether an incident matched reality' })
  @Post('admin/incidents/:id/expert-confirm')
  expertConfirm(
    @CurrentPrincipal() p: AuthPrincipal,
    @Param('id', new ParseUUIDPipe({ version: '4' })) id: string,
    @Body() dto: ExpertConfirmIncidentDto,
  ) {
    return this.lifecycle.expertConfirmIncident(p.userId, id, dto);
  }
}

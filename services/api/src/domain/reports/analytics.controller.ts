import { Controller, Get } from '@nestjs/common';
import { ApiBearerAuth, ApiTags } from '@nestjs/swagger';
import { Roles } from '../auth/decorators/roles.decorator';
import { UserRole } from '../identity/identity.enums';
import { AnalyticsService } from './analytics.service';
/* eslint-disable @typescript-eslint/explicit-function-return-type */
@ApiTags('Impact analytics')
@ApiBearerAuth()
@Roles(UserRole.NgoViewer, UserRole.GovernmentViewer, UserRole.Admin, UserRole.SuperAdmin)
@Controller({ path: 'analytics', version: '1' })
export class AnalyticsController {
  constructor(private readonly analytics: AnalyticsService) {}
  @Get('impact') impact() {
    return this.analytics.impact();
  }
  @Get('viability') viability() {
    return this.analytics.viability();
  }
}

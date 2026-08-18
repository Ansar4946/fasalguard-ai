import { Body, Controller, Get, Param, ParseUUIDPipe, Post } from '@nestjs/common';
import { ApiBearerAuth, ApiOperation, ApiTags } from '@nestjs/swagger';
import { IsBoolean } from 'class-validator';
import { Roles } from '../auth/decorators/roles.decorator';
import { UserRole } from '../identity/identity.enums';
import { FunnelAnalyticsService } from './funnel-analytics.service';
/* eslint-disable @typescript-eslint/explicit-function-return-type */

class SetTestAccountDto {
  @IsBoolean() isTestAccount!: boolean;
}

@ApiTags('Admin funnel')
@ApiBearerAuth()
@Roles(UserRole.Admin, UserRole.SuperAdmin)
@Controller({ path: 'admin/funnel', version: '1' })
export class AdminFunnelController {
  constructor(private readonly funnel: FunnelAnalyticsService) {}

  @ApiOperation({
    summary:
      'Real acquisition funnel: visitor -> registered -> onboarded -> activated -> active -> upgrade-requested -> paid',
  })
  @Get()
  funnelMetrics() {
    return this.funnel.funnel();
  }

  @ApiOperation({
    summary:
      'Flag or unflag an internal/QA account so it never contaminates real funnel or revenue numbers',
  })
  @Post('users/:userId/test-account')
  setTestAccount(
    @Param('userId', new ParseUUIDPipe({ version: '4' })) userId: string,
    @Body() dto: SetTestAccountDto,
  ) {
    return this.funnel.setTestAccountFlag(userId, dto.isTestAccount);
  }
}

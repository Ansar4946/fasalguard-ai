import { Body, Controller, Get, HttpCode, Param, ParseUUIDPipe, Post, Query } from '@nestjs/common';
import { Throttle } from '@nestjs/throttler';
import { ApiBearerAuth, ApiTags } from '@nestjs/swagger';
import type { AuthPrincipal } from '../auth/auth.types';
import { CurrentPrincipal } from '../auth/decorators/current-user.decorator';
import { Roles } from '../auth/decorators/roles.decorator';
import { UserRole } from '../identity/identity.enums';
import { CreateReportDto, ReportPageDto } from './dto/report.dto';
import { ReportService } from './report.service';
/* eslint-disable @typescript-eslint/explicit-function-return-type */
@ApiTags('Reports')
@ApiBearerAuth()
@Roles(
  UserRole.Farmer,
  UserRole.AgricultureExpert,
  UserRole.NgoViewer,
  UserRole.GovernmentViewer,
  UserRole.Admin,
  UserRole.SuperAdmin,
)
@Controller({ path: 'reports', version: '1' })
export class ReportController {
  constructor(private readonly reports: ReportService) {}
  @Post() @HttpCode(202) @Throttle({ default: { limit: 10, ttl: 3_600_000 } }) create(
    @CurrentPrincipal() p: AuthPrincipal,
    @Body() d: CreateReportDto,
  ) {
    return this.reports.create(p, d);
  }
  @Get() list(@CurrentPrincipal() p: AuthPrincipal, @Query() page: ReportPageDto) {
    return this.reports.list(p, page);
  }
  @Get(':id') get(
    @CurrentPrincipal() p: AuthPrincipal,
    @Param('id', new ParseUUIDPipe({ version: '4' })) id: string,
  ) {
    return this.reports.get(p, id);
  }
}

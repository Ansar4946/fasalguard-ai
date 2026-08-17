import { Body, Controller, Get, Param, ParseUUIDPipe, Post } from '@nestjs/common';
import { ApiBearerAuth, ApiTags } from '@nestjs/swagger';
import { Throttle } from '@nestjs/throttler';
import type { AuthPrincipal } from '../auth/auth.types';
import { CurrentPrincipal } from '../auth/decorators/current-user.decorator';
import { Roles } from '../auth/decorators/roles.decorator';
import { UserRole } from '../identity/identity.enums';
import { CreateCommunityReportDto, VerifyCommunityReportDto } from './dto/outbreak.dto';
import { OutbreakService } from './outbreak.service';
const communityRoles = [
  UserRole.Farmer,
  UserRole.AgricultureExpert,
  UserRole.Admin,
  UserRole.SuperAdmin,
];
const mapRoles = [
  ...communityRoles,
  UserRole.FieldWorker,
  UserRole.NgoViewer,
  UserRole.GovernmentViewer,
];
@ApiTags('Community reporting')
@ApiBearerAuth()
@Roles(...communityRoles)
@Controller({ version: '1', path: 'community/reports' })
export class CommunityReportController {
  constructor(private readonly service: OutbreakService) {}
  @Post() @Throttle({ default: { limit: 5, ttl: 60_000 } }) create(
    @CurrentPrincipal() p: AuthPrincipal,
    @Body() d: CreateCommunityReportDto,
  ): Promise<unknown> {
    return this.service.create(p, d);
  }
  @Post(':id/verify')
  @Roles(UserRole.Farmer)
  @Throttle({ default: { limit: 10, ttl: 3_600_000 } })
  verify(
    @CurrentPrincipal() p: AuthPrincipal,
    @Param('id', new ParseUUIDPipe({ version: '4' })) id: string,
    @Body() d: VerifyCommunityReportDto,
  ): Promise<unknown> {
    return this.service.verify(p, id, d);
  }
}
@ApiTags('Privacy-safe outbreaks')
@ApiBearerAuth()
@Roles(...mapRoles)
@Controller({ version: '1', path: 'outbreaks' })
export class OutbreakController {
  constructor(private readonly service: OutbreakService) {}
  @Get() list(): Promise<unknown[]> {
    return this.service.list();
  }
  @Get('map') map(): Promise<unknown[]> {
    return this.service.map();
  }
  @Get(':id') detail(
    @Param('id', new ParseUUIDPipe({ version: '4' })) id: string,
  ): Promise<unknown> {
    return this.service.detail(id);
  }
}

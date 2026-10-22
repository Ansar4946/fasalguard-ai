import { Controller, Get } from '@nestjs/common';
import { ApiBearerAuth, ApiOperation, ApiTags } from '@nestjs/swagger';
import type { AuthPrincipal } from '../auth/auth.types';
import { CurrentPrincipal } from '../auth/decorators/current-user.decorator';
import { Roles } from '../auth/decorators/roles.decorator';
import { UserRole } from '../identity/identity.enums';
import { DashboardService } from './dashboard.service';
import type { DashboardResponse } from './dashboard.types';

@ApiTags('Farmer dashboard')
@ApiBearerAuth()
@Roles(UserRole.Farmer, UserRole.FieldWorker, UserRole.Admin, UserRole.SuperAdmin)
@Controller({ version: '1', path: 'dashboard' })
export class DashboardController {
  constructor(private readonly dashboard: DashboardService) {}

  @Get()
  @ApiOperation({ summary: 'Ownership-scoped farmer home-screen summary' })
  get(@CurrentPrincipal() p: AuthPrincipal): Promise<DashboardResponse> {
    return this.dashboard.forUser(p.userId);
  }
}

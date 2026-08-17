import { Controller, Get, Param, ParseUUIDPipe } from '@nestjs/common';
import { ApiBearerAuth, ApiTags } from '@nestjs/swagger';
import type { AuthPrincipal } from '../auth/auth.types';
import { CurrentPrincipal } from '../auth/decorators/current-user.decorator';
import { Roles } from '../auth/decorators/roles.decorator';
import { UserRole } from '../identity/identity.enums';
import { RiskAssessmentService } from './risk.service';
@ApiTags('Explainable field risk')
@ApiBearerAuth()
@Roles(UserRole.Farmer)
@Controller({ version: '1', path: 'fields' })
export class RiskController {
  constructor(private readonly service: RiskAssessmentService) {}
  @Get(':id/risk-assessment') get(
    @CurrentPrincipal() p: AuthPrincipal,
    @Param('id', new ParseUUIDPipe({ version: '4' })) id: string,
  ): Promise<unknown> {
    return this.service.get(p.userId, id);
  }
}

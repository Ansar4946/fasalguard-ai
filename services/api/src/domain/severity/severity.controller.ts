import { Controller, Get, Param, ParseUUIDPipe, Post } from '@nestjs/common';
import { ApiBearerAuth, ApiTags } from '@nestjs/swagger';
import type { AuthPrincipal } from '../auth/auth.types';
import { CurrentPrincipal } from '../auth/decorators/current-user.decorator';
import { Roles } from '../auth/decorators/roles.decorator';
import { UserRole } from '../identity/identity.enums';
import { SeverityService } from './severity.service';
@ApiTags('Deterministic multimodal severity')
@ApiBearerAuth()
@Roles(UserRole.Farmer)
@Controller({ version: '1', path: 'crop-scans/:id/severity' })
export class SeverityController {
  constructor(private readonly service: SeverityService) {}
  @Post() calculate(
    @CurrentPrincipal() p: AuthPrincipal,
    @Param('id', new ParseUUIDPipe({ version: '4' })) id: string,
  ): Promise<unknown> {
    return this.service.calculate(p.userId, id);
  }
  @Get() latest(
    @CurrentPrincipal() p: AuthPrincipal,
    @Param('id', new ParseUUIDPipe({ version: '4' })) id: string,
  ): Promise<unknown> {
    return this.service.latest(p.userId, id);
  }
}

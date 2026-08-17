import { Body, Controller, Get, Post, Query } from '@nestjs/common';
import { ApiBearerAuth, ApiTags } from '@nestjs/swagger';
import type { AuthPrincipal } from '../auth/auth.types';
import { CurrentPrincipal } from '../auth/decorators/current-user.decorator';
import { Roles } from '../auth/decorators/roles.decorator';
import { UserRole } from '../identity/identity.enums';
import { SyncMutationsDto } from './dto/sync.dto';
import { SyncService } from './sync.service';
/* Controller response types are inferred from the synchronization service. */
/* eslint-disable @typescript-eslint/explicit-function-return-type */
@ApiTags('Offline synchronization')
@ApiBearerAuth()
@Roles(UserRole.Farmer)
@Controller({ version: '1', path: 'sync' })
export class SyncController {
  constructor(private readonly service: SyncService) {}
  @Post('mutations') mutations(@CurrentPrincipal() p: AuthPrincipal, @Body() d: SyncMutationsDto) {
    return this.service.apply(p, d.mutations);
  }
  @Get('changes') changes(@CurrentPrincipal() p: AuthPrincipal, @Query('cursor') cursor?: string) {
    return this.service.changes(p.userId, cursor);
  }
}

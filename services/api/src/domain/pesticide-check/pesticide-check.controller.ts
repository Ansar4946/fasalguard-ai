import { Body, Controller, Get, Param, ParseUUIDPipe, Post, Query } from '@nestjs/common';
import { ApiBearerAuth, ApiTags } from '@nestjs/swagger';
import { Throttle } from '@nestjs/throttler';
import type { AuthPrincipal } from '../auth/auth.types';
import { CurrentPrincipal } from '../auth/decorators/current-user.decorator';
import { Roles } from '../auth/decorators/roles.decorator';
import { UserRole } from '../identity/identity.enums';
import {
  CreatePesticideCheckDto,
  ListPesticideChecksQuery,
  ManualPesticideCheckDto,
} from './dto/pesticide-check.dto';
import { PesticideCheckService } from './pesticide-check.service';

/* Controller responses are inferred from the application service. */
/* eslint-disable @typescript-eslint/explicit-function-return-type */
@ApiTags('Dawai Check')
@ApiBearerAuth()
@Roles(UserRole.Farmer)
@Controller({ version: '1', path: 'pesticide-checks' })
export class PesticideCheckController {
  constructor(private readonly service: PesticideCheckService) {}

  @Post() @Throttle({ default: { limit: 10, ttl: 60_000 } }) create(
    @CurrentPrincipal() p: AuthPrincipal,
    @Body() d: CreatePesticideCheckDto,
  ) {
    return this.service.createFromPhoto(p.userId, d);
  }

  @Post('manual') @Throttle({ default: { limit: 30, ttl: 60_000 } }) manual(
    @CurrentPrincipal() p: AuthPrincipal,
    @Body() d: ManualPesticideCheckDto,
  ) {
    return this.service.createManual(p.userId, d);
  }

  @Get() list(@CurrentPrincipal() p: AuthPrincipal) {
    return this.service.list(p.userId);
  }

  @Get(':id') get(
    @CurrentPrincipal() p: AuthPrincipal,
    @Param('id', new ParseUUIDPipe({ version: '4' })) id: string,
  ) {
    return this.service.get(p.userId, id);
  }
}

@ApiTags('Dawai Check')
@ApiBearerAuth()
@Roles(UserRole.Farmer)
@Controller({ version: '1', path: 'pesticide-products' })
export class PesticideProductController {
  constructor(private readonly service: PesticideCheckService) {}

  @Get() @Throttle({ default: { limit: 60, ttl: 60_000 } }) search(
    @Query() q: ListPesticideChecksQuery,
  ) {
    return this.service.searchProducts(q.search);
  }
}

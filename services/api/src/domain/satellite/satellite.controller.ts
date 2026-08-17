import {
  Body,
  Controller,
  Get,
  HttpCode,
  HttpStatus,
  Param,
  ParseUUIDPipe,
  Post,
} from '@nestjs/common';
import { ApiBearerAuth, ApiOperation, ApiTags } from '@nestjs/swagger';
import { Throttle } from '@nestjs/throttler';
import { CurrentPrincipal } from '../auth/decorators/current-user.decorator';
import type { AuthPrincipal } from '../auth/auth.types';
import { Roles } from '../auth/decorators/roles.decorator';
import { UserRole } from '../identity/identity.enums';
import { CreateSatelliteScanDto } from './dto/satellite.dto';
import { SatelliteService, type SatelliteScanView } from './satellite.service';
@ApiTags('Satellite')
@ApiBearerAuth()
@Roles(UserRole.Farmer)
@Controller()
export class SatelliteController {
  constructor(private readonly service: SatelliteService) {}
  @Post('fields/:fieldId/satellite-scans')
  @Throttle({ default: { limit: 10, ttl: 3_600_000 } })
  @HttpCode(HttpStatus.ACCEPTED)
  @ApiOperation({ summary: 'Queue a Sentinel-2 Catalog scan' })
  create(
    @CurrentPrincipal() u: AuthPrincipal,
    @Param('fieldId', ParseUUIDPipe) id: string,
    @Body() dto: CreateSatelliteScanDto,
  ): Promise<SatelliteScanView> {
    return this.service.enqueue(u.userId, id, dto);
  }
  @Get('fields/:fieldId/satellite-scans') list(
    @CurrentPrincipal() u: AuthPrincipal,
    @Param('fieldId', ParseUUIDPipe) id: string,
  ): Promise<SatelliteScanView[]> {
    return this.service.list(u.userId, id);
  }
  @Get('satellite-scans/:id') get(
    @CurrentPrincipal() u: AuthPrincipal,
    @Param('id', ParseUUIDPipe) id: string,
  ): Promise<SatelliteScanView> {
    return this.service.get(u.userId, id);
  }
  @Get('satellite-scans/:id/layers')
  layers(
    @CurrentPrincipal() u: AuthPrincipal,
    @Param('id', ParseUUIDPipe) id: string,
  ): Promise<unknown[]> {
    return this.service.layers(u.userId, id);
  }
  @Get('satellite-scans/:id/statistics')
  statistics(
    @CurrentPrincipal() u: AuthPrincipal,
    @Param('id', ParseUUIDPipe) id: string,
  ): Promise<unknown[]> {
    return this.service.statistics(u.userId, id);
  }
  @Get('satellite-scans/:id/stress-zones')
  stressZones(
    @CurrentPrincipal() u: AuthPrincipal,
    @Param('id', ParseUUIDPipe) id: string,
  ): Promise<unknown[]> {
    return this.service.stressZones(u.userId, id);
  }
  @Get('fields/:id/satellite-comparison')
  comparison(
    @CurrentPrincipal() u: AuthPrincipal,
    @Param('id', ParseUUIDPipe) id: string,
  ): Promise<unknown> {
    return this.service.comparison(u.userId, id);
  }
}

import {
  Body,
  Controller,
  Delete,
  Get,
  HttpCode,
  HttpStatus,
  Param,
  ParseUUIDPipe,
  Patch,
  Post,
} from '@nestjs/common';
import { ApiBearerAuth, ApiTags } from '@nestjs/swagger';
import type { Feature, Polygon } from 'geojson';
import type { AuthPrincipal } from '../auth/auth.types';
import { CurrentPrincipal } from '../auth/decorators/current-user.decorator';
import { Roles } from '../auth/decorators/roles.decorator';
import { UserRole } from '../identity/identity.enums';
import {
  CreateFarmDto,
  CreateFieldDto,
  UpdateFarmDto,
  UpdateFieldDto,
} from './dto/farm-management.dto';
import { FarmManagementService } from './farm-management.service';

@ApiTags('Farmer farms and fields')
@ApiBearerAuth()
@Roles(UserRole.Farmer)
@Controller({ version: '1' })
export class FarmManagementController {
  constructor(private readonly farms: FarmManagementService) {}

  @Get('farms')
  list(@CurrentPrincipal() principal: AuthPrincipal): Promise<unknown[]> {
    return this.farms.listFarms(principal.userId);
  }

  @Post('farms')
  create(
    @CurrentPrincipal() principal: AuthPrincipal,
    @Body() dto: CreateFarmDto,
  ): Promise<unknown> {
    return this.farms.createFarm(principal.userId, dto);
  }

  @Get('farms/:id')
  get(
    @CurrentPrincipal() principal: AuthPrincipal,
    @Param('id', new ParseUUIDPipe({ version: '4' })) id: string,
  ): Promise<unknown> {
    return this.farms.getFarm(principal.userId, id);
  }

  @Patch('farms/:id')
  update(
    @CurrentPrincipal() principal: AuthPrincipal,
    @Param('id', new ParseUUIDPipe({ version: '4' })) id: string,
    @Body() dto: UpdateFarmDto,
  ): Promise<unknown> {
    return this.farms.updateFarm(principal.userId, id, dto);
  }

  @HttpCode(HttpStatus.NO_CONTENT)
  @Delete('farms/:id')
  delete(
    @CurrentPrincipal() principal: AuthPrincipal,
    @Param('id', new ParseUUIDPipe({ version: '4' })) id: string,
  ): Promise<void> {
    return this.farms.deleteFarm(principal.userId, id);
  }

  @Get('farms/:id/geojson')
  farmGeoJson(
    @CurrentPrincipal() principal: AuthPrincipal,
    @Param('id', new ParseUUIDPipe({ version: '4' })) id: string,
  ): Promise<Feature<Polygon>> {
    return this.farms.farmGeoJson(principal.userId, id);
  }

  @Post('farms/:farmId/fields')
  createField(
    @CurrentPrincipal() principal: AuthPrincipal,
    @Param('farmId', new ParseUUIDPipe({ version: '4' })) farmId: string,
    @Body() dto: CreateFieldDto,
  ): Promise<unknown> {
    return this.farms.createField(principal.userId, farmId, dto);
  }

  @Get('fields/:id')
  getField(
    @CurrentPrincipal() principal: AuthPrincipal,
    @Param('id', new ParseUUIDPipe({ version: '4' })) id: string,
  ): Promise<unknown> {
    return this.farms.getField(principal.userId, id);
  }

  @Patch('fields/:id')
  updateField(
    @CurrentPrincipal() principal: AuthPrincipal,
    @Param('id', new ParseUUIDPipe({ version: '4' })) id: string,
    @Body() dto: UpdateFieldDto,
  ): Promise<unknown> {
    return this.farms.updateField(principal.userId, id, dto);
  }

  @HttpCode(HttpStatus.NO_CONTENT)
  @Delete('fields/:id')
  deleteField(
    @CurrentPrincipal() principal: AuthPrincipal,
    @Param('id', new ParseUUIDPipe({ version: '4' })) id: string,
  ): Promise<void> {
    return this.farms.deleteField(principal.userId, id);
  }

  @Get('fields/:id/summary')
  summary(
    @CurrentPrincipal() principal: AuthPrincipal,
    @Param('id', new ParseUUIDPipe({ version: '4' })) id: string,
  ): Promise<Record<string, unknown>> {
    return this.farms.fieldSummary(principal.userId, id);
  }

  @Get('fields/:id/geojson')
  fieldGeoJson(
    @CurrentPrincipal() principal: AuthPrincipal,
    @Param('id', new ParseUUIDPipe({ version: '4' })) id: string,
  ): Promise<Feature<Polygon>> {
    return this.farms.fieldGeoJson(principal.userId, id);
  }
}

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
import { ApiBearerAuth, ApiTags } from '@nestjs/swagger';
import { Throttle } from '@nestjs/throttler';
import type { AuthPrincipal } from '../auth/auth.types';
import { CurrentPrincipal } from '../auth/decorators/current-user.decorator';
import { Roles } from '../auth/decorators/roles.decorator';
import { UserRole } from '../identity/identity.enums';
import { CropScanService } from './crop-scan.service';
import { AddScanImageDto, CreateCropScanDto } from './dto/crop-scan.dto';
@ApiTags('Crop image screening')
@ApiBearerAuth()
@Roles(UserRole.Farmer)
@Controller({ version: '1', path: 'crop-scans' })
export class CropScanController {
  constructor(private readonly scans: CropScanService) {}
  @Post() create(
    @CurrentPrincipal() p: AuthPrincipal,
    @Body() dto: CreateCropScanDto,
  ): Promise<unknown> {
    return this.scans.create(p.userId, dto);
  }
  @Post(':id/images') addImage(
    @CurrentPrincipal() p: AuthPrincipal,
    @Param('id', new ParseUUIDPipe({ version: '4' })) id: string,
    @Body() dto: AddScanImageDto,
  ): Promise<unknown> {
    return this.scans.addImage(p.userId, id, dto);
  }
  @Post(':id/analyse')
  @HttpCode(HttpStatus.ACCEPTED)
  @Throttle({ default: { limit: 10, ttl: 3_600_000 } })
  analyse(
    @CurrentPrincipal() p: AuthPrincipal,
    @Param('id', new ParseUUIDPipe({ version: '4' })) id: string,
  ): Promise<unknown> {
    return this.scans.analyse(p.userId, id);
  }
  @Get(':id') get(
    @CurrentPrincipal() p: AuthPrincipal,
    @Param('id', new ParseUUIDPipe({ version: '4' })) id: string,
  ): Promise<unknown> {
    return this.scans.get(p.userId, id);
  }
}

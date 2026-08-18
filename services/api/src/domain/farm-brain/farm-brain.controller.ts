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
import type { AuthPrincipal } from '../auth/auth.types';
import { CurrentPrincipal } from '../auth/decorators/current-user.decorator';
import { Roles } from '../auth/decorators/roles.decorator';
import { UserRole } from '../identity/identity.enums';
import { StartFarmBrainInvestigationDto } from './dto/farm-brain.dto';
import { FarmBrainService } from './farm-brain.service';

@ApiTags('Gemini Investigation Mode')
@ApiBearerAuth()
@Roles(UserRole.Farmer)
@Controller({ version: '1' })
export class FarmBrainController {
  constructor(private readonly farmBrain: FarmBrainService) {}

  @Post('farms/:farmId/farm-brain/investigations')
  @HttpCode(HttpStatus.ACCEPTED)
  @Throttle({ default: { limit: 10, ttl: 3_600_000 } })
  @ApiOperation({ summary: 'Queue a bounded Gemini Investigation Mode run' })
  start(
    @CurrentPrincipal() principal: AuthPrincipal,
    @Param('farmId', new ParseUUIDPipe({ version: '4' })) farmId: string,
    @Body() dto: StartFarmBrainInvestigationDto,
  ): Promise<unknown> {
    return this.farmBrain.start(principal.userId, farmId, dto.fieldId);
  }

  @Get('farm-brain/runs/:id')
  get(
    @CurrentPrincipal() principal: AuthPrincipal,
    @Param('id', new ParseUUIDPipe({ version: '4' })) id: string,
  ): Promise<unknown> {
    return this.farmBrain.get(principal.userId, id);
  }

  @Post('farm-brain/runs/:runId/tool-calls/:toolCallId/confirm')
  @ApiOperation({
    summary: 'Explicitly confirm and execute one policy-approved Farm Brain proposal',
  })
  confirm(
    @CurrentPrincipal() principal: AuthPrincipal,
    @Param('runId', new ParseUUIDPipe({ version: '4' })) runId: string,
    @Param('toolCallId', new ParseUUIDPipe({ version: '4' })) toolCallId: string,
  ): Promise<unknown> {
    return this.farmBrain.confirm(principal.userId, runId, toolCallId);
  }
}

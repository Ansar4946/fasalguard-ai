import { Body, Controller, Get, Param, ParseUUIDPipe, Post } from '@nestjs/common';
import { ApiBearerAuth, ApiOperation, ApiTags } from '@nestjs/swagger';
import type { AuthPrincipal } from '../auth/auth.types';
import { CurrentPrincipal } from '../auth/decorators/current-user.decorator';
import { Roles } from '../auth/decorators/roles.decorator';
import { UserRole } from '../identity/identity.enums';
import { ConfirmIncidentDto, RecordFollowUpDto } from './dto/impact.dto';
import { IncidentLifecycleService } from './incident-lifecycle.service';
import { ImpactAnalyticsService } from './impact-analytics.service';
/* eslint-disable @typescript-eslint/explicit-function-return-type */

@ApiTags('Farm impact')
@ApiBearerAuth()
@Roles(UserRole.Farmer)
@Controller({ path: 'farms/:farmId', version: '1' })
export class IncidentController {
  constructor(
    private readonly lifecycle: IncidentLifecycleService,
    private readonly analytics: ImpactAnalyticsService,
  ) {}

  @ApiOperation({ summary: 'Confirm or dispute whether a detected incident matched reality' })
  @Post('incidents/:id/confirm')
  confirm(
    @CurrentPrincipal() p: AuthPrincipal,
    @Param('farmId', new ParseUUIDPipe({ version: '4' })) farmId: string,
    @Param('id', new ParseUUIDPipe({ version: '4' })) id: string,
    @Body() dto: ConfirmIncidentDto,
  ) {
    return this.lifecycle.confirmIncident(p.userId, farmId, id, dto);
  }

  @ApiOperation({
    summary: 'Record a real, evidence-backed follow-up observation for an incident',
  })
  @Post('incidents/:id/follow-up')
  followUp(
    @CurrentPrincipal() p: AuthPrincipal,
    @Param('farmId', new ParseUUIDPipe({ version: '4' })) farmId: string,
    @Param('id', new ParseUUIDPipe({ version: '4' })) id: string,
    @Body() dto: RecordFollowUpDto,
  ) {
    return this.lifecycle.recordFollowUp(p.userId, farmId, id, dto);
  }

  @ApiOperation({ summary: 'Mark a recommended action as started' })
  @Post('interventions/:id/start')
  startIntervention(
    @CurrentPrincipal() p: AuthPrincipal,
    @Param('farmId', new ParseUUIDPipe({ version: '4' })) farmId: string,
    @Param('id', new ParseUUIDPipe({ version: '4' })) id: string,
  ) {
    return this.lifecycle.startIntervention(p.userId, farmId, id);
  }

  @ApiOperation({ summary: 'Real season impact summary for this farmer — honest zero states' })
  @Get('impact-summary')
  mySummary(
    @CurrentPrincipal() p: AuthPrincipal,
    @Param('farmId', new ParseUUIDPipe({ version: '4' })) farmId: string,
  ) {
    return this.analytics.mySeasonSummary(p.userId, farmId);
  }
}

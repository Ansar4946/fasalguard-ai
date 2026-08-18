import { Controller, Get, Param, ParseUUIDPipe, Query } from '@nestjs/common';
import { ApiBearerAuth, ApiTags } from '@nestjs/swagger';
import type { AuthPrincipal } from '../auth/auth.types';
import { CurrentPrincipal } from '../auth/decorators/current-user.decorator';
import { Roles } from '../auth/decorators/roles.decorator';
import { UserRole } from '../identity/identity.enums';
import { DigitalTwinQueryDto, DigitalTwinTimelineQueryDto } from './dto/digital-twin-query.dto';
import { FarmDigitalTwinService } from './farm-digital-twin.service';
import type { DigitalTwinSnapshot, TimelineEvent } from './digital-twin.types';

@ApiTags('Farm digital twin')
@ApiBearerAuth()
@Roles(UserRole.Farmer)
@Controller({ path: 'farms/:farmId', version: '1' })
export class FarmDigitalTwinController {
  constructor(private readonly twins: FarmDigitalTwinService) {}

  @Get('digital-twin')
  snapshot(
    @CurrentPrincipal() principal: AuthPrincipal,
    @Param('farmId', new ParseUUIDPipe({ version: '4' })) farmId: string,
    @Query() query: DigitalTwinQueryDto,
  ): Promise<DigitalTwinSnapshot> {
    return this.twins.getSnapshot(principal.userId, farmId, query);
  }

  @Get('timeline')
  timeline(
    @CurrentPrincipal() principal: AuthPrincipal,
    @Param('farmId', new ParseUUIDPipe({ version: '4' })) farmId: string,
    @Query() query: DigitalTwinTimelineQueryDto,
  ): Promise<{ window: { from: string; to: string; days: number }; events: TimelineEvent[] }> {
    return this.twins.getTimeline(principal.userId, farmId, query);
  }
}

import { Controller, Get, Param, ParseUUIDPipe } from '@nestjs/common';
import { ApiBearerAuth, ApiTags } from '@nestjs/swagger';
import type { AuthPrincipal } from '../auth/auth.types';
import { CurrentPrincipal } from '../auth/decorators/current-user.decorator';
import { Roles } from '../auth/decorators/roles.decorator';
import { UserRole } from '../identity/identity.enums';
import { WeatherService } from './weather.service';
@ApiTags('Crop-aware weather intelligence')
@ApiBearerAuth()
@Roles(UserRole.Farmer)
@Controller({ version: '1', path: 'fields/:id/weather' })
export class WeatherController {
  constructor(private readonly weather: WeatherService) {}
  @Get('current') current(
    @CurrentPrincipal() p: AuthPrincipal,
    @Param('id', new ParseUUIDPipe({ version: '4' })) id: string,
  ): Promise<unknown> {
    return this.weather.current(p.userId, id);
  }
  @Get('forecast') forecast(
    @CurrentPrincipal() p: AuthPrincipal,
    @Param('id', new ParseUUIDPipe({ version: '4' })) id: string,
  ): Promise<unknown> {
    return this.weather.forecast(p.userId, id);
  }
  @Get('risks') risks(
    @CurrentPrincipal() p: AuthPrincipal,
    @Param('id', new ParseUUIDPipe({ version: '4' })) id: string,
  ): Promise<unknown> {
    return this.weather.risks(p.userId, id);
  }
  @Get('suitability') suitability(
    @CurrentPrincipal() p: AuthPrincipal,
    @Param('id', new ParseUUIDPipe({ version: '4' })) id: string,
  ): Promise<unknown> {
    return this.weather.suitability(p.userId, id);
  }
}

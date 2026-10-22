import { Body, Controller, Get, Headers, HttpCode, Post, Res } from '@nestjs/common';
import { ApiBearerAuth, ApiTags } from '@nestjs/swagger';
import { Throttle } from '@nestjs/throttler';
import type { Response } from 'express';
import type { AuthPrincipal } from '../auth/auth.types';
import { CurrentPrincipal } from '../auth/decorators/current-user.decorator';
import { Public } from '../auth/decorators/public.decorator';
import { Roles } from '../auth/decorators/roles.decorator';
import { UserRole } from '../identity/identity.enums';
import { SetupUssdPinDto, UssdCallbackDto, UssdDemoCallbackDto } from './dto/farm-finance.dto';
import { FarmLedgerService } from './farm-ledger.service';
import { UssdPinService } from './ussd-pin.service';
import { UssdService } from './ussd.service';

@ApiTags('Farm finance')
@ApiBearerAuth()
@Controller({ version: '1' })
export class FarmFinanceController {
  constructor(
    private readonly pin: UssdPinService,
    private readonly ussd: UssdService,
    private readonly ledger: FarmLedgerService,
  ) {}

  @Post('ussd/pin/setup')
  @Roles(UserRole.Farmer)
  @Throttle({ default: { limit: 5, ttl: 3_600_000 } })
  setupPin(
    @CurrentPrincipal() p: AuthPrincipal,
    @Body() dto: SetupUssdPinDto,
  ): Promise<{ configured: true }> {
    return this.pin.setup(p.userId, dto.currentPassword, dto.pin);
  }

  @Get('farm-ledger')
  @Roles(UserRole.Farmer)
  list(@CurrentPrincipal() p: AuthPrincipal): Promise<unknown[]> {
    return this.ledger.list(p.userId);
  }

  @Post('ussd/demo/callback')
  @Roles(UserRole.Farmer)
  @Throttle({ default: { limit: 60, ttl: 60_000 } })
  demoCallback(
    @CurrentPrincipal() p: AuthPrincipal,
    @Body() dto: UssdDemoCallbackDto,
  ): Promise<{ text: string }> {
    return this.ussd.demoCallback(p.userId, dto);
  }

  @Public()
  @Post('channels/ussd/callback')
  @HttpCode(200)
  @Throttle({ default: { limit: 30, ttl: 60_000 } })
  async callback(
    @Body() dto: UssdCallbackDto,
    @Headers('x-ussd-timestamp') timestamp: string | undefined,
    @Headers('x-ussd-signature') signature: string | undefined,
    @Res() response: Response,
  ): Promise<void> {
    const text = await this.ussd.callback(dto, timestamp, signature);
    response.type('text/plain').send(text);
  }
}

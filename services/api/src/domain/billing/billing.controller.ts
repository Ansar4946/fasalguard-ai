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
import { Public } from '../auth/decorators/public.decorator';
import { BillingService } from './billing.service';
import { RequestUpgradeDto } from './dto/billing.dto';
import { EntitlementService } from './entitlement.service';
/* eslint-disable @typescript-eslint/explicit-function-return-type */

@ApiTags('Billing')
@ApiBearerAuth()
@Controller({ path: 'billing', version: '1' })
export class BillingController {
  constructor(
    private readonly billing: BillingService,
    private readonly entitlements: EntitlementService,
  ) {}

  @Public()
  @ApiOperation({ summary: 'List active subscription plans' })
  @Get('plans')
  plans() {
    return this.billing.listPlans();
  }

  @ApiOperation({ summary: "Get the caller's current subscription and recent billing history" })
  @Get('subscription')
  subscription(@CurrentPrincipal() p: AuthPrincipal) {
    return this.billing.getMySubscription(p.userId);
  }

  @ApiOperation({ summary: "Get the caller's live usage against their plan's limits" })
  @Get('usage')
  usage(@CurrentPrincipal() p: AuthPrincipal) {
    return this.entitlements.getUsageSnapshot(p.userId);
  }

  @Throttle({ default: { limit: 10, ttl: 3_600_000 } })
  @HttpCode(HttpStatus.ACCEPTED)
  @ApiOperation({ summary: 'Request a plan upgrade with a manual payment reference' })
  @Post('upgrade-request')
  upgradeRequest(@CurrentPrincipal() p: AuthPrincipal, @Body() dto: RequestUpgradeDto) {
    return this.billing.requestUpgrade(p.userId, dto);
  }

  @ApiOperation({ summary: 'Cancel a still-pending upgrade request' })
  @Post('upgrade-request/:paymentId/cancel')
  cancelUpgradeRequest(
    @CurrentPrincipal() p: AuthPrincipal,
    @Param('paymentId', new ParseUUIDPipe({ version: '4' })) paymentId: string,
  ) {
    return this.billing.cancelMyUpgradeRequest(p.userId, paymentId);
  }
}

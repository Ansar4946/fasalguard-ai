import { Body, Controller, Get, Param, ParseUUIDPipe, Post, Query } from '@nestjs/common';
import { ApiBearerAuth, ApiOperation, ApiTags } from '@nestjs/swagger';
import type { AuthPrincipal } from '../auth/auth.types';
import { CurrentPrincipal } from '../auth/decorators/current-user.decorator';
import { Roles } from '../auth/decorators/roles.decorator';
import { UserRole } from '../identity/identity.enums';
import { AdminBillingService } from './admin-billing.service';
import {
  AssignOrganizationPlanDto,
  RefundPaymentDto,
  RejectPaymentDto,
  SetStripePriceDto,
  VerifyPaymentDto,
} from './dto/billing.dto';
import { StripeService } from './stripe.service';
/* eslint-disable @typescript-eslint/explicit-function-return-type */

@ApiTags('Admin billing')
@ApiBearerAuth()
@Roles(UserRole.Admin, UserRole.SuperAdmin)
@Controller({ path: 'admin/billing', version: '1' })
export class AdminBillingController {
  constructor(
    private readonly admin: AdminBillingService,
    private readonly stripe: StripeService,
  ) {}

  @ApiOperation({
    summary: 'Real revenue, plan distribution, and payment outcomes — never fabricated',
  })
  @Get('revenue')
  revenue() {
    return this.admin.revenue();
  }

  @ApiOperation({ summary: 'Real plan catalog with real per-plan subscriber counts' })
  @Get('plans')
  plans() {
    return this.admin.listPlans();
  }

  @ApiOperation({ summary: 'List subscription payments, optionally filtered by status' })
  @Get('payments')
  payments(@Query('status') status?: string) {
    return this.admin.listPayments(status);
  }

  @ApiOperation({ summary: 'Verify a pending payment against a real bank/mobile-money statement' })
  @Post('payments/:id/verify')
  verify(
    @CurrentPrincipal() p: AuthPrincipal,
    @Param('id', new ParseUUIDPipe({ version: '4' })) id: string,
    @Body() dto: VerifyPaymentDto,
  ) {
    return this.admin.verifyPayment(p.userId, id, dto.notes);
  }

  @ApiOperation({ summary: 'Reject a pending payment' })
  @Post('payments/:id/reject')
  reject(
    @CurrentPrincipal() p: AuthPrincipal,
    @Param('id', new ParseUUIDPipe({ version: '4' })) id: string,
    @Body() dto: RejectPaymentDto,
  ) {
    return this.admin.rejectPayment(p.userId, id, dto.reason);
  }

  @ApiOperation({ summary: 'Refund a paid payment and revert the subscription to FREE' })
  @Post('payments/:id/refund')
  refund(
    @CurrentPrincipal() p: AuthPrincipal,
    @Param('id', new ParseUUIDPipe({ version: '4' })) id: string,
    @Body() dto: RefundPaymentDto,
  ) {
    return this.admin.refundPayment(p.userId, id, dto.reason);
  }

  @ApiOperation({ summary: 'Assign a plan to a pilot/enterprise organization' })
  @Post('subscriptions/organization')
  assignOrganizationPlan(
    @CurrentPrincipal() p: AuthPrincipal,
    @Body() dto: AssignOrganizationPlanDto,
  ) {
    return this.admin.assignOrganizationPlan(p.userId, dto.organizationId, dto.planCode);
  }

  @ApiOperation({ summary: 'Whether Stripe keys are configured — never echoes the secrets' })
  @Get('stripe-status')
  stripeStatus() {
    return this.stripe.status();
  }

  @ApiOperation({ summary: 'Attach a real Stripe Price id to a plan, once one exists' })
  @Post('plans/:code/stripe-price')
  setStripePrice(@Param('code') code: string, @Body() dto: SetStripePriceDto) {
    return this.stripe.setPriceId(code, dto.stripePriceId);
  }
}

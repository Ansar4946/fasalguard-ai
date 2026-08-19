import { Module } from '@nestjs/common';
import { AdminBillingController } from './admin-billing.controller';
import { AdminBillingService } from './admin-billing.service';
import { BillingController } from './billing.controller';
import { BillingService } from './billing.service';
import { EntitlementService } from './entitlement.service';
import { StripeService } from './stripe.service';

@Module({
  controllers: [BillingController, AdminBillingController],
  providers: [BillingService, AdminBillingService, EntitlementService, StripeService],
  exports: [EntitlementService],
})
export class BillingModule {}

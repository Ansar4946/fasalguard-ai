import { Module } from '@nestjs/common';
import { AdminBillingController } from './admin-billing.controller';
import { AdminBillingService } from './admin-billing.service';
import { BillingController } from './billing.controller';
import { BillingService } from './billing.service';
import { EntitlementService } from './entitlement.service';

@Module({
  controllers: [BillingController, AdminBillingController],
  providers: [BillingService, AdminBillingService, EntitlementService],
  exports: [EntitlementService],
})
export class BillingModule {}

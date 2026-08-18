import { Module } from '@nestjs/common';
import { BillingModule } from '../billing/billing.module';
import { GeospatialModule } from '../geospatial/geospatial.module';
import { FarmManagementController } from './farm-management.controller';
import { FarmManagementService } from './farm-management.service';

@Module({
  imports: [GeospatialModule, BillingModule],
  controllers: [FarmManagementController],
  providers: [FarmManagementService],
})
export class FarmManagementModule {}

import { Module } from '@nestjs/common';
import { GeospatialModule } from '../geospatial/geospatial.module';
import { FarmManagementController } from './farm-management.controller';
import { FarmManagementService } from './farm-management.service';

@Module({
  imports: [GeospatialModule],
  controllers: [FarmManagementController],
  providers: [FarmManagementService],
})
export class FarmManagementModule {}

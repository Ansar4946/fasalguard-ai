import { Module } from '@nestjs/common';
import { FarmDigitalTwinController } from './farm-digital-twin.controller';
import { FarmDigitalTwinService } from './farm-digital-twin.service';

@Module({
  controllers: [FarmDigitalTwinController],
  providers: [FarmDigitalTwinService],
  exports: [FarmDigitalTwinService],
})
export class FarmDigitalTwinModule {}

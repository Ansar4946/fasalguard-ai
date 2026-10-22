import { Module } from '@nestjs/common';
import { YieldController } from './yield.controller';
import { YieldImportService } from './yield-import.service';
import { YieldService } from './yield.service';

@Module({
  controllers: [YieldController],
  providers: [YieldService, YieldImportService],
  exports: [YieldService, YieldImportService],
})
export class YieldModule {}

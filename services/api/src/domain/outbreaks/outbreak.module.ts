import { Module } from '@nestjs/common';
import { CommunityReportController, OutbreakController } from './outbreak.controller';
import { OutbreakService } from './outbreak.service';
import { RiskModule } from '../risk/risk.module';
@Module({
  imports: [RiskModule],
  controllers: [CommunityReportController, OutbreakController],
  providers: [OutbreakService],
  exports: [OutbreakService],
})
export class OutbreakModule {}

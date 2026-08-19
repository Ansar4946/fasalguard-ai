import { BullModule } from '@nestjs/bullmq';
import { Module } from '@nestjs/common';
import { FarmBrainModule } from '../farm-brain/farm-brain.module';
import { RiskController } from './risk.controller';
import { RiskEngine } from './risk.engine';
import { RiskProcessor } from './risk.processor';
import { FIELD_RISK_QUEUE, RiskAssessmentService } from './risk.service';
import { workersEnabled } from '../../infrastructure/execution-role';
@Module({
  imports: [BullModule.registerQueue({ name: FIELD_RISK_QUEUE }), FarmBrainModule],
  controllers: [RiskController],
  providers: [RiskEngine, RiskAssessmentService, ...(workersEnabled() ? [RiskProcessor] : [])],
  exports: [RiskAssessmentService],
})
export class RiskModule {}

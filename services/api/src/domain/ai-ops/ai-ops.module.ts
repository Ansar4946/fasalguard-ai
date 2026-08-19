import { Module } from '@nestjs/common';
import { AdminAiOperationsController } from './admin-ai-operations.controller';
import { AiOperationsAnalyticsService } from './ai-operations-analytics.service';
import { AIRunLogger } from './ai-run-logger.service';

@Module({
  controllers: [AdminAiOperationsController],
  providers: [AIRunLogger, AiOperationsAnalyticsService],
  exports: [AIRunLogger],
})
export class AiOpsModule {}

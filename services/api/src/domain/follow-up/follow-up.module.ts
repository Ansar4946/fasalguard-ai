import { Module } from '@nestjs/common';
import { AiOpsModule } from '../ai-ops/ai-ops.module';
import { AlibabaQwenProvider } from './providers/alibaba-qwen.provider';
import { LLM_PROVIDER } from './providers/llm.provider';
import { FollowUpController } from './follow-up.controller';
import { FollowUpService } from './follow-up.service';
@Module({
  imports: [AiOpsModule],
  controllers: [FollowUpController],
  providers: [
    FollowUpService,
    AlibabaQwenProvider,
    { provide: LLM_PROVIDER, useExisting: AlibabaQwenProvider },
  ],
  exports: [FollowUpService],
})
export class FollowUpModule {}

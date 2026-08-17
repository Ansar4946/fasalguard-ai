import { Module } from '@nestjs/common';
import { AlibabaQwenProvider } from './providers/alibaba-qwen.provider';
import { LLM_PROVIDER } from './providers/llm.provider';
import { FollowUpController } from './follow-up.controller';
import { FollowUpService } from './follow-up.service';
@Module({
  controllers: [FollowUpController],
  providers: [
    FollowUpService,
    AlibabaQwenProvider,
    { provide: LLM_PROVIDER, useExisting: AlibabaQwenProvider },
  ],
  exports: [FollowUpService],
})
export class FollowUpModule {}

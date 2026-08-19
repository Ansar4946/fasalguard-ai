import { BullModule } from '@nestjs/bullmq';
import { Module } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { AiOpsModule } from '../ai-ops/ai-ops.module';
import { BillingModule } from '../billing/billing.module';
import { FarmDigitalTwinModule } from '../digital-twin/farm-digital-twin.module';
import { GrowthModule } from '../growth/growth.module';
import { NotificationModule } from '../notifications/notification.module';
import { workersEnabled } from '../../infrastructure/execution-role';
import { FarmBrainController } from './farm-brain.controller';
import { FarmBrainProcessor } from './farm-brain.processor';
import { FARM_BRAIN_QUEUE, FarmBrainService } from './farm-brain.service';
import { FakeFarmReasoningProvider } from './providers/fake-farm-reasoning.provider';
import {
  FARM_REASONING_PROVIDER,
  type FarmReasoningProvider,
} from './providers/farm-reasoning.provider';
import { GeminiFarmReasoningProvider } from './providers/gemini-farm-reasoning.provider';

@Module({
  imports: [
    FarmDigitalTwinModule,
    NotificationModule,
    BillingModule,
    GrowthModule,
    AiOpsModule,
    BullModule.registerQueue({ name: FARM_BRAIN_QUEUE }),
  ],
  controllers: [FarmBrainController],
  providers: [
    FarmBrainService,
    ...(workersEnabled() ? [FarmBrainProcessor] : []),
    FakeFarmReasoningProvider,
    GeminiFarmReasoningProvider,
    {
      provide: FARM_REASONING_PROVIDER,
      inject: [ConfigService, FakeFarmReasoningProvider, GeminiFarmReasoningProvider],
      useFactory: (
        config: ConfigService,
        fake: FakeFarmReasoningProvider,
        gemini: GeminiFarmReasoningProvider,
      ): FarmReasoningProvider =>
        config.get<string>('farmBrainProvider', 'fake') === 'gemini' ? gemini : fake,
    },
  ],
  exports: [FarmBrainService],
})
export class FarmBrainModule {}

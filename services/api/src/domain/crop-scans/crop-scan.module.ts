import { BullModule } from '@nestjs/bullmq';
import { Module } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { GrowthModule } from '../growth/growth.module';
import { MediaModule } from '../media/media.module';
import { CropScanController } from './crop-scan.controller';
import { CropScanProcessor } from './crop-scan.processor';
import { CROP_SCAN_QUEUE, CropScanService } from './crop-scan.service';
import { RoboflowVisionProvider } from './providers/roboflow-vision.provider';
import { SelfHostedVisionProvider } from './providers/self-hosted-vision.provider';
import {
  VISION_DIAGNOSIS_PROVIDER,
  type VisionDiagnosisProvider,
} from './providers/vision-diagnosis.provider';
import { RiskModule } from '../risk/risk.module';
import { workersEnabled } from '../../infrastructure/execution-role';
@Module({
  imports: [
    MediaModule,
    RiskModule,
    GrowthModule,
    BullModule.registerQueue({ name: CROP_SCAN_QUEUE }),
  ],
  controllers: [CropScanController],
  providers: [
    CropScanService,
    ...(workersEnabled() ? [CropScanProcessor] : []),
    RoboflowVisionProvider,
    SelfHostedVisionProvider,
    {
      provide: VISION_DIAGNOSIS_PROVIDER,
      inject: [ConfigService, RoboflowVisionProvider, SelfHostedVisionProvider],
      useFactory: (
        config: ConfigService,
        roboflow: RoboflowVisionProvider,
        selfHosted: SelfHostedVisionProvider,
      ): VisionDiagnosisProvider =>
        config.get<string>('visionProvider') === 'roboflow' ? roboflow : selfHosted,
    },
  ],
  exports: [CropScanService],
})
export class CropScanModule {}

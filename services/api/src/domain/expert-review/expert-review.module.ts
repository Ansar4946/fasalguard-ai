import { Module } from '@nestjs/common';
import { ConsultationService } from './consultation.service';
import { ConsultationController, ExpertReviewController } from './expert-review.controller';
import { ExpertReviewService } from './expert-review.service';
@Module({
  controllers: [ExpertReviewController, ConsultationController],
  providers: [ExpertReviewService, ConsultationService],
})
export class ExpertReviewModule {}

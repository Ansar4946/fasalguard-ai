import { Processor, WorkerHost } from '@nestjs/bullmq';
import type { Job } from 'bullmq';
import { FIELD_RISK_QUEUE, type FieldRiskJob, RiskAssessmentService } from './risk.service';
@Processor(FIELD_RISK_QUEUE, { concurrency: 4 })
export class RiskProcessor extends WorkerHost {
  constructor(private readonly service: RiskAssessmentService) {
    super();
  }
  process(job: Job<FieldRiskJob>): Promise<unknown> {
    return this.service.assessField(job.data.fieldId, job.data.trigger);
  }
}

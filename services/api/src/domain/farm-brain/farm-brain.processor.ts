import { Processor, WorkerHost } from '@nestjs/bullmq';
import type { Job } from 'bullmq';
import { FARM_BRAIN_QUEUE, FarmBrainService, type FarmBrainJob } from './farm-brain.service';

@Processor(FARM_BRAIN_QUEUE, { concurrency: 2, lockDuration: 90_000 })
export class FarmBrainProcessor extends WorkerHost {
  constructor(private readonly farmBrain: FarmBrainService) {
    super();
  }
  process(job: Job<FarmBrainJob>): Promise<void> {
    if (job.name !== 'farm-brain:investigate')
      throw new Error(`Unknown Farm Brain job ${job.name}`);
    const maximumAttempts = job.opts.attempts ?? 1;
    return this.farmBrain.process(job.data.runId, job.attemptsMade + 1 >= maximumAttempts);
  }
}

import { Processor, WorkerHost } from '@nestjs/bullmq';
import type { Job } from 'bullmq';
import { REPORT_QUEUE, ReportService, type ReportJob } from './report.service';
import { ReportStatus } from './report.enums';
import { renderPdf } from './pdf.renderer';
import { MetricsService } from '../../observability/metrics.service';
@Processor(REPORT_QUEUE, { concurrency: 2, lockDuration: 60000 })
export class ReportProcessor extends WorkerHost {
  constructor(
    private readonly reports: ReportService,
    private readonly metrics: MetricsService = new MetricsService(),
  ) {
    super();
  }
  async process(job: Job<ReportJob>): Promise<void> {
    const started = Date.now();
    this.metrics.observe(
      'fasalguard_queue_latency_seconds',
      Math.max(0, started - job.timestamp) / 1000,
      { queue: REPORT_QUEUE },
    );
    const row = await this.reports.loadForWorker(job.data.reportId, job.data.ownerId);
    if (row.status === ReportStatus.Completed) return;
    try {
      await this.reports.markGenerating(row.id);
      const lines = await this.reports.lines(row);
      await this.reports.complete(row, renderPdf(`FasalGuard AI - ${row.type}`, lines));
    } catch (e) {
      this.metrics.increment('fasalguard_queue_failed_jobs_total', { queue: REPORT_QUEUE });
      await this.reports.fail(row.id);
      throw e;
    } finally {
      this.metrics.observe('fasalguard_queue_job_duration_seconds', (Date.now() - started) / 1000, {
        queue: REPORT_QUEUE,
      });
    }
  }
}

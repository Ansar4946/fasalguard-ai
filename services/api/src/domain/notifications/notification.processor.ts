import { Processor, WorkerHost } from '@nestjs/bullmq';
import { Inject, Logger } from '@nestjs/common';
import { InjectDataSource } from '@nestjs/typeorm';
import type { Job } from 'bullmq';
import { DataSource } from 'typeorm';
import { DeliveryStatus } from './notification.enums';
import { MetricsService } from '../../observability/metrics.service';
import { NOTIFICATION_QUEUE, type NotificationJob } from './notification.service';
import {
  PUSH_NOTIFICATION_PROVIDER,
  type PushNotificationProvider,
} from './providers/push-notification.provider';
/* TypeORM raw query results are constrained by the explicit SQL projection below. */
/* eslint-disable @typescript-eslint/no-unsafe-assignment, @typescript-eslint/no-unsafe-member-access, @typescript-eslint/no-explicit-any */
@Processor(NOTIFICATION_QUEUE, { concurrency: 8, limiter: { max: 100, duration: 1000 } })
export class NotificationProcessor extends WorkerHost {
  private readonly logger = new Logger(NotificationProcessor.name);
  constructor(
    @InjectDataSource() private readonly db: DataSource,
    @Inject(PUSH_NOTIFICATION_PROVIDER) private readonly provider: PushNotificationProvider,
    private readonly metrics: MetricsService = new MetricsService(),
  ) {
    super();
  }
  async process(job: Job<NotificationJob>): Promise<void> {
    const started = Date.now();
    this.metrics.observe(
      'fasalguard_queue_latency_seconds',
      Math.max(0, started - job.timestamp) / 1000,
      { queue: NOTIFICATION_QUEUE },
    );
    const row = (
      await this.db.query<any[]>(
        `SELECT nd.id,nd.status,n.title,n.body,n.data,dt.token_value token,dt.id "tokenId",dt.active FROM notification_deliveries nd JOIN notifications n ON n.id=nd.notification_id JOIN device_tokens dt ON dt.id=nd.device_token_id WHERE nd.id=$1`,
        [job.data.deliveryId],
      )
    )[0];
    if (!row || row.status !== DeliveryStatus.Scheduled || !row.active) return;
    try {
      const result = await this.provider.send({
        token: row.token,
        title: row.title,
        body: row.body,
        data: row.data,
      });
      this.metrics.increment('fasalguard_fcm_deliveries_total', { status: result.status });
      await this.db.transaction(async (tx) => {
        await tx.query(
          `UPDATE notification_deliveries SET status=$2,provider_message_id=$3,attempt_count=attempt_count+1,sent_at=CASE WHEN $2 IN('SENT','DELIVERED') THEN now() ELSE sent_at END,delivered_at=CASE WHEN $2='DELIVERED' THEN now() ELSE delivered_at END,last_error_code=NULL WHERE id=$1`,
          [row.id, result.status, result.messageId],
        );
        if (result.status === 'INVALID_TOKEN')
          await tx.query(`UPDATE device_tokens SET active=false,invalidated_at=now() WHERE id=$1`, [
            row.tokenId,
          ]);
      });
    } catch (e) {
      this.metrics.increment('fasalguard_fcm_failures_total');
      this.metrics.increment('fasalguard_queue_failed_jobs_total', { queue: NOTIFICATION_QUEUE });
      const final = job.attemptsMade + 1 >= (job.opts.attempts ?? 1);
      await this.db.query(
        `UPDATE notification_deliveries SET attempt_count=attempt_count+1,status=CASE WHEN $2 THEN 'FAILED' ELSE status END,last_error_code=$3 WHERE id=$1`,
        [row.id, final, e instanceof Error ? e.name : 'DELIVERY_ERROR'],
      );
      this.logger.warn(
        { deliveryId: row.id, attempt: job.attemptsMade + 1 },
        'Push delivery attempt failed',
      );
      throw e;
    } finally {
      this.metrics.observe('fasalguard_queue_job_duration_seconds', (Date.now() - started) / 1000, {
        queue: NOTIFICATION_QUEUE,
      });
    }
  }
}

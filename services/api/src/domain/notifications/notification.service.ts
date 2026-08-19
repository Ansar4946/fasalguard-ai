import { InjectQueue } from '@nestjs/bullmq';
import { ForbiddenException, Injectable, NotFoundException } from '@nestjs/common';
import { InjectDataSource } from '@nestjs/typeorm';
import { Cron } from '@nestjs/schedule';
import { ConfigService } from '@nestjs/config';
import { createHash } from 'node:crypto';
import type { Queue } from 'bullmq';
import { DataSource } from 'typeorm';
import { CreateTaskDto, RegisterPushTokenDto, UpdateTaskDto } from './dto/notification.dto';
import { DeliveryStatus, NotificationCategory, TaskSource, TaskStatus } from './notification.enums';
import { NotificationSafetyPolicy } from './notification.policy';
/* TypeORM raw query results are constrained by each explicit SQL projection below. */
/* eslint-disable @typescript-eslint/no-unsafe-assignment, @typescript-eslint/no-unsafe-return, @typescript-eslint/no-unsafe-member-access, @typescript-eslint/no-unsafe-call, @typescript-eslint/no-explicit-any, @typescript-eslint/explicit-function-return-type */
export const NOTIFICATION_QUEUE = 'notification-delivery';
export interface NotificationJob {
  deliveryId: string;
}
@Injectable()
export class NotificationService {
  constructor(
    @InjectDataSource() private readonly db: DataSource,
    @InjectQueue(NOTIFICATION_QUEUE) private readonly queue: Queue<NotificationJob>,
    private readonly safety: NotificationSafetyPolicy,
    private readonly config: ConfigService,
  ) {}
  @Cron('0 20 3 * * *')
  async deactivateStaleTokens(): Promise<void> {
    const days = this.config.get<number>('pushTokenStaleDays', 90);
    await this.db.query(
      `UPDATE device_tokens SET active=false,invalidated_at=now() WHERE active=true AND deleted_at IS NULL AND last_seen_at<now()-make_interval(days=>$1)`,
      [days],
    );
  }
  async registerToken(userId: string, d: RegisterPushTokenDto) {
    const hash = createHash('sha256').update(d.token).digest('hex');
    const rows = await this.db.query(
      `INSERT INTO device_tokens(user_id,device_id,token_value,token_hash,platform,last_seen_at,active,invalidated_at) VALUES($1,$2,$3,$4,$5,now(),true,NULL) ON CONFLICT(token_hash) DO UPDATE SET user_id=excluded.user_id,device_id=excluded.device_id,token_value=excluded.token_value,platform=excluded.platform,last_seen_at=now(),active=true,invalidated_at=NULL,deleted_at=NULL RETURNING id,platform,active,last_seen_at "lastSeenAt"`,
      [userId, d.deviceId ?? null, d.token, hash, d.platform],
    );
    return rows[0];
  }
  async deleteToken(userId: string, id: string) {
    // DataSource.query() for an UPDATE...RETURNING (outside an existing transaction/manager)
    // returns a [rows, affectedCount] tuple rather than a flat rows array — unwrap it explicitly.
    const [r] = await this.db.query<[Array<{ id: string }>, number]>(
      `UPDATE device_tokens SET active=false,invalidated_at=now(),deleted_at=now() WHERE id=$1 AND user_id=$2 AND deleted_at IS NULL RETURNING id`,
      [id, userId],
    );
    if (!r.length) throw new NotFoundException('Push token was not found.');
    return { id, revoked: true };
  }
  async notifications(userId: string) {
    return this.db.query(
      `SELECT id,category,title,body,data,read_at "readAt",created_at "createdAt" FROM notifications WHERE user_id=$1 ORDER BY created_at DESC LIMIT 100`,
      [userId],
    );
  }
  async read(userId: string, id: string) {
    // DataSource.query() for an UPDATE...RETURNING (outside an existing transaction/manager)
    // returns a [rows, affectedCount] tuple rather than a flat rows array — unwrap it explicitly.
    const [r] = await this.db.query<[Array<{ id: string; readAt: Date }>, number]>(
      `UPDATE notifications SET read_at=COALESCE(read_at,now()) WHERE id=$1 AND user_id=$2 RETURNING id,read_at "readAt"`,
      [id, userId],
    );
    if (!r.length) throw new NotFoundException('Notification was not found.');
    return r[0];
  }
  async tasks(userId: string) {
    return this.db.query(
      `SELECT id,field_id "fieldId",title,description,source,status,due_at "dueAt",completed_at "completedAt",created_at "createdAt" FROM farmer_tasks WHERE user_id=$1 AND deleted_at IS NULL ORDER BY status,due_at NULLS LAST,created_at DESC`,
      [userId],
    );
  }
  async createTask(userId: string, d: CreateTaskDto) {
    if (d.fieldId) await this.assertField(userId, d.fieldId);
    const r = await this.db.query(
      `INSERT INTO farmer_tasks(user_id,field_id,title,description,source,status,due_at)VALUES($1,$2,$3,$4,$5,$6,$7)RETURNING *`,
      [
        userId,
        d.fieldId ?? null,
        d.title,
        d.description ?? null,
        TaskSource.Manual,
        TaskStatus.Pending,
        d.dueAt ?? null,
      ],
    );
    return r[0];
  }
  async createGeneratedTask(input: {
    userId: string;
    source: Exclude<TaskSource, TaskSource.Manual>;
    title: string;
    description?: string;
    fieldId?: string;
    dueAt?: Date;
    sourceReference: string;
  }): Promise<unknown> {
    if (input.fieldId) await this.assertField(input.userId, input.fieldId);
    const rows = await this.db.query(
      `INSERT INTO farmer_tasks(user_id,field_id,title,description,source,status,due_at,source_reference) VALUES($1,$2,$3,$4,$5,'PENDING',$6,$7) ON CONFLICT(user_id,source,source_reference) WHERE source_reference IS NOT NULL AND deleted_at IS NULL DO NOTHING RETURNING *`,
      [
        input.userId,
        input.fieldId ?? null,
        input.title,
        input.description ?? null,
        input.source,
        input.dueAt ?? null,
        input.sourceReference,
      ],
    );
    return rows[0] ?? null;
  }
  async updateTask(userId: string, id: string, d: UpdateTaskDto) {
    const current = (
      await this.db.query<any[]>(
        `SELECT * FROM farmer_tasks WHERE id=$1 AND user_id=$2 AND deleted_at IS NULL`,
        [id, userId],
      )
    )[0];
    if (!current) throw new NotFoundException('Task was not found.');
    const status = d.status ?? current.status;
    // DataSource.query() for an UPDATE...RETURNING (outside an existing transaction/manager)
    // returns a [rows, affectedCount] tuple rather than a flat rows array — unwrap it explicitly.
    const [r] = await this.db.query<[Array<Record<string, unknown>>, number]>(
      `UPDATE farmer_tasks SET title=$3,description=$4,due_at=$5,status=$6,completed_at=CASE WHEN $7 THEN COALESCE(completed_at,now()) ELSE NULL END WHERE id=$1 AND user_id=$2 RETURNING *`,
      [
        id,
        userId,
        d.title ?? current.title,
        d.description ?? current.description,
        d.dueAt ?? current.due_at,
        status,
        status === 'COMPLETED',
      ],
    );
    if (status === 'COMPLETED') {
      try {
        await this.db.query(
          `UPDATE farm_interventions SET status='COMPLETED',completed_at=now(),updated_at=now(),version=version+1 WHERE task_id=$1 AND status<>'COMPLETED'`,
          [id],
        );
      } catch {
        /* best-effort: the impact ledger must never block task updates */
      }
    }
    return r[0];
  }
  async completeTask(userId: string, id: string) {
    return this.updateTask(userId, id, { status: TaskStatus.Completed });
  }
  async createNotification(input: {
    userId: string;
    category: NotificationCategory;
    title: string;
    body: string;
    data?: Record<string, string>;
    deduplicationKey?: string;
    confirmedEvidence?: boolean;
    aiConfidence?: number | null;
    incidentId?: string;
  }) {
    this.safety.assertSafe({
      title: input.title,
      body: input.body,
      confirmedEvidence: input.confirmedEvidence ?? false,
      aiConfidence: input.aiConfidence ?? null,
    });
    const persisted = await this.db.transaction(async (tx) => {
      const rows = await tx.query(
        `INSERT INTO notifications(user_id,category,title,body,data,deduplication_key,confirmed_evidence,ai_confidence,incident_id)VALUES($1,$2,$3,$4,$5,$6,$7,$8,$9) ON CONFLICT(user_id,deduplication_key) WHERE deduplication_key IS NOT NULL DO NOTHING RETURNING id`,
        [
          input.userId,
          input.category,
          input.title,
          input.body,
          JSON.stringify(input.data ?? {}),
          input.deduplicationKey ?? null,
          input.confirmedEvidence ?? false,
          input.aiConfidence ?? null,
          input.incidentId ?? null,
        ],
      );
      if (!rows.length) return null;
      const enabled = await tx.query(
        `SELECT granted FROM consents c WHERE c.user_id=$1 AND c.type='NOTIFICATIONS' ORDER BY c.recorded_at DESC,c.created_at DESC LIMIT 1`,
        [input.userId],
      );
      if (!enabled.length || enabled[0].granted !== true)
        return { id: rows[0].id, deliveryIds: [] as string[] };
      const deliveries = await tx.query(
        `INSERT INTO notification_deliveries(notification_id,device_token_id,status,scheduled_at) SELECT $1,dt.id,$2,now() FROM device_tokens dt LEFT JOIN notification_preferences np ON np.user_id=dt.user_id AND np.category=$3 WHERE dt.user_id=$4 AND dt.active=true AND dt.deleted_at IS NULL AND COALESCE(np.push_enabled,true)=true ON CONFLICT DO NOTHING RETURNING id`,
        [rows[0].id, DeliveryStatus.Scheduled, input.category, input.userId],
      );
      return { id: rows[0].id, deliveryIds: deliveries.map((d: { id: string }) => d.id) };
    });
    if (!persisted) return null;
    for (const deliveryId of persisted.deliveryIds)
      await this.queue.add(
        'notification:deliver',
        { deliveryId },
        {
          jobId: `notify-${deliveryId}`,
          attempts: 4,
          backoff: { type: 'exponential', delay: 2000 },
          removeOnComplete: 1000,
          removeOnFail: 5000,
        },
      );
    return { id: persisted.id, scheduled: persisted.deliveryIds.length };
  }
  private async assertField(userId: string, fieldId: string) {
    const r = await this.db.query(
      `SELECT 1 FROM fields f JOIN farms fa ON fa.id=f.farm_id JOIN farmer_profiles fp ON fp.id=fa.farmer_id WHERE f.id=$1 AND fp.user_id=$2 AND f.deleted_at IS NULL`,
      [fieldId, userId],
    );
    if (!r.length) throw new ForbiddenException('You do not have access to this field.');
  }
}

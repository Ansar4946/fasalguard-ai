import { InjectQueue } from '@nestjs/bullmq';
import {
  BadRequestException,
  ForbiddenException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { InjectDataSource } from '@nestjs/typeorm';
import { Cron } from '@nestjs/schedule';
import { ConfigService } from '@nestjs/config';
import { createHash } from 'node:crypto';
import type { Queue } from 'bullmq';
import { DataSource } from 'typeorm';
import {
  CreateTaskDto,
  RegisterPushTokenDto,
  UpdatePreferenceDto,
  UpdateTaskDto,
} from './dto/notification.dto';
import { isValidTimeZone, quietHoursDelayMs } from './quiet-hours';
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
  /**
   * By design a push token (one physical app install) belongs to whoever registered it last: when a
   * device changes hands or a different account signs in on it, the same token hash is rebound to the
   * new user and the previous owner's registration stops receiving pushes. FCM tokens are high-entropy
   * secrets that the API never returns, so this cannot be exploited without already knowing the token.
   */
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
  async notifications(userId: string, options: { unreadOnly?: boolean; limit?: number } = {}) {
    const limit = Math.min(Math.max(options.limit ?? 100, 1), 100);
    return this.db.query(
      `SELECT n.id,n.category,n.title,n.body,n.data,n.read_at "readAt",n.created_at "createdAt",
              COALESCE((SELECT jsonb_object_agg(s.status,s.c) FROM (SELECT d.status,count(*)::int c FROM notification_deliveries d WHERE d.notification_id=n.id GROUP BY d.status) s),'{}'::jsonb) delivery
         FROM notifications n WHERE n.user_id=$1 AND ($2::boolean IS NOT TRUE OR n.read_at IS NULL)
        ORDER BY n.created_at DESC LIMIT $3`,
      [userId, options.unreadOnly ?? false, limit],
    );
  }
  async unreadCount(userId: string): Promise<{ count: number }> {
    const rows = await this.db.query<Array<{ count: number }>>(
      `SELECT count(*)::int count FROM notifications WHERE user_id=$1 AND read_at IS NULL`,
      [userId],
    );
    return { count: rows[0]?.count ?? 0 };
  }
  /**
   * Read-only digest of the caller's UNREAD notifications for the assistant: counts per category
   * and the newest titles. Never changes read state. Notifications have no severity column, so
   * "warnings" are unread notifications and the category is the only classification available.
   */
  async unreadDigest(
    userId: string,
    options: { category?: NotificationCategory; titles?: number } = {},
  ): Promise<{
    unreadTotal: number;
    byCategory: Array<{ category: string; count: number }>;
    top: Array<{ category: string; title: string; createdAt: Date }>;
  }> {
    const category = options.category ?? null;
    const [byCategory, top] = await Promise.all([
      this.db.query<Array<{ category: string; count: number }>>(
        `SELECT category,count(*)::int count FROM notifications WHERE user_id=$1 AND read_at IS NULL AND ($2::text IS NULL OR category=$2) GROUP BY category ORDER BY count(*) DESC,category`,
        [userId, category],
      ),
      this.db.query<Array<{ category: string; title: string; createdAt: Date }>>(
        `SELECT category,title,created_at "createdAt" FROM notifications WHERE user_id=$1 AND read_at IS NULL AND ($2::text IS NULL OR category=$2) ORDER BY created_at DESC LIMIT $3`,
        [userId, category, Math.min(Math.max(options.titles ?? 3, 1), 10)],
      ),
    ]);
    return { unreadTotal: byCategory.reduce((n, r) => n + r.count, 0), byCategory, top };
  }
  async readAll(userId: string): Promise<{ updated: number }> {
    const [, updated] = await this.db.query<[unknown[], number]>(
      `UPDATE notifications SET read_at=now() WHERE user_id=$1 AND read_at IS NULL`,
      [userId],
    );
    return { updated };
  }
  /** Every category with its saved preference or the default (push on, no quiet hours). */
  async preferences(userId: string) {
    const [saved, consent] = await Promise.all([
      this.db.query<
        Array<{
          category: NotificationCategory;
          pushEnabled: boolean;
          quietHoursStart: string | null;
          quietHoursEnd: string | null;
          timezone: string;
        }>
      >(
        `SELECT category,push_enabled "pushEnabled",to_char(quiet_hours_start,'HH24:MI') "quietHoursStart",to_char(quiet_hours_end,'HH24:MI') "quietHoursEnd",timezone FROM notification_preferences WHERE user_id=$1`,
        [userId],
      ),
      this.db.query<Array<{ granted: boolean }>>(
        `SELECT granted FROM consents WHERE user_id=$1 AND type='NOTIFICATIONS' ORDER BY recorded_at DESC,created_at DESC LIMIT 1`,
        [userId],
      ),
    ]);
    return {
      consentGranted: consent[0]?.granted === true,
      categories: Object.values(NotificationCategory).map(
        (category) =>
          saved.find((row) => row.category === category) ?? {
            category,
            pushEnabled: true,
            quietHoursStart: null,
            quietHoursEnd: null,
            timezone: 'Asia/Karachi',
          },
      ),
    };
  }
  async setPreference(userId: string, category: NotificationCategory, d: UpdatePreferenceDto) {
    if (!!d.quietHoursStart !== !!d.quietHoursEnd)
      throw new BadRequestException('Quiet hours need both a start and an end time.');
    if (d.quietHoursStart && d.quietHoursStart === d.quietHoursEnd)
      throw new BadRequestException('Quiet hours start and end must differ.');
    const timezone = d.timezone ?? 'Asia/Karachi';
    if (!isValidTimeZone(timezone)) throw new BadRequestException('Unknown time zone.');
    await this.db.query(
      `INSERT INTO notification_preferences(user_id,category,push_enabled,quiet_hours_start,quiet_hours_end,timezone) VALUES($1,$2,$3,$4,$5,$6) ON CONFLICT(user_id,category) DO UPDATE SET push_enabled=excluded.push_enabled,quiet_hours_start=excluded.quiet_hours_start,quiet_hours_end=excluded.quiet_hours_end,timezone=excluded.timezone,updated_at=now(),version=notification_preferences.version+1`,
      [
        userId,
        category,
        d.pushEnabled,
        d.quietHoursStart ?? null,
        d.quietHoursEnd ?? null,
        timezone,
      ],
    );
    return (await this.preferences(userId)).categories.find((c) => c.category === category);
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
    /** Urgent notifications ignore quiet hours. No producer sets this yet; use sparingly. */
    urgent?: boolean;
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
      const pref = (
        await tx.query<Array<{ start: string | null; end: string | null; timezone: string }>>(
          `SELECT to_char(quiet_hours_start,'HH24:MI') start,to_char(quiet_hours_end,'HH24:MI') "end",timezone FROM notification_preferences WHERE user_id=$1 AND category=$2`,
          [input.userId, input.category],
        )
      )[0];
      // Quiet hours delay delivery to the end of the window; the notification itself is stored at once.
      const delayMs = input.urgent
        ? 0
        : quietHoursDelayMs(
            new Date(),
            pref?.start ?? null,
            pref?.end ?? null,
            pref?.timezone ?? 'Asia/Karachi',
          );
      const deliveries = await tx.query(
        `INSERT INTO notification_deliveries(notification_id,device_token_id,status,scheduled_at) SELECT $1,dt.id,$2,now()+make_interval(secs=>$5::double precision) FROM device_tokens dt LEFT JOIN notification_preferences np ON np.user_id=dt.user_id AND np.category=$3 WHERE dt.user_id=$4 AND dt.active=true AND dt.deleted_at IS NULL AND COALESCE(np.push_enabled,true)=true ON CONFLICT DO NOTHING RETURNING id`,
        [rows[0].id, DeliveryStatus.Scheduled, input.category, input.userId, delayMs / 1000],
      );
      return { id: rows[0].id, delayMs, deliveryIds: deliveries.map((d: { id: string }) => d.id) };
    });
    if (!persisted) return null;
    for (const deliveryId of persisted.deliveryIds)
      await this.queue.add(
        'notification:deliver',
        { deliveryId },
        {
          delay: persisted.delayMs,
          jobId: `notify-${deliveryId}`,
          attempts: 4,
          backoff: { type: 'exponential', delay: 2000 },
          removeOnComplete: 1000,
          removeOnFail: 5000,
        },
      );
    return {
      id: persisted.id,
      scheduled: persisted.deliveryIds.length,
      delayedMs: persisted.delayMs,
    };
  }
  private async assertField(userId: string, fieldId: string) {
    const r = await this.db.query(
      `SELECT 1 FROM fields f JOIN farms fa ON fa.id=f.farm_id JOIN farmer_profiles fp ON fp.id=fa.farmer_id WHERE f.id=$1 AND fp.user_id=$2 AND f.deleted_at IS NULL`,
      [fieldId, userId],
    );
    if (!r.length) throw new ForbiddenException('You do not have access to this field.');
  }
}

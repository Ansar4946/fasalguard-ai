import { Inject, Injectable } from '@nestjs/common';
import { InjectDataSource } from '@nestjs/typeorm';
import { randomUUID } from 'node:crypto';
import { DataSource } from 'typeorm';
import { EMAIL_PROVIDER, type EmailProvider } from '../auth/email/email-provider';
import { LifecycleEmailType } from './growth.enums';

/**
 * Centralizes the consent-check + at-most-once dedup guard for every lifecycle email,
 * mirroring the pattern `WeatherAlertService` already uses (consent check, then a dedup
 * guard, then the send) so these can never become spam. Failures are always swallowed —
 * an email problem must never break the real product action that triggered it.
 */
@Injectable()
export class LifecycleEmailService {
  constructor(
    @InjectDataSource() private readonly db: DataSource,
    @Inject(EMAIL_PROVIDER) private readonly email: EmailProvider,
  ) {}

  async notifyOnboardingIncomplete(
    userId: string,
    recipient: string,
    fullName: string,
  ): Promise<void> {
    if (!(await this.hasNotificationConsent(userId))) return;
    if (await this.sentOnce(userId, LifecycleEmailType.OnboardingIncomplete)) return;
    try {
      await this.email.sendOnboardingReminder({ recipient, fullName });
      await this.log(userId, LifecycleEmailType.OnboardingIncomplete);
    } catch {
      /* best-effort */
    }
  }

  async notifyRoadmapReady(userId: string, recipient: string, farmName: string): Promise<void> {
    if (!(await this.hasNotificationConsent(userId))) return;
    if (await this.sentOnce(userId, LifecycleEmailType.RoadmapReady)) return;
    try {
      await this.email.sendRoadmapReady({ recipient, farmName });
      await this.log(userId, LifecycleEmailType.RoadmapReady);
    } catch {
      /* best-effort */
    }
  }

  async notifyInsightReady(
    userId: string,
    recipient: string,
    context: string,
    diagnosis: string,
  ): Promise<void> {
    if (!(await this.hasNotificationConsent(userId))) return;
    if (await this.sentOnce(userId, LifecycleEmailType.InsightReady)) return;
    try {
      await this.email.sendInsightReady({ recipient, context, diagnosis });
      await this.log(userId, LifecycleEmailType.InsightReady);
    } catch {
      /* best-effort */
    }
  }

  async notifyWeeklySummary(
    userId: string,
    recipient: string,
    summary: { pendingTasks: number; completedTasks: number },
  ): Promise<void> {
    if (!(await this.hasNotificationConsent(userId))) return;
    if (await this.sentThisWeek(userId, LifecycleEmailType.WeeklySummary)) return;
    try {
      await this.email.sendWeeklySummary({ recipient, ...summary });
      await this.log(userId, LifecycleEmailType.WeeklySummary);
    } catch {
      /* best-effort */
    }
  }

  private async hasNotificationConsent(userId: string): Promise<boolean> {
    const rows: Array<{ granted: boolean }> = await this.db.query(
      `SELECT granted FROM consents WHERE user_id=$1 AND type='NOTIFICATIONS' ORDER BY recorded_at DESC,created_at DESC LIMIT 1`,
      [userId],
    );
    return rows[0]?.granted === true;
  }

  private async sentOnce(userId: string, type: LifecycleEmailType): Promise<boolean> {
    const rows: unknown[] = await this.db.query(
      `SELECT 1 FROM lifecycle_email_log WHERE user_id=$1 AND email_type=$2 LIMIT 1`,
      [userId, type],
    );
    return rows.length > 0;
  }

  private async sentThisWeek(userId: string, type: LifecycleEmailType): Promise<boolean> {
    const rows: unknown[] = await this.db.query(
      `SELECT 1 FROM lifecycle_email_log WHERE user_id=$1 AND email_type=$2 AND sent_at>=date_trunc('week',now()) LIMIT 1`,
      [userId, type],
    );
    return rows.length > 0;
  }

  private async log(userId: string, type: LifecycleEmailType): Promise<void> {
    await this.db.query(`INSERT INTO lifecycle_email_log(id,user_id,email_type) VALUES($1,$2,$3)`, [
      randomUUID(),
      userId,
      type,
    ]);
  }
}

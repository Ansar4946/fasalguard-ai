import { Injectable } from '@nestjs/common';
import { InjectDataSource } from '@nestjs/typeorm';
import { Cron } from '@nestjs/schedule';
import { DataSource } from 'typeorm';
import { LifecycleEmailService } from './lifecycle-email.service';

interface ActiveFarmer {
  userId: string;
  email: string;
}

@Injectable()
export class WeeklySummaryService {
  constructor(
    @InjectDataSource() private readonly db: DataSource,
    private readonly lifecycle: LifecycleEmailService,
  ) {}

  @Cron('0 8 * * 1')
  async sendSummaries(): Promise<number> {
    const rows: ActiveFarmer[] = await this.db.query(
      `SELECT DISTINCT u.id "userId",u.email FROM users u
       JOIN farmer_profiles fp ON fp.user_id=u.id
       JOIN farms f ON f.farmer_id=fp.id AND f.deleted_at IS NULL
       JOIN fields fi ON fi.farm_id=f.id AND fi.deleted_at IS NULL
       JOIN crop_cycles cc ON cc.field_id=fi.id AND cc.status='active' AND cc.deleted_at IS NULL
       WHERE u.role='FARMER' AND u.is_test_account=false AND u.deleted_at IS NULL AND u.email IS NOT NULL`,
    );
    let sent = 0;
    for (const row of rows) {
      const counts: Array<{ status: string; count: string }> = await this.db.query(
        `SELECT status,count(*)::text count FROM farmer_tasks WHERE user_id=$1 AND deleted_at IS NULL GROUP BY status`,
        [row.userId],
      );
      const pendingTasks = Number(counts.find((c) => c.status === 'PENDING')?.count ?? 0);
      const completedTasks = Number(counts.find((c) => c.status === 'COMPLETED')?.count ?? 0);
      // Skip farmers with nothing real to report — a summary should never be empty spam.
      if (pendingTasks === 0 && completedTasks === 0) continue;
      await this.lifecycle.notifyWeeklySummary(row.userId, row.email, {
        pendingTasks,
        completedTasks,
      });
      sent += 1;
    }
    return sent;
  }
}

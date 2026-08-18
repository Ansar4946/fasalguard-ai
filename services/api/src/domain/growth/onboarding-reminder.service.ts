import { Injectable } from '@nestjs/common';
import { InjectDataSource } from '@nestjs/typeorm';
import { Cron } from '@nestjs/schedule';
import { DataSource } from 'typeorm';
import { LifecycleEmailService } from './lifecycle-email.service';

interface StalledRegistrant {
  userId: string;
  email: string;
  fullName: string;
}

@Injectable()
export class OnboardingReminderService {
  constructor(
    @InjectDataSource() private readonly db: DataSource,
    private readonly lifecycle: LifecycleEmailService,
  ) {}

  @Cron('0 9 * * *')
  async sendReminders(): Promise<number> {
    const rows: StalledRegistrant[] = await this.db.query(
      `SELECT u.id "userId",u.email,fp.full_name "fullName" FROM users u
       JOIN farmer_profiles fp ON fp.user_id=u.id
       WHERE u.role='FARMER' AND u.is_test_account=false AND u.deleted_at IS NULL AND u.email IS NOT NULL
         AND u.created_at BETWEEN now()-interval '72 hours' AND now()-interval '24 hours'
         AND NOT EXISTS(SELECT 1 FROM farms f WHERE f.farmer_id=fp.id AND f.deleted_at IS NULL)`,
    );
    for (const row of rows)
      await this.lifecycle.notifyOnboardingIncomplete(row.userId, row.email, row.fullName);
    return rows.length;
  }
}

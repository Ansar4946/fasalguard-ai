import { Injectable } from '@nestjs/common';
import { InjectDataSource } from '@nestjs/typeorm';
import { Cron } from '@nestjs/schedule';
import { DataSource } from 'typeorm';
import { PilotEnrollmentStatus } from './growth.enums';

/**
 * Only ever advances a pilot enrollment forward, from real already-derived signals —
 * never regresses and never auto-drops (that stays an explicit admin decision). Reuses the
 * exact same "onboarded"/"active" definitions FunnelAnalyticsService already computes, just
 * re-scoped to pilot_users, so there is only ever one meaning of "onboarded"/"active" in
 * this codebase.
 */
@Injectable()
export class PilotLifecycleSyncService {
  constructor(@InjectDataSource() private readonly db: DataSource) {}

  @Cron('0 6 * * *')
  async sync(): Promise<{ onboarded: number; activated: number }> {
    // DataSource.query() for an UPDATE...RETURNING (outside an existing transaction/manager)
    // returns a [rows, affectedCount] tuple rather than a flat rows array — unwrap it explicitly.
    const [onboarded] = await this.db.query<[Array<{ id: string }>, number]>(
      `UPDATE pilot_users SET status=$1,onboarded_at=now(),updated_at=now(),version=version+1
       WHERE status=$2 AND user_id IN(
         SELECT fp.user_id FROM farmer_profiles fp
         JOIN farms f ON f.farmer_id=fp.id AND f.deleted_at IS NULL
         JOIN fields fi ON fi.farm_id=f.id AND fi.deleted_at IS NULL
         JOIN crop_cycles cc ON cc.field_id=fi.id AND cc.status='active' AND cc.deleted_at IS NULL
       ) RETURNING id`,
      [PilotEnrollmentStatus.Onboarded, PilotEnrollmentStatus.Registered],
    );
    const [activated] = await this.db.query<[Array<{ id: string }>, number]>(
      `UPDATE pilot_users SET status=$1,activated_at=now(),updated_at=now(),version=version+1
       WHERE status=$2 AND user_id IN(
         SELECT id FROM users WHERE last_login_at>=now()-interval '7 days'
       ) RETURNING id`,
      [PilotEnrollmentStatus.Active, PilotEnrollmentStatus.Onboarded],
    );
    return { onboarded: onboarded.length, activated: activated.length };
  }
}

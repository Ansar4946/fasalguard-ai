import { Injectable } from '@nestjs/common';
import { InjectDataSource } from '@nestjs/typeorm';
import { DataSource } from 'typeorm';
/* eslint-disable @typescript-eslint/explicit-function-return-type */

/**
 * Every metric here is scoped to the real pilot cohort (`pilot_users`) and derived from
 * real, persisted rows — matching the never-fabricate discipline used by
 * `FunnelAnalyticsService`/`ImpactAnalyticsService`. "Active" and "returning" reuse the
 * exact same definitions `FunnelAnalyticsService` already established, just re-scoped to
 * the pilot cohort, so there is only ever one meaning of each term in this codebase.
 * Individual accounts flagged `is_test_account` are excluded.
 */
@Injectable()
export class PilotAnalyticsService {
  constructor(@InjectDataSource() private readonly db: DataSource) {}

  async summary() {
    const rows = await this.db.query<Array<Record<string, string | null>>>(`
      WITH pilot_cohort AS (
        SELECT pu.*, u.created_at "userCreatedAt", u.last_login_at "lastLoginAt"
        FROM pilot_users pu
        JOIN users u ON u.id=pu.user_id
        WHERE u.is_test_account=false
      )
      SELECT
        (SELECT count(*) FROM pilot_cohort WHERE registered_at IS NOT NULL)::text "usersAcquired",
        (SELECT count(*) FROM pilot_cohort WHERE onboarded_at IS NOT NULL)::text "usersOnboarded",
        (SELECT count(*) FROM pilot_cohort WHERE "lastLoginAt">=now()-interval '7 days')::text "activeUsers",
        (SELECT count(*) FROM pilot_cohort)::text "cohortSize",

        (SELECT count(*) FROM farms f JOIN farmer_profiles fp ON fp.id=f.farmer_id
          WHERE fp.user_id IN(SELECT user_id FROM pilot_cohort) AND f.deleted_at IS NULL)::text "farmsCreated",

        (SELECT count(*) FROM crop_cycles cc JOIN fields fi ON fi.id=cc.field_id JOIN farms f ON f.id=fi.farm_id
          JOIN farmer_profiles fp ON fp.id=f.farmer_id
          WHERE fp.user_id IN(SELECT user_id FROM pilot_cohort) AND cc.deleted_at IS NULL)::text "cropSeasons",

        (SELECT count(*) FROM pilot_cohort WHERE "userCreatedAt"<now()-interval '7 days')::text "eligibleForReturn",
        (SELECT count(*) FROM pilot_cohort WHERE "userCreatedAt"<now()-interval '7 days' AND "lastLoginAt">="userCreatedAt"+interval '7 days')::text "returnedAfter7Days"
    `);
    const r = rows[0] ?? {};
    const num = (key: string): number => Number(r[key] ?? 0);
    const eligibleForReturn = num('eligibleForReturn');
    const returnedAfter7Days = num('returnedAfter7Days');

    return {
      generatedAt: new Date().toISOString(),
      scope: 'real-persisted-pilot-cohort',
      policy: { excludesTestAccounts: true },
      cohortSize: num('cohortSize'),
      usersAcquired: num('usersAcquired'),
      usersOnboarded: num('usersOnboarded'),
      activeUsers: num('activeUsers'),
      farmsCreated: num('farmsCreated'),
      cropSeasons: num('cropSeasons'),
      returningUsers: {
        eligibleUsers: eligibleForReturn,
        returnedUsers: returnedAfter7Days,
        rate: eligibleForReturn > 0 ? returnedAfter7Days / eligibleForReturn : null,
      },
    };
  }
}

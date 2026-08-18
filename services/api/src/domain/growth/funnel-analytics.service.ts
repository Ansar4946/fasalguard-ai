import { Injectable } from '@nestjs/common';
import { InjectDataSource } from '@nestjs/typeorm';
import { DataSource } from 'typeorm';
/* eslint-disable @typescript-eslint/explicit-function-return-type */

/**
 * Every stage below is derived from real, persisted rows — matching the same
 * never-fabricate discipline as `AnalyticsService`/`AdminBillingService`. Almost nothing
 * is a dedicated "event" write: registered/onboarded/activated/active/upgrade-requested/
 * paid are all computed live from tables that already exist (users, farms, crop_cycles,
 * farm_brain_runs, subscription_payments). Only landing views and pilot leads have their
 * own small tables, since no other real signal produces them.
 */
@Injectable()
export class FunnelAnalyticsService {
  constructor(@InjectDataSource() private readonly db: DataSource) {}

  async funnel() {
    const rows = await this.db.query<Array<Record<string, string | null>>>(`SELECT
      (SELECT COALESCE(sum(count),0) FROM landing_page_views)::text "landingViews",
      (SELECT count(*) FROM pilot_leads)::text "pilotLeads",
      (SELECT count(*) FROM users WHERE role='FARMER' AND is_test_account=false AND deleted_at IS NULL)::text "registered",
      (SELECT count(DISTINCT fp.user_id) FROM farmer_profiles fp
        JOIN users u ON u.id=fp.user_id AND u.role='FARMER' AND u.is_test_account=false AND u.deleted_at IS NULL
        JOIN farms f ON f.farmer_id=fp.id AND f.deleted_at IS NULL
        JOIN fields fi ON fi.farm_id=f.id AND fi.deleted_at IS NULL
        JOIN crop_cycles cc ON cc.field_id=fi.id AND cc.status='active' AND cc.deleted_at IS NULL)::text "onboarded",
      (SELECT count(DISTINCT fp.user_id) FROM farmer_profiles fp
        JOIN users u ON u.id=fp.user_id AND u.role='FARMER' AND u.is_test_account=false AND u.deleted_at IS NULL
        JOIN farms f ON f.farmer_id=fp.id AND f.deleted_at IS NULL
        JOIN fields fi ON fi.farm_id=f.id AND fi.deleted_at IS NULL
        JOIN crop_cycles cc ON cc.field_id=fi.id AND cc.status='active' AND cc.deleted_at IS NULL
        JOIN farm_brain_runs br ON br.user_id=u.id AND br.status='COMPLETED')::text "activated",
      (SELECT count(*) FROM users WHERE role='FARMER' AND is_test_account=false AND deleted_at IS NULL AND last_login_at>=now()-interval '7 days')::text "active",
      (SELECT count(*) FROM users WHERE role='FARMER' AND is_test_account=false AND deleted_at IS NULL AND created_at<now()-interval '7 days')::text "eligibleForReturn",
      (SELECT count(*) FROM users WHERE role='FARMER' AND is_test_account=false AND deleted_at IS NULL AND created_at<now()-interval '7 days' AND last_login_at>=created_at+interval '7 days')::text "returnedAfter7Days",
      (SELECT count(DISTINCT s.user_id) FROM subscriptions s JOIN subscription_payments p ON p.subscription_id=s.id
        JOIN users u ON u.id=s.user_id AND u.role='FARMER' AND u.is_test_account=false WHERE s.user_id IS NOT NULL)::text "upgradeRequested",
      (SELECT count(DISTINCT s.user_id) FROM subscriptions s JOIN subscription_payments p ON p.subscription_id=s.id AND p.status='PAID' AND p.verified_at IS NOT NULL
        JOIN users u ON u.id=s.user_id AND u.role='FARMER' AND u.is_test_account=false WHERE s.user_id IS NOT NULL)::text "paid",
      (SELECT count(*) FROM farmer_profiles fp JOIN users u ON u.id=fp.user_id AND u.is_test_account=false WHERE fp.referred_by_user_id IS NOT NULL)::text "referralSignups"`);
    const r = rows[0] ?? {};
    const eligibleForReturn = Number(r.eligibleForReturn ?? 0);
    const returnedAfter7Days = Number(r.returnedAfter7Days ?? 0);
    return {
      generatedAt: new Date().toISOString(),
      scope: 'real-persisted-funnel-events',
      policy: {
        excludesTestAccounts: true,
        activatedDefinition:
          'account + farm + active crop cycle + first COMPLETED Farm Brain investigation (no separate crop-roadmap feature exists in this product; Farm Brain is the closest real analog)',
        landingViewsCaveat:
          'A daily page-view counter, not a unique-visitor count; not bot-filtered.',
      },
      funnel: {
        landingViews: Number(r.landingViews ?? 0),
        pilotLeads: Number(r.pilotLeads ?? 0),
        registered: Number(r.registered ?? 0),
        onboarded: Number(r.onboarded ?? 0),
        activated: Number(r.activated ?? 0),
        active7Day: Number(r.active ?? 0),
        upgradeRequested: Number(r.upgradeRequested ?? 0),
        paid: Number(r.paid ?? 0),
      },
      sevenDayReturn: {
        eligibleUsers: eligibleForReturn,
        returnedUsers: returnedAfter7Days,
        rate: eligibleForReturn > 0 ? returnedAfter7Days / eligibleForReturn : null,
      },
      referralSignups: Number(r.referralSignups ?? 0),
    };
  }

  async setTestAccountFlag(
    userId: string,
    isTestAccount: boolean,
  ): Promise<{ userId: string; isTestAccount: boolean }> {
    await this.db.query(
      `UPDATE users SET is_test_account=$2,updated_at=now(),version=version+1 WHERE id=$1`,
      [userId, isTestAccount],
    );
    return { userId, isTestAccount };
  }
}

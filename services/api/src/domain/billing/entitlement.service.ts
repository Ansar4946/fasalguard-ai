import { ForbiddenException, Injectable } from '@nestjs/common';
import { InjectDataSource } from '@nestjs/typeorm';
import { DataSource, type EntityManager } from 'typeorm';
import type { PlanLimits } from './billing.entities';
import { EntitlementMetric, PlanCode } from './billing.enums';

type QueryRunner = DataSource | EntityManager;

interface ActivePlan {
  subscriptionId: string | null;
  planCode: string;
  limits: PlanLimits;
}

const FREE_FALLBACK_LIMITS: PlanLimits = {
  maxFarms: 1,
  maxActiveCropSeasons: 2,
  geminiAnalysesPerMonth: 3,
  satelliteMonitoring: false,
  advancedReports: false,
  maxTeamMembers: 1,
};

/**
 * Resolves entitlements from the caller's real subscription (own, or their pilot
 * organization's) and always re-derives usage counts live from the authoritative
 * tables — never from a cached counter — so enforcement can never drift from reality.
 */
@Injectable()
export class EntitlementService {
  constructor(@InjectDataSource() private readonly db: DataSource) {}

  async getActivePlan(userId: string, runner: QueryRunner = this.db): Promise<ActivePlan> {
    const own: ActivePlan[] = await runner.query(
      `SELECT s.id "subscriptionId",s.plan_code "planCode",sp.limits FROM subscriptions s
       JOIN subscription_plans sp ON sp.code=s.plan_code
       WHERE s.user_id=$1 AND s.status IN('TRIAL','ACTIVE') ORDER BY s.created_at DESC LIMIT 1`,
      [userId],
    );
    if (own[0]) return own[0];
    const org: ActivePlan[] = await runner.query(
      `SELECT s.id "subscriptionId",s.plan_code "planCode",sp.limits FROM pilot_users pu
       JOIN subscriptions s ON s.organization_id=pu.organization_id
       JOIN subscription_plans sp ON sp.code=s.plan_code
       WHERE pu.user_id=$1 AND s.status IN('TRIAL','ACTIVE') ORDER BY s.created_at DESC LIMIT 1`,
      [userId],
    );
    if (org[0]) return org[0];
    return { subscriptionId: null, planCode: PlanCode.Free, limits: FREE_FALLBACK_LIMITS };
  }

  /** Throws if `currentCount` is already at/over the plan's limit for a count-based metric. */
  async assertWithinLimit(
    userId: string,
    metric: EntitlementMetric,
    currentCount: number,
    runner: QueryRunner = this.db,
  ): Promise<void> {
    const plan = await this.getActivePlan(userId, runner);
    const limit = plan.limits[metric as unknown as keyof PlanLimits];
    if (limit === null || limit === undefined) return;
    if (typeof limit !== 'number') return;
    if (currentCount >= limit) throw this.limitError(metric, plan.planCode, limit);
  }

  /** Throws if a boolean feature flag (e.g. satelliteMonitoring, advancedReports) is off. */
  async assertFeatureEnabled(
    userId: string,
    metric: EntitlementMetric,
    runner: QueryRunner = this.db,
  ): Promise<void> {
    const plan = await this.getActivePlan(userId, runner);
    const enabled = plan.limits[metric as unknown as keyof PlanLimits];
    if (!enabled) throw this.limitError(metric, plan.planCode, enabled ?? false);
  }

  async getUsageSnapshot(userId: string): Promise<{
    plan: { code: string; limits: PlanLimits };
    usage: Record<string, number>;
    period: { start: string; end: string };
  }> {
    const plan = await this.getActivePlan(userId);
    const counts = await this.liveCounts(userId);
    const period = { start: monthStart(), end: monthEnd() };
    for (const [metric, count] of Object.entries(counts))
      await this.db.query(
        `INSERT INTO usage_records(id,user_id,metric,period_start,period_end,count,computed_at)
         VALUES(gen_random_uuid(),$1,$2,$3,$4,$5,now())
         ON CONFLICT(user_id,metric,period_start) DO UPDATE SET count=excluded.count,period_end=excluded.period_end,computed_at=now()`,
        [userId, metric, period.start, period.end, count],
      );
    return { plan: { code: plan.planCode, limits: plan.limits }, usage: counts, period };
  }

  private async liveCounts(userId: string): Promise<Record<string, number>> {
    const rows: Array<Record<string, string>> = await this.db.query(
      `SELECT
        (SELECT count(*) FROM farms f JOIN farmer_profiles fp ON fp.id=f.farmer_id WHERE fp.user_id=$1 AND f.deleted_at IS NULL)::text "maxFarms",
        (SELECT count(*) FROM crop_cycles cc JOIN fields fi ON fi.id=cc.field_id JOIN farms f ON f.id=fi.farm_id JOIN farmer_profiles fp ON fp.id=f.farmer_id WHERE fp.user_id=$1 AND cc.deleted_at IS NULL AND cc.status IN('planned','active'))::text "maxActiveCropSeasons",
        (SELECT count(*) FROM farm_brain_runs WHERE user_id=$1 AND created_at>=date_trunc('month',now()))::text "geminiAnalysesPerMonth"`,
      [userId],
    );
    const r = rows[0] ?? {};
    return {
      maxFarms: Number(r.maxFarms ?? 0),
      maxActiveCropSeasons: Number(r.maxActiveCropSeasons ?? 0),
      geminiAnalysesPerMonth: Number(r.geminiAnalysesPerMonth ?? 0),
    };
  }

  private limitError(
    metric: EntitlementMetric,
    planCode: string,
    limit: unknown,
  ): ForbiddenException {
    return new ForbiddenException({
      code: 'ENTITLEMENT_LIMIT_REACHED',
      message: `Your ${planCode} plan does not allow this action (${metric}). Upgrade your plan to continue.`,
      metric,
      plan: planCode,
      limit,
    });
  }
}

function monthStart(): string {
  const now = new Date();
  return new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), 1)).toISOString().slice(0, 10);
}
function monthEnd(): string {
  const now = new Date();
  return new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth() + 1, 0))
    .toISOString()
    .slice(0, 10);
}

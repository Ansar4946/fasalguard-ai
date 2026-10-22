import { Injectable } from '@nestjs/common';
import { DataSource } from 'typeorm';

@Injectable()
export class FarmLedgerService {
  constructor(private readonly db: DataSource) {}

  async list(userId: string): Promise<unknown[]> {
    return this.db.query(
      `SELECT le.id,le.farm_id AS "farmId",le.crop_cycle_id AS "cropSeasonId",f.name AS "farmName",
              le.category,le.amount_minor AS "amountMinor",le.currency,le.occurred_on AS "occurredOn",
              le.channel,le.confirmed_at AS "confirmedAt",le.created_at AS "createdAt"
       FROM farm_ledger_entries le JOIN farms f ON f.id=le.farm_id
       WHERE le.user_id=$1 ORDER BY le.occurred_on DESC,le.created_at DESC LIMIT 100`,
      [userId],
    );
  }

  /**
   * Owner-scoped aggregates over the confirmed ledger for the assistant. Sums are computed in
   * PostgreSQL over integer paisa and returned as strings, so no JavaScript float is involved.
   * "Today" is the Pakistan-local date, matching how occurred_on is recorded.
   */
  async summarize(
    userId: string,
    period: 'week' | 'month' | 'season' | 'all',
  ): Promise<{
    totalMinor: string;
    count: number;
    byCategory: Array<{ category: string; totalMinor: string; count: number }>;
  }> {
    const today = `(now() AT TIME ZONE 'Asia/Karachi')::date`;
    const filter =
      period === 'week'
        ? `AND le.occurred_on > ${today} - 7`
        : period === 'month'
          ? `AND le.occurred_on >= date_trunc('month', ${today})::date`
          : period === 'season'
            ? `AND le.crop_cycle_id IN (SELECT cc.id FROM crop_cycles cc JOIN fields fi ON fi.id=cc.field_id
                 JOIN farms f ON f.id=fi.farm_id JOIN farmer_profiles fp ON fp.id=f.farmer_id
                 WHERE fp.user_id=$1 AND cc.status IN('planned','active') AND cc.deleted_at IS NULL)`
            : '';
    const rows = await this.db.query<
      Array<{ category: string; totalMinor: string; count: number }>
    >(
      `SELECT le.category,sum(le.amount_minor)::text AS "totalMinor",count(*)::int AS count
       FROM farm_ledger_entries le WHERE le.user_id=$1 AND le.type='EXPENSE' ${filter}
       GROUP BY le.category ORDER BY sum(le.amount_minor) DESC,le.category`,
      [userId],
    );
    return {
      totalMinor: rows.reduce((sum, r) => sum + BigInt(r.totalMinor), 0n).toString(),
      count: rows.reduce((sum, r) => sum + r.count, 0),
      byCategory: rows,
    };
  }

  /** Newest confirmed entries (owner-scoped), reusing the same ordering as list(). */
  async latest(
    userId: string,
    limit = 5,
  ): Promise<Array<{ occurredOn: string; category: string; amountMinor: string; farm: string }>> {
    return this.db.query(
      `SELECT to_char(le.occurred_on,'YYYY-MM-DD') AS "occurredOn",le.category,le.amount_minor::text AS "amountMinor",f.name AS farm
       FROM farm_ledger_entries le JOIN farms f ON f.id=le.farm_id
       WHERE le.user_id=$1 ORDER BY le.occurred_on DESC,le.created_at DESC LIMIT $2`,
      [userId, Math.min(Math.max(limit, 1), 10)],
    );
  }
}

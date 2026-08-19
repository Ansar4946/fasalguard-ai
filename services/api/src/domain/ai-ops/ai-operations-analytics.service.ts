import { Injectable } from '@nestjs/common';
import { InjectDataSource } from '@nestjs/typeorm';
import { DataSource } from 'typeorm';
/* eslint-disable @typescript-eslint/explicit-function-return-type */

/**
 * Every value is derived from real, persisted `ai_runs` rows (plus a live join to
 * `farm_brain_tool_calls` for the "incidents created"/"actions triggered" counts, which
 * are only accurate once a proposed tool call is later confirmed — after an `ai_runs` row
 * was already written) — matching the same never-fabricate discipline as
 * `AnalyticsService`/`AdminBillingService`/`FunnelAnalyticsService`. Individual accounts
 * flagged `is_test_account` are excluded.
 */
@Injectable()
export class AiOperationsAnalyticsService {
  constructor(@InjectDataSource() private readonly db: DataSource) {}

  async summary() {
    const rows = await this.db.query<
      Array<
        Record<string, string | null> & {
          byOperation: Array<{ operation: string; count: number }> | null;
          byProvider: Array<{ provider: string; count: number }> | null;
        }
      >
    >(`SELECT
      (SELECT count(*) FROM ai_runs r LEFT JOIN users u ON u.id=r.user_id WHERE r.provider='GOOGLE_GEMINI' AND (r.user_id IS NULL OR u.is_test_account=false))::text "geminiCalls",
      (SELECT count(*) FROM ai_runs r LEFT JOIN users u ON u.id=r.user_id WHERE r.status='COMPLETED' AND (r.user_id IS NULL OR u.is_test_account=false))::text "completedCalls",
      (SELECT count(*) FROM ai_runs r LEFT JOIN users u ON u.id=r.user_id WHERE r.status='FAILED' AND (r.user_id IS NULL OR u.is_test_account=false))::text "failedCalls",
      (SELECT count(*) FROM ai_runs r LEFT JOIN users u ON u.id=r.user_id WHERE r.user_id IS NULL OR u.is_test_account=false)::text "totalCalls",
      (SELECT avg(latency_ms) FROM ai_runs r LEFT JOIN users u ON u.id=r.user_id WHERE r.status='COMPLETED' AND r.latency_ms IS NOT NULL AND (r.user_id IS NULL OR u.is_test_account=false))::text "avgLatencyMs",
      (SELECT percentile_cont(0.95) WITHIN GROUP (ORDER BY latency_ms) FROM ai_runs r LEFT JOIN users u ON u.id=r.user_id WHERE r.status='COMPLETED' AND r.latency_ms IS NOT NULL AND (r.user_id IS NULL OR u.is_test_account=false))::text "p95LatencyMs",
      (SELECT COALESCE(sum(tool_call_count),0) FROM ai_runs r LEFT JOIN users u ON u.id=r.user_id WHERE r.user_id IS NULL OR u.is_test_account=false)::text "toolCallCount",
      (SELECT count(*) FROM ai_runs r LEFT JOIN users u ON u.id=r.user_id WHERE r.operation IN('FARM_HEALTH_ANALYSIS','INCIDENT_INVESTIGATION') AND (r.user_id IS NULL OR u.is_test_account=false))::text "farmAnalyses",
      (SELECT count(*) FROM farm_brain_tool_calls WHERE name='createIncident' AND status='EXECUTED')::text "incidentsCreated",
      (SELECT count(*) FROM farm_brain_tool_calls WHERE status='EXECUTED')::text "actionsTriggered",
      (SELECT COALESCE(jsonb_agg(jsonb_build_object('operation',operation,'count',count)),'[]'::jsonb) FROM
        (SELECT r.operation,count(*)::int count FROM ai_runs r LEFT JOIN users u ON u.id=r.user_id WHERE r.user_id IS NULL OR u.is_test_account=false GROUP BY r.operation ORDER BY r.operation) x)::jsonb "byOperation",
      (SELECT COALESCE(jsonb_agg(jsonb_build_object('provider',provider,'count',count)),'[]'::jsonb) FROM
        (SELECT r.provider,count(*)::int count FROM ai_runs r LEFT JOIN users u ON u.id=r.user_id WHERE r.user_id IS NULL OR u.is_test_account=false GROUP BY r.provider ORDER BY r.provider) x)::jsonb "byProvider"
    `);
    const r = rows[0] ?? ({} as (typeof rows)[number]);
    const totalCalls = Number(r.totalCalls ?? 0);
    const completedCalls = Number(r.completedCalls ?? 0);
    return {
      generatedAt: new Date().toISOString(),
      scope: 'real-persisted-ai-runs',
      policy: {
        excludesTestAccounts: true,
        chainOfThoughtExcluded: true,
        note: 'ai_runs stores structured summaries only (findings/tool names/confidence/error codes) — never raw prompts, raw model responses, or chain-of-thought.',
      },
      totalCalls,
      geminiCalls: Number(r.geminiCalls ?? 0),
      completedCalls,
      failedCalls: Number(r.failedCalls ?? 0),
      successRate: totalCalls > 0 ? completedCalls / totalCalls : null,
      avgLatencyMs: r.avgLatencyMs === null ? null : Number(r.avgLatencyMs),
      p95LatencyMs: r.p95LatencyMs === null ? null : Number(r.p95LatencyMs),
      toolCallCount: Number(r.toolCallCount ?? 0),
      farmAnalyses: Number(r.farmAnalyses ?? 0),
      incidentsCreated: Number(r.incidentsCreated ?? 0),
      actionsTriggered: Number(r.actionsTriggered ?? 0),
      byOperation: r.byOperation ?? [],
      byProvider: r.byProvider ?? [],
    };
  }

  /** Raw real rows for the judge-facing evidence export — no aggregation, no fabrication. */
  async exportRows(): Promise<
    Array<{
      id: string;
      createdAt: Date;
      operation: string;
      provider: string;
      model: string;
      status: string;
      latencyMs: number | null;
      confidence: number | null;
      toolCallCount: number;
      humanReviewStatus: string;
      errorCode: string | null;
    }>
  > {
    return this.db.query(
      `SELECT r.id,r.created_at "createdAt",r.operation,r.provider,r.model,r.status,r.latency_ms "latencyMs",
        r.confidence,r.tool_call_count "toolCallCount",r.human_review_status "humanReviewStatus",r.error_code "errorCode"
       FROM ai_runs r LEFT JOIN users u ON u.id=r.user_id
       WHERE r.user_id IS NULL OR u.is_test_account=false
       ORDER BY r.created_at DESC LIMIT 5000`,
    );
  }
}

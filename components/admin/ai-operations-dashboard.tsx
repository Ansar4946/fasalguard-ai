"use client";

import { useEffect, useState } from "react";

interface AiOperationsSummary {
  generatedAt: string;
  policy: { excludesTestAccounts: boolean; chainOfThoughtExcluded: boolean; note: string };
  totalCalls: number;
  geminiCalls: number;
  completedCalls: number;
  failedCalls: number;
  successRate: number | null;
  avgLatencyMs: number | null;
  p95LatencyMs: number | null;
  toolCallCount: number;
  farmAnalyses: number;
  incidentsCreated: number;
  actionsTriggered: number;
  byOperation: Array<{ operation: string; count: number }>;
  byProvider: Array<{ provider: string; count: number }>;
}

type LoadState = "loading" | "ready" | "unauthorized" | "error";

async function fetchSummary(): Promise<AiOperationsSummary | "unauthorized" | "error"> {
  const res = await fetch("/api/admin/ai-operations", { cache: "no-store" });
  if (res.status === 403) return "unauthorized";
  if (!res.ok) return "error";
  return (await res.json()) as AiOperationsSummary;
}

function ms(value: number | null): string {
  return value === null ? "—" : `${Math.round(value).toLocaleString()} ms`;
}

export function AiOperationsDashboard() {
  const [state, setState] = useState<LoadState>("loading");
  const [data, setData] = useState<AiOperationsSummary | null>(null);

  useEffect(() => {
    // setState only happens inside this .then()/.catch(), never synchronously in the effect body.
    fetchSummary()
      .then((result) => {
        if (result === "unauthorized") return setState("unauthorized");
        if (result === "error") return setState("error");
        setData(result);
        setState("ready");
      })
      .catch(() => setState("error"));
  }, []);

  if (state === "loading")
    return (
      <div className="mx-auto max-w-6xl px-4 py-10 text-sm text-muted" role="status">
        Loading real AI execution telemetry…
      </div>
    );
  if (state === "unauthorized")
    return (
      <div className="mx-auto max-w-6xl px-4 py-10">
        <p className="rounded-2xl border border-amber-300 bg-amber-50 p-4 text-sm font-semibold text-amber-900">
          You need an Admin or Super Admin account to view AI operations evidence.
        </p>
      </div>
    );
  if (state === "error" || !data)
    return (
      <div className="mx-auto max-w-6xl px-4 py-10">
        <p className="rounded-2xl border border-red-200 bg-red-50 p-4 text-sm font-semibold text-red-900">
          Could not load AI operations data. Try refreshing.
        </p>
      </div>
    );

  return (
    <div className="mx-auto max-w-6xl px-4 py-6 sm:px-6">
      <header className="flex flex-col gap-3 sm:flex-row sm:items-end sm:justify-between">
        <div>
          <p className="text-[10px] font-extrabold uppercase tracking-[.16em] text-success">
            Every run below is a real, persisted execution — no chain-of-thought, no raw secrets
          </p>
          <h1 className="mt-1 text-2xl font-bold text-brand-dark">AI Execution Telemetry</h1>
          <p className="mt-1 max-w-2xl text-xs leading-5 text-muted">{data.policy.note}</p>
        </div>
        <a
          href="/api/admin/ai-operations/export.csv"
          className="inline-flex min-h-10 items-center justify-center rounded-full bg-brand px-5 text-xs font-bold text-white"
        >
          Export CSV for judges
        </a>
      </header>

      <section className="mt-5 grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
        <Stat label="Total AI calls" value={data.totalCalls} />
        <Stat label="Gemini calls" value={data.geminiCalls} />
        <Stat
          label="Success rate"
          value={data.successRate === null ? "—" : `${Math.round(data.successRate * 100)}%`}
        />
        <Stat label="Failed calls" value={data.failedCalls} />
      </section>

      <section className="mt-4 grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
        <Stat label="Avg latency" value={ms(data.avgLatencyMs)} />
        <Stat label="p95 latency" value={ms(data.p95LatencyMs)} />
        <Stat label="Tool calls" value={data.toolCallCount} />
        <Stat label="Farm analyses" value={data.farmAnalyses} />
        <Stat label="Incidents created" value={data.incidentsCreated} />
        <Stat label="Actions triggered" value={data.actionsTriggered} />
      </section>

      <section className="mt-4 grid gap-4 lg:grid-cols-2">
        <article className="rounded-2xl border border-brand/10 bg-white p-5 shadow-sm">
          <h2 className="text-sm font-bold text-brand-dark">By operation</h2>
          <ul className="mt-3 space-y-2">
            {data.byOperation.length === 0 && (
              <li className="text-xs text-muted">No AI runs recorded yet.</li>
            )}
            {data.byOperation.map((row) => (
              <li key={row.operation} className="flex items-center justify-between text-xs">
                <span className="font-semibold text-brand-dark">{row.operation}</span>
                <span className="font-bold text-muted">{row.count}</span>
              </li>
            ))}
          </ul>
        </article>
        <article className="rounded-2xl border border-brand/10 bg-white p-5 shadow-sm">
          <h2 className="text-sm font-bold text-brand-dark">By provider</h2>
          <ul className="mt-3 space-y-2">
            {data.byProvider.length === 0 && (
              <li className="text-xs text-muted">No AI runs recorded yet.</li>
            )}
            {data.byProvider.map((row) => (
              <li key={row.provider} className="flex items-center justify-between text-xs">
                <span className="font-semibold text-brand-dark">{row.provider}</span>
                <span className="font-bold text-muted">{row.count}</span>
              </li>
            ))}
          </ul>
        </article>
      </section>
    </div>
  );
}

function Stat({ label, value }: { label: string; value: string | number }) {
  return (
    <article className="rounded-2xl border border-brand/10 bg-white p-4 shadow-sm">
      <p className="text-[9px] font-bold uppercase tracking-wide text-muted">{label}</p>
      <p className="mt-2 text-xl font-extrabold text-brand-dark">{value}</p>
    </article>
  );
}

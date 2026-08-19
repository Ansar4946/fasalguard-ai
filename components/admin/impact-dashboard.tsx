"use client";

import { useEffect, useState } from "react";

interface RateMetric {
  rate: number | null;
  sampleSize: number;
}
interface LatencyMetric {
  avgSeconds: number | null;
  sampleSize: number;
}
interface DeltaMetric {
  avg: number | null;
  sampleSize: number;
}
interface ImpactSummary {
  generatedAt: string;
  policy: { excludesTestAccounts: boolean; neverClaimsLossPrevented: boolean; note: string };
  timeToDetection: LatencyMetric;
  timeToNotification: LatencyMetric;
  timeToAcknowledgement: LatencyMetric;
  taskCompletionRate: RateMetric;
  incidentResolutionRate: RateMetric;
  followUpCompletionRate: RateMetric;
  confirmedAlertRate: RateMetric;
  riskReduction: DeltaMetric;
  affectedAreaChangeHectares: DeltaMetric;
}

type LoadState = "loading" | "ready" | "unauthorized" | "error";

async function fetchSummary(): Promise<ImpactSummary | "unauthorized" | "error"> {
  const res = await fetch("/api/admin/impact", { cache: "no-store" });
  if (res.status === 403) return "unauthorized";
  if (!res.ok) return "error";
  return (await res.json()) as ImpactSummary;
}

function seconds(value: number | null): string {
  if (value === null) return "—";
  if (value < 120) return `${Math.round(value)}s`;
  if (value < 7200) return `${Math.round(value / 60)}m`;
  return `${(value / 3600).toFixed(1)}h`;
}
function pct(value: number | null): string {
  return value === null ? "—" : `${Math.round(value * 100)}%`;
}

export function ImpactDashboard() {
  const [state, setState] = useState<LoadState>("loading");
  const [data, setData] = useState<ImpactSummary | null>(null);

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
        Loading real incident outcome data…
      </div>
    );
  if (state === "unauthorized")
    return (
      <div className="mx-auto max-w-6xl px-4 py-10">
        <p className="rounded-2xl border border-amber-300 bg-amber-50 p-4 text-sm font-semibold text-amber-900">
          You need an Admin or Super Admin account to view impact evidence.
        </p>
      </div>
    );
  if (state === "error" || !data)
    return (
      <div className="mx-auto max-w-6xl px-4 py-10">
        <p className="rounded-2xl border border-red-200 bg-red-50 p-4 text-sm font-semibold text-red-900">
          Could not load impact data. Try refreshing.
        </p>
      </div>
    );

  return (
    <div className="mx-auto max-w-6xl px-4 py-6 sm:px-6">
      <header>
        <p className="text-[10px] font-extrabold uppercase tracking-[.16em] text-success">
          Every number below traces back to a real incident, action, or follow-up check
        </p>
        <h1 className="mt-1 text-2xl font-bold text-brand-dark">Outcome &amp; Impact Engine</h1>
        <p className="mt-1 max-w-2xl text-xs leading-5 text-muted">{data.policy.note}</p>
      </header>

      <section className="mt-5 grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
        <Stat label="Time to detection" value={seconds(data.timeToDetection.avgSeconds)} sampleSize={data.timeToDetection.sampleSize} />
        <Stat label="Time to notification" value={seconds(data.timeToNotification.avgSeconds)} sampleSize={data.timeToNotification.sampleSize} />
        <Stat label="Time to acknowledgement" value={seconds(data.timeToAcknowledgement.avgSeconds)} sampleSize={data.timeToAcknowledgement.sampleSize} />
        <Stat label="Task completion rate" value={pct(data.taskCompletionRate.rate)} sampleSize={data.taskCompletionRate.sampleSize} />
      </section>

      <section className="mt-4 grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
        <Stat label="Incident resolution rate" value={pct(data.incidentResolutionRate.rate)} sampleSize={data.incidentResolutionRate.sampleSize} />
        <Stat label="Follow-up completion rate" value={pct(data.followUpCompletionRate.rate)} sampleSize={data.followUpCompletionRate.sampleSize} />
        <Stat label="Confirmed alert rate" value={pct(data.confirmedAlertRate.rate)} sampleSize={data.confirmedAlertRate.sampleSize} />
        <Stat
          label="Avg. risk reduction"
          value={data.riskReduction.avg === null ? "—" : data.riskReduction.avg.toFixed(2)}
          sampleSize={data.riskReduction.sampleSize}
        />
      </section>

      <section className="mt-4 grid gap-3 sm:grid-cols-2">
        <Stat
          label="Avg. affected-area change (ha)"
          value={
            data.affectedAreaChangeHectares.avg === null
              ? "—"
              : data.affectedAreaChangeHectares.avg.toFixed(2)
          }
          sampleSize={data.affectedAreaChangeHectares.sampleSize}
        />
      </section>

      <p className="mt-6 rounded-2xl border border-brand/10 bg-white p-4 text-[11px] leading-5 text-muted">
        Excludes test/demo accounts. Sample sizes are shown alongside every rate — a metric
        computed from a handful of incidents is not equivalent in confidence to one computed from
        hundreds. FasalGuard does not claim crop loss prevented; risk reduction and affected-area
        change are directional, evidence-derived signals, not agronomic loss verification.
      </p>
    </div>
  );
}

function Stat({
  label,
  value,
  sampleSize,
}: {
  label: string;
  value: string | number;
  sampleSize: number;
}) {
  return (
    <article className="rounded-2xl border border-brand/10 bg-white p-4 shadow-sm">
      <p className="text-[9px] font-bold uppercase tracking-wide text-muted">{label}</p>
      <p className="mt-2 text-xl font-extrabold text-brand-dark">{value}</p>
      <p className="mt-1 text-[10px] text-muted">n = {sampleSize}</p>
    </article>
  );
}

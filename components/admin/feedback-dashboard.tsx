"use client";

import { useEffect, useState } from "react";

interface Report {
  generatedAt: string;
  policy: { excludesTestAccounts: boolean; neverAutoPublishes: boolean };
  feedbackCount: number;
  positiveRate: number | null;
  featureBreakdown: Array<{ feature: string; count: number; positiveRate: number | null }>;
  testimonialCandidateCount: number;
  publishedCount: number;
}
interface Candidate {
  id: string;
  feedback: string;
  feature: string;
  createdAt: string;
  fullName: string | null;
}

type LoadState = "loading" | "ready" | "unauthorized" | "error";

async function fetchJson<T>(url: string): Promise<T | "unauthorized" | "error"> {
  const res = await fetch(url, { cache: "no-store" });
  if (res.status === 403) return "unauthorized";
  if (!res.ok) return "error";
  return (await res.json()) as T;
}

function pct(value: number | null): string {
  return value === null ? "—" : `${Math.round(value * 100)}%`;
}

export function FeedbackDashboard() {
  const [state, setState] = useState<LoadState>("loading");
  const [report, setReport] = useState<Report | null>(null);
  const [candidates, setCandidates] = useState<Candidate[]>([]);
  const [refreshKey, setRefreshKey] = useState(0);
  const [publishError, setPublishError] = useState<string | null>(null);

  useEffect(() => {
    // setState only happens inside this .then()/.catch() chain, never synchronously in the effect body.
    Promise.all([
      fetchJson<Report>("/api/admin/feedback/report"),
      fetchJson<Candidate[]>("/api/admin/feedback/testimonial-candidates"),
    ])
      .then(([reportResult, candidatesResult]) => {
        if (reportResult === "unauthorized") return setState("unauthorized");
        if (reportResult === "error" || candidatesResult === "error") return setState("error");
        setReport(reportResult);
        setCandidates(Array.isArray(candidatesResult) ? candidatesResult : []);
        setState("ready");
      })
      .catch(() => setState("error"));
  }, [refreshKey]);

  function publish(id: string): void {
    setPublishError(null);
    fetch(`/api/admin/feedback/${id}/publish`, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({}),
    })
      .then(async (res) => {
        if (!res.ok) {
          const body = (await res.json().catch(() => null)) as { error?: { message?: string } } | null;
          setPublishError(body?.error?.message ?? "Could not publish this feedback.");
          return;
        }
        setRefreshKey((k) => k + 1);
      })
      .catch(() => setPublishError("Could not publish this feedback."));
  }

  if (state === "loading")
    return (
      <div className="mx-auto max-w-6xl px-4 py-10 text-sm text-muted" role="status">
        Loading real feedback data…
      </div>
    );
  if (state === "unauthorized")
    return (
      <div className="mx-auto max-w-6xl px-4 py-10">
        <p className="rounded-2xl border border-amber-300 bg-amber-50 p-4 text-sm font-semibold text-amber-900">
          You need an Admin or Super Admin account to view feedback.
        </p>
      </div>
    );
  if (state === "error" || !report)
    return (
      <div className="mx-auto max-w-6xl px-4 py-10">
        <p className="rounded-2xl border border-red-200 bg-red-50 p-4 text-sm font-semibold text-red-900">
          Could not load feedback data. Try refreshing.
        </p>
      </div>
    );

  return (
    <div className="mx-auto max-w-6xl px-4 py-6 sm:px-6">
      <header>
        <p className="text-[10px] font-extrabold uppercase tracking-[.16em] text-success">
          Real farmer feedback — testimonials are never published without explicit permission
        </p>
        <h1 className="mt-1 text-2xl font-bold text-brand-dark">Feedback</h1>
      </header>

      <section className="mt-5 grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
        <Stat label="Feedback count" value={report.feedbackCount} />
        <Stat label="Positive rate" value={pct(report.positiveRate)} />
        <Stat label="Testimonial candidates" value={report.testimonialCandidateCount} />
        <Stat label="Published" value={report.publishedCount} />
      </section>

      <section className="mt-6 overflow-hidden rounded-2xl border border-brand/10 bg-white shadow-sm">
        <div className="border-b border-brand/5 p-5">
          <h2 className="text-sm font-bold text-brand-dark">Feature breakdown</h2>
        </div>
        <table className="w-full text-left text-xs">
          <thead className="bg-surface-soft text-[10px] uppercase tracking-wide text-muted">
            <tr>
              <th className="px-4 py-2">Feature</th>
              <th className="px-4 py-2">Count</th>
              <th className="px-4 py-2">Positive rate</th>
            </tr>
          </thead>
          <tbody>
            {report.featureBreakdown.length === 0 && (
              <tr>
                <td colSpan={3} className="px-4 py-6 text-center text-muted">
                  No feedback recorded yet.
                </td>
              </tr>
            )}
            {report.featureBreakdown.map((row) => (
              <tr key={row.feature} className="border-t border-brand/5">
                <td className="px-4 py-2 font-semibold">{row.feature.replace(/_/g, " ")}</td>
                <td className="px-4 py-2">{row.count}</td>
                <td className="px-4 py-2">{pct(row.positiveRate)}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </section>

      <section className="mt-6 overflow-hidden rounded-2xl border border-brand/10 bg-white shadow-sm">
        <div className="border-b border-brand/5 p-5">
          <h2 className="text-sm font-bold text-brand-dark">Testimonial candidates</h2>
          <p className="mt-1 text-[10px] text-muted">
            Consented, positive feedback awaiting your review — nothing here is public yet.
          </p>
        </div>
        {publishError && (
          <p className="px-5 pt-3 text-[11px] font-semibold text-danger">{publishError}</p>
        )}
        <ul className="divide-y divide-brand/5">
          {candidates.length === 0 && (
            <li className="p-5 text-center text-xs text-muted">No candidates right now.</li>
          )}
          {candidates.map((c) => (
            <li key={c.id} className="flex flex-col gap-2 p-4 text-xs sm:flex-row sm:items-center sm:justify-between">
              <div>
                <div className="flex items-center gap-2">
                  <span className="font-bold text-brand-dark">{c.fullName ?? "A farmer"}</span>
                  <span className="rounded-full bg-surface-soft px-2 py-0.5 text-[9px] font-bold uppercase text-muted">
                    {c.feature.replace(/_/g, " ")}
                  </span>
                </div>
                <p className="mt-1 text-muted">{c.feedback}</p>
              </div>
              <button
                type="button"
                onClick={() => publish(c.id)}
                className="inline-flex min-h-9 shrink-0 items-center rounded-full bg-brand px-4 text-[11px] font-bold text-white"
              >
                Publish
              </button>
            </li>
          ))}
        </ul>
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

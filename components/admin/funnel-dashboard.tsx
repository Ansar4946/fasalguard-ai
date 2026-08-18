"use client";

import { useEffect, useState } from "react";

interface FunnelResponse {
  generatedAt: string;
  policy: {
    excludesTestAccounts: boolean;
    activatedDefinition: string;
    landingViewsCaveat: string;
  };
  funnel: {
    landingViews: number;
    pilotLeads: number;
    registered: number;
    onboarded: number;
    activated: number;
    active7Day: number;
    upgradeRequested: number;
    paid: number;
  };
  sevenDayReturn: { eligibleUsers: number; returnedUsers: number; rate: number | null };
  referralSignups: number;
}

type LoadState = "loading" | "ready" | "unauthorized" | "error";

const stages: Array<{ key: keyof FunnelResponse["funnel"]; label: string }> = [
  { key: "landingViews", label: "Landing views" },
  { key: "pilotLeads", label: "Pilot leads" },
  { key: "registered", label: "Registered" },
  { key: "onboarded", label: "Onboarded" },
  { key: "activated", label: "Activated" },
  { key: "active7Day", label: "Active (7d)" },
  { key: "upgradeRequested", label: "Upgrade requested" },
  { key: "paid", label: "Paid" },
];

async function fetchFunnel(): Promise<FunnelResponse | "unauthorized" | "error"> {
  const res = await fetch("/api/admin/funnel", { cache: "no-store" });
  if (res.status === 403) return "unauthorized";
  if (!res.ok) return "error";
  return (await res.json()) as FunnelResponse;
}

export function FunnelDashboard() {
  const [state, setState] = useState<LoadState>("loading");
  const [data, setData] = useState<FunnelResponse | null>(null);

  useEffect(() => {
    // setState only ever happens inside this .then()/.catch(), never synchronously in the
    // effect body — fetchFunnel() itself never calls setState.
    fetchFunnel()
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
        Loading real funnel data…
      </div>
    );
  if (state === "unauthorized")
    return (
      <div className="mx-auto max-w-6xl px-4 py-10">
        <p className="rounded-2xl border border-amber-300 bg-amber-50 p-4 text-sm font-semibold text-amber-900">
          You need an Admin or Super Admin account to view funnel evidence.
        </p>
      </div>
    );
  if (state === "error" || !data)
    return (
      <div className="mx-auto max-w-6xl px-4 py-10">
        <p className="rounded-2xl border border-red-200 bg-red-50 p-4 text-sm font-semibold text-red-900">
          Could not load funnel data. Try refreshing.
        </p>
      </div>
    );

  const max = Math.max(1, ...stages.map((s) => data.funnel[s.key]));

  return (
    <div className="mx-auto max-w-6xl px-4 py-6 sm:px-6">
      <header>
        <p className="text-[10px] font-extrabold uppercase tracking-[.16em] text-success">
          Every stage below is derived from real, persisted rows
        </p>
        <h1 className="mt-1 text-2xl font-bold text-brand-dark">Acquisition Funnel</h1>
        <p className="mt-1 max-w-2xl text-xs leading-5 text-muted">
          Visitor → registered → onboarded → activated → active → upgrade-requested → paid.
          Internal/test accounts are excluded.
        </p>
      </header>

      <section className="mt-5 rounded-2xl border border-brand/10 bg-white p-5 shadow-sm">
        <div className="space-y-3">
          {stages.map((stage) => {
            const value = data.funnel[stage.key];
            const width = Math.round((value / max) * 100);
            return (
              <div key={stage.key}>
                <div className="flex items-center justify-between text-xs">
                  <span className="font-semibold text-brand-dark">{stage.label}</span>
                  <span className="font-bold text-muted">{value}</span>
                </div>
                <div className="mt-1 h-2 rounded-full bg-border">
                  <div
                    className="h-full rounded-full bg-brand"
                    style={{ width: `${Math.max(2, width)}%` }}
                  />
                </div>
              </div>
            );
          })}
        </div>
      </section>

      <section className="mt-4 grid gap-4 sm:grid-cols-2">
        <article className="rounded-2xl border border-brand/10 bg-white p-5 shadow-sm">
          <p className="text-[9px] font-bold uppercase tracking-wide text-muted">7-day return rate</p>
          <p className="mt-2 text-xl font-extrabold text-brand-dark">
            {data.sevenDayReturn.rate === null
              ? "Not enough data yet"
              : `${Math.round(data.sevenDayReturn.rate * 100)}%`}
          </p>
          <p className="mt-1 text-[9px] text-muted">
            {data.sevenDayReturn.returnedUsers} of {data.sevenDayReturn.eligibleUsers} eligible
            users returned after 7 days
          </p>
        </article>
        <article className="rounded-2xl border border-brand/10 bg-white p-5 shadow-sm">
          <p className="text-[9px] font-bold uppercase tracking-wide text-muted">Referral signups</p>
          <p className="mt-2 text-xl font-extrabold text-brand-dark">{data.referralSignups}</p>
          <p className="mt-1 text-[9px] text-muted">Farmers who registered via another farmer&apos;s link</p>
        </article>
      </section>

      <p className="mt-3 text-[10px] leading-4 text-muted">{data.policy.activatedDefinition}</p>
      <p className="mt-1 text-[10px] leading-4 text-muted">{data.policy.landingViewsCaveat}</p>
    </div>
  );
}

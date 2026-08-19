"use client";

import { useEffect, useState } from "react";

interface PlanLimits {
  maxFarms: number | null;
  maxActiveCropSeasons: number | null;
  geminiAnalysesPerMonth: number | null;
  satelliteMonitoring: boolean;
  advancedReports: boolean;
  maxTeamMembers: number | null;
}
interface Plan {
  code: string;
  name: string;
  priceMinor: number | null;
  currency: string;
  billingInterval: string;
  limits: PlanLimits;
}

type LoadState = "loading" | "ready" | "error";
type Interval = "MONTHLY" | "ANNUAL";

function money(minor: number, currency: string): string {
  return `${currency} ${(minor / 100).toLocaleString(undefined, { minimumFractionDigits: 0 })}`;
}

function featureLines(limits: PlanLimits): string[] {
  const lines: string[] = [];
  lines.push(limits.maxFarms === null ? "Unlimited farms" : `Up to ${limits.maxFarms} farm${limits.maxFarms === 1 ? "" : "s"}`);
  lines.push(
    limits.maxActiveCropSeasons === null
      ? "Unlimited active crop seasons"
      : `Up to ${limits.maxActiveCropSeasons} active crop seasons`,
  );
  lines.push(
    limits.geminiAnalysesPerMonth === null
      ? "Unlimited Gemini AI investigations"
      : `${limits.geminiAnalysesPerMonth} Gemini AI investigations/month`,
  );
  if (limits.satelliteMonitoring) lines.push("Automatic satellite monitoring");
  if (limits.advancedReports) lines.push("Advanced reports & exports");
  lines.push(
    limits.maxTeamMembers === null
      ? "Unlimited team members"
      : `${limits.maxTeamMembers} team member${limits.maxTeamMembers === 1 ? "" : "s"}`,
  );
  return lines;
}

async function fetchPlans(): Promise<Plan[] | null> {
  const res = await fetch("/api/billing/plans", { cache: "no-store" });
  if (!res.ok) return null;
  return (await res.json()) as Plan[];
}

function checkout(planCode: string): void {
  fetch("/api/billing/stripe/checkout-session", {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({ planCode }),
  })
    .then(async (res) => {
      const body = (await res.json().catch(() => ({}))) as { url?: string };
      if (res.status === 401) {
        window.location.href = `/join?plan=${encodeURIComponent(planCode)}`;
        return;
      }
      if (body.url) window.location.href = body.url;
      else window.location.href = `/billing/upgrade`;
    })
    .catch(() => {
      window.location.href = `/billing/upgrade`;
    });
}

export function PricingPage() {
  const [state, setState] = useState<LoadState>("loading");
  const [plans, setPlans] = useState<Plan[]>([]);
  const [interval, setInterval] = useState<Interval>("MONTHLY");

  useEffect(() => {
    // setState only happens inside this .then()/.catch() chain, never synchronously in the effect body.
    fetchPlans()
      .then((result) => {
        if (!result) return setState("error");
        setPlans(result);
        setState("ready");
      })
      .catch(() => setState("error"));
  }, []);

  if (state === "loading")
    return <div className="mx-auto max-w-6xl px-4 py-16 text-center text-sm text-muted">Loading plans…</div>;
  if (state === "error" || plans.length === 0)
    return (
      <div className="mx-auto max-w-6xl px-4 py-16 text-center text-sm font-semibold text-danger">
        Could not load pricing right now. Try refreshing.
      </div>
    );

  const tiers = ["FREE", "FARMER_PRO", "FARM_BUSINESS", "COOPERATIVE"];
  const byTier = new Map(plans.map((p) => [p.code, p]));

  return (
    <div className="bg-gradient-to-b from-brand-soft/40 via-background to-background">
      <div className="mx-auto max-w-6xl px-4 py-16 sm:px-6">
        <div className="text-center">
          <p className="text-[11px] font-extrabold uppercase tracking-[.18em] text-brand">
            Simple, transparent pricing
          </p>
          <h1 className="mt-2 text-3xl font-extrabold text-brand-dark sm:text-4xl">
            Grow with confidence, priced for real farms
          </h1>
          <p className="mx-auto mt-3 max-w-xl text-sm text-muted">
            Every plan includes real, Gemini-powered farm intelligence. Upgrade for satellite
            monitoring, advanced reports, and room to grow.
          </p>
        </div>

        <div className="mt-8 flex justify-center">
          <div className="inline-flex rounded-full border border-brand/15 bg-white p-1 shadow-sm">
            <button
              type="button"
              onClick={() => setInterval("MONTHLY")}
              className={`rounded-full px-5 py-2 text-xs font-bold transition ${interval === "MONTHLY" ? "bg-brand text-white" : "text-muted"}`}
            >
              Monthly
            </button>
            <button
              type="button"
              onClick={() => setInterval("ANNUAL")}
              className={`inline-flex items-center gap-2 rounded-full px-5 py-2 text-xs font-bold transition ${interval === "ANNUAL" ? "bg-brand text-white" : "text-muted"}`}
            >
              Annual
              <span
                className={`rounded-full px-2 py-0.5 text-[9px] font-extrabold ${interval === "ANNUAL" ? "bg-white/20 text-white" : "bg-success/10 text-success"}`}
              >
                2 months free
              </span>
            </button>
          </div>
        </div>

        <div className="mt-10 grid gap-5 lg:grid-cols-4">
          {tiers.map((tier) => {
            const code =
              interval === "ANNUAL" && byTier.has(`${tier}_ANNUAL`) ? `${tier}_ANNUAL` : tier;
            const plan = byTier.get(code) ?? byTier.get(tier);
            if (!plan) return null;
            const popular = tier === "FARMER_PRO";
            const custom = plan.priceMinor === null;

            return (
              <article
                key={tier}
                className={`flex flex-col rounded-3xl border bg-white p-6 shadow-sm transition ${
                  popular ? "border-brand shadow-lg shadow-brand/10 ring-2 ring-brand" : "border-brand/10"
                }`}
              >
                {popular && (
                  <span className="mb-3 inline-flex w-fit items-center rounded-full bg-brand px-3 py-1 text-[10px] font-extrabold uppercase tracking-wide text-white">
                    Most popular
                  </span>
                )}
                <h2 className="text-lg font-extrabold text-brand-dark">{plan.name.replace(" (Annual)", "")}</h2>
                <div className="mt-3">
                  {plan.priceMinor === null ? (
                    <p className="text-2xl font-extrabold text-brand-dark">Contact sales</p>
                  ) : (
                    <>
                      <p className="flex items-baseline gap-1">
                        <span className="text-3xl font-extrabold text-brand-dark">
                          {money(
                            interval === "ANNUAL"
                              ? Math.round(plan.priceMinor / 12)
                              : plan.priceMinor,
                            plan.currency,
                          )}
                        </span>
                        <span className="text-xs font-semibold text-muted">/mo</span>
                      </p>
                      {interval === "ANNUAL" && plan.priceMinor > 0 && (
                        <p className="mt-1 text-[10px] font-semibold text-success">
                          Billed {money(plan.priceMinor, plan.currency)} yearly
                        </p>
                      )}
                    </>
                  )}
                </div>

                <ul className="mt-5 flex-1 space-y-2.5">
                  {featureLines(plan.limits).map((line) => (
                    <li key={line} className="flex items-start gap-2 text-xs text-brand-dark">
                      <svg viewBox="0 0 20 20" className="mt-0.5 size-4 shrink-0 fill-success">
                        <path d="M8 13.4 4.6 10l-1.4 1.4L8 16.2 17 7.2l-1.4-1.4z" />
                      </svg>
                      {line}
                    </li>
                  ))}
                </ul>

                {custom ? (
                  <a
                    href="/join?plan=COOPERATIVE"
                    className="mt-6 inline-flex min-h-11 items-center justify-center rounded-full border border-brand/30 text-xs font-bold text-brand-dark"
                  >
                    Contact sales
                  </a>
                ) : plan.priceMinor === 0 ? (
                  <a
                    href="/join"
                    className="mt-6 inline-flex min-h-11 items-center justify-center rounded-full border border-brand/30 text-xs font-bold text-brand-dark"
                  >
                    Start free
                  </a>
                ) : (
                  <button
                    type="button"
                    onClick={() => checkout(plan.code)}
                    className={`mt-6 inline-flex min-h-11 items-center justify-center rounded-full text-xs font-bold ${
                      popular ? "bg-brand text-white" : "border border-brand/30 text-brand-dark"
                    }`}
                  >
                    Upgrade to {plan.name.replace(" (Annual)", "")}
                  </button>
                )}
              </article>
            );
          })}
        </div>

        <p className="mt-10 text-center text-[11px] text-muted">
          Secure card payments powered by Stripe. Prefer bank transfer, JazzCash, or EasyPaisa?{" "}
          <a href="/billing/upgrade" className="font-bold text-brand underline">
            Pay another way
          </a>
          .
        </p>
      </div>
    </div>
  );
}

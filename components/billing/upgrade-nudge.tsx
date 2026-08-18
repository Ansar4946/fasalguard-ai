"use client";

import Link from "next/link";
import { useEffect, useState } from "react";

interface UsageResponse {
  plan: { code: string; limits: Record<string, number | boolean | null> };
  usage: Record<string, number>;
}

async function fetchUsage(): Promise<UsageResponse | null> {
  const res = await fetch("/api/billing/usage", { cache: "no-store" });
  if (!res.ok) return null;
  return (await res.json()) as UsageResponse;
}

function nearLimitReason(data: UsageResponse): string | null {
  if (data.plan.code !== "FREE") return null;
  const { usage, plan } = data;
  for (const metric of ["maxFarms", "maxActiveCropSeasons", "geminiAnalysesPerMonth"] as const) {
    const limit = plan.limits[metric];
    if (typeof limit !== "number") continue;
    const used = usage[metric] ?? 0;
    if (used >= limit) return "You've reached a plan limit";
    if (used / limit >= 0.8) return "You're close to a plan limit";
  }
  return null;
}

export function UpgradeNudge() {
  const [reason, setReason] = useState<string | null>(null);

  useEffect(() => {
    // setState only happens in this .then(), never synchronously in the effect body.
    fetchUsage()
      .then((data) => {
        if (data) setReason(nearLimitReason(data));
      })
      .catch(() => null);
  }, []);

  if (!reason) return null;

  return (
    <div className="mt-2 shrink-0 rounded-2xl bg-brand/5 p-4">
      <p className="text-[10px] font-extrabold uppercase text-brand">Upgrade to Pro</p>
      <p className="mt-1 text-[10px] leading-4 text-muted">{reason}. Unlock more farms, crop seasons, Gemini analyses, satellite monitoring and advanced reports.</p>
      <Link
        href="/billing/upgrade"
        className="mt-3 inline-flex min-h-9 w-full items-center justify-center rounded-lg bg-brand text-xs font-bold text-white"
      >
        Upgrade
      </Link>
    </div>
  );
}

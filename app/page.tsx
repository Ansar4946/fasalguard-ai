"use client";

import Link from "next/link";
export const dynamic = 'force-dynamic';
import { useEffect } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import { useAuth } from "@/features/auth/auth-provider";
import { useOnboarding } from "@/features/onboarding/onboarding-provider";
import { BrandLogo } from "@/components/brand/brand-logo";

const homeForRole = (role: string) => {
  if (role === "ADMIN" || role === "SUPER_ADMIN") return "/admin/billing";
  if (role === "AGRICULTURE_EXPERT") return "/expert";
  if (role === "GOVERNMENT_VIEWER" || role === "NGO_VIEWER") return "/government";
  return "/dashboard";
};

const ACQUISITION_SOURCES = new Set([
  "DIRECT",
  "REFERRAL",
  "FARMER_GROUP",
  "SOCIAL",
  "PARTNER",
  "OTHER",
]);

export default function Home() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const { user, isLoading } = useAuth();
  const { data, updateSection, hydrated } = useOnboarding();

  useEffect(() => {
    if (!isLoading && user) router.replace(homeForRole(user.role));
  }, [isLoading, router, user]);

  useEffect(() => {
    if (!hydrated || isLoading || user) return;
    // setState (via updateSection) is deferred to a microtask, matching the same pattern
    // OnboardingProvider itself uses for its hydration setData call — never synchronously
    // inside the effect body.
    queueMicrotask(() => {
      const ref = searchParams.get("ref")?.trim();
      const rawSrc = searchParams.get("src")?.trim().toUpperCase();
      const src = rawSrc && ACQUISITION_SOURCES.has(rawSrc) ? rawSrc : ref ? "REFERRAL" : undefined;
      if ((ref || src) && (ref !== data.referral.code || src !== data.referral.source))
        updateSection("referral", {
          code: ref ?? data.referral.code,
          source: src ?? data.referral.source,
        });
    });
    fetch("/api/growth/landing-view", { method: "POST" }).catch(() => null);
    // Only run once per mount — this is a one-shot capture/beacon, not a live sync.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [hydrated, isLoading, user]);

  if (isLoading || user)
    return (
      <main className="grid min-h-dvh place-items-center bg-[#f8f4ea]">
        <div className="text-center">
          <BrandLogo compact priority className="mx-auto size-16 animate-pulse drop-shadow-lg" />
          <p className="mt-4 text-sm font-bold text-brand-dark">Opening FasalGuard AI...</p>
        </div>
      </main>
    );

  return (
    <main className="min-h-dvh bg-[#f8f4ea]">
      <header className="mx-auto flex max-w-6xl items-center justify-between px-4 py-5 sm:px-6">
        <BrandLogo priority className="h-auto w-40" />
        <Link
          href="/login"
          className="inline-flex min-h-10 items-center rounded-full px-4 text-xs font-bold text-brand-dark hover:bg-white/60"
        >
          Sign in
        </Link>
      </header>

      <section className="mx-auto max-w-4xl px-4 py-10 text-center sm:px-6 sm:py-16">
        <p className="text-[11px] font-extrabold uppercase tracking-[.18em] text-success">
          Gemini-powered crop intelligence
        </p>
        <h1 className="mt-3 text-3xl font-extrabold leading-tight text-brand-dark sm:text-5xl">
          Know what&apos;s happening in your fields — before it costs you the harvest.
        </h1>
        <p className="mx-auto mt-4 max-w-2xl text-sm leading-6 text-muted sm:text-base">
          FasalGuard AI monitors your farm with satellite data, weather risk and Gemini-powered
          investigations, and tells you exactly what to do next.
        </p>
        <div className="mt-8 flex flex-col items-center justify-center gap-3 sm:flex-row">
          <Link
            href="/onboarding/personal"
            className="inline-flex min-h-12 items-center justify-center gap-2 rounded-full bg-brand px-7 text-sm font-bold text-white shadow-lg shadow-green-900/15 transition hover:-translate-y-0.5 hover:bg-brand-dark"
          >
            Start Monitoring My Farm
            <span aria-hidden="true">→</span>
          </Link>
          <Link
            href="/join"
            className="inline-flex min-h-12 items-center justify-center rounded-full border border-brand/20 bg-white px-7 text-sm font-bold text-brand-dark transition hover:bg-brand-soft"
          >
            Join Free Pilot
          </Link>
        </div>
      </section>

      <section className="mx-auto grid max-w-5xl gap-4 px-4 pb-14 sm:grid-cols-3 sm:px-6">
        <Feature
          title="Real-time farm monitoring"
          detail="Satellite and weather signals tracked automatically for every field."
        />
        <Feature
          title="Gemini farm investigations"
          detail="AI-powered analysis that explains what's happening and what to do about it."
        />
        <Feature
          title="Early risk alerts"
          detail="Get notified before an outbreak or weather event becomes a loss."
        />
      </section>
    </main>
  );
}

function Feature({ title, detail }: { title: string; detail: string }) {
  return (
    <article className="rounded-2xl border border-brand/10 bg-white p-5 text-left shadow-sm">
      <h2 className="text-sm font-bold text-brand-dark">{title}</h2>
      <p className="mt-2 text-xs leading-5 text-muted">{detail}</p>
    </article>
  );
}

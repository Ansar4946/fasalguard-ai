"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { useOnboarding } from "@/features/onboarding/onboarding-provider";

export function OnboardingComplete() {
  const router = useRouter();
  const { data, complete, hydrated } = useOnboarding();
  const [inviteStatus, setInviteStatus] = useState("");

  useEffect(() => {
    if (hydrated && !data.completed) complete();
  }, [complete, data.completed, hydrated]);

  const farmName = data.farm.farmName.trim() || "Green Valley Farm";
  const fieldName = data.field.fieldName.trim() || "North Field";

  function continueTo(path: "/onboarding/farm" | "/dashboard") {
    complete();
    router.push(path);
  }

  async function invite() {
    const invitation = `${window.location.origin}/onboarding/personal?invite=farm-team`;
    await navigator.clipboard?.writeText(invitation);
    setInviteStatus("Invitation link copied");
    window.setTimeout(() => setInviteStatus(""), 2500);
  }

  return (
    <main className="relative flex min-h-svh items-start justify-center overflow-x-clip bg-[#f8f4ea] px-3 py-7 min-[400px]:px-4 sm:px-6 sm:py-10 lg:items-center [@media(max-height:760px)]:items-start [@media(max-height:760px)]:py-5">
      <div
        aria-hidden="true"
        className="absolute -left-24 -top-24 size-72 rounded-full bg-white/60 blur-3xl"
      />
      <div className="relative w-full max-w-3xl">
        <section className="relative mx-auto max-w-2xl">
          <div className="relative h-48 overflow-hidden rounded-2xl bg-brand-dark shadow-[0_18px_50px_rgba(0,50,31,.20)] min-[400px]:h-56 sm:h-72">
            <div
              className="absolute inset-0 bg-cover bg-center"
              style={{ backgroundImage: "url('/login-field-hero.png')" }}
            />
            <div className="absolute inset-0 bg-[linear-gradient(180deg,rgba(0,40,27,.32),transparent_48%,rgba(0,40,27,.32))]" />
            <div className="absolute left-4 top-4 flex flex-wrap gap-2">
              <OverlayChip>{farmName} · Draft ready</OverlayChip>
              <OverlayChip>{fieldName} · Awaiting boundary</OverlayChip>
            </div>
            <Marker
              className="left-[54%] top-[38%]"
              label="Draft field"
              compact
            />
          </div>
          <div className="absolute -bottom-5 left-1/2 flex -translate-x-1/2 items-center gap-2 whitespace-nowrap rounded-xl border border-brand/10 bg-brand-soft px-3 py-2.5 text-[8px] font-bold uppercase tracking-[.09em] text-brand-dark shadow-lg min-[400px]:px-5 min-[400px]:py-3 min-[400px]:text-[10px] min-[400px]:tracking-[.12em]">
            <span className="grid size-5 place-items-center rounded-full bg-white text-success">
              ✓
            </span>
            Setup draft complete
          </div>
        </section>

        <section className="mt-10 text-center" aria-live="polite">
          <h1 className="text-xl font-bold tracking-tight text-brand-dark sm:text-2xl">
            Your setup draft is ready.
          </h1>
          <p className="mx-auto mt-2 max-w-xl text-xs leading-5 text-muted">
            Your setup draft is ready for review. Register or sign in and map an
            accurate field boundary before monitoring can begin.
          </p>

          <div className="mx-auto mt-6 grid max-w-2xl gap-3 text-left sm:grid-cols-2">
            <button
              type="button"
              onClick={() => continueTo("/onboarding/farm")}
              className="group relative min-h-36 overflow-hidden rounded-2xl bg-brand p-5 text-left text-white shadow-lg shadow-green-900/15 transition hover:-translate-y-1 hover:bg-brand-dark"
            >
              <span className="grid size-9 place-items-center rounded-xl bg-white/12">
                <ActionIcon kind="scan" />
              </span>
              <span className="mt-4 block text-sm font-bold">
                Review Farm Details
              </span>
              <span className="mt-1 block text-[10px] leading-4 text-white/70">
                Confirm the farm information before creating the database
                record.
              </span>
              <span className="absolute right-5 top-1/2 text-lg opacity-0 transition group-hover:translate-x-1 group-hover:opacity-100">
                →
              </span>
            </button>
            <button
              type="button"
              onClick={() => continueTo("/dashboard")}
              className="group relative min-h-36 overflow-hidden rounded-2xl border border-brand/10 bg-white p-5 text-left shadow-[0_8px_26px_rgba(15,45,32,.06)] transition hover:-translate-y-1 hover:border-brand/25"
            >
              <span className="grid size-9 place-items-center rounded-xl bg-[#edf6e9] text-brand">
                <ActionIcon kind="dashboard" />
              </span>
              <span className="mt-4 block text-sm font-bold text-brand-dark">
                Go to Dashboard
              </span>
              <span className="mt-1 block text-[10px] leading-4 text-muted">
                Continue with the secure session created during onboarding.
              </span>
              <span className="absolute right-5 top-1/2 text-lg text-brand opacity-0 transition group-hover:translate-x-1 group-hover:opacity-100">
                →
              </span>
            </button>
          </div>

          <div className="mx-auto mt-6 flex max-w-2xl flex-col items-center justify-center gap-3 border-t border-brand/10 pt-5 sm:flex-row sm:gap-5">
            <button
              onClick={() => void invite()}
              className="inline-flex min-h-9 items-center gap-2 rounded-lg px-3 text-[10px] font-bold text-brand hover:bg-white"
            >
              <span aria-hidden="true">♧</span>
              {inviteStatus || "Invite team members"}
            </button>
            <span className="hidden text-border sm:block">•</span>
            <span className="rounded-full border border-amber-200 bg-[#fff7dd] px-3 py-1.5 text-[9px] font-bold text-amber-800">
              Enterprise-grade security active
            </span>
          </div>
        </section>
      </div>
    </main>
  );
}

function OverlayChip({ children }: { children: React.ReactNode }) {
  return (
    <span className="rounded-md border border-white/15 bg-brand-dark/60 px-2 py-1 text-[8px] font-semibold text-white backdrop-blur">
      {children}
    </span>
  );
}
function Marker({
  className,
  label,
  compact,
}: {
  className: string;
  label: string;
  compact?: boolean;
}) {
  return (
    <span
      className={`absolute ${className} flex items-center gap-1.5 rounded-md border border-white/25 bg-brand-dark/55 px-2 py-1 text-[8px] font-semibold text-white shadow backdrop-blur`}
    >
      <i className="size-1.5 rounded-full bg-lime-300" />
      {compact ? "Synced" : label}
    </span>
  );
}
function ActionIcon({ kind }: { kind: "scan" | "dashboard" }) {
  return (
    <svg
      aria-hidden="true"
      viewBox="0 0 24 24"
      className="size-5"
      fill="none"
      stroke="currentColor"
      strokeWidth="1.8"
      strokeLinecap="round"
      strokeLinejoin="round"
    >
      {kind === "scan" ? (
        <>
          <path d="M4 8V4h4M16 4h4v4M20 16v4h-4M8 20H4v-4" />
          <path d="M8 12h8M12 8v8" />
        </>
      ) : (
        <>
          <rect x="3" y="3" width="7" height="7" rx="1" />
          <rect x="14" y="3" width="7" height="7" rx="1" />
          <rect x="3" y="14" width="7" height="7" rx="1" />
          <rect x="14" y="14" width="7" height="7" rx="1" />
        </>
      )}
    </svg>
  );
}

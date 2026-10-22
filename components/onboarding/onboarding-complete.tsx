"use client";

import Link from "next/link";
import { useOnboarding } from "@/features/onboarding/onboarding-provider";
import { BrandLogo } from "@/components/brand/brand-logo";

/**
 * Account creation happens on the setup step, which then opens the dashboard directly. This page
 * is only reached by resuming a draft, so it routes the farmer to whatever is still missing.
 */
export function OnboardingComplete() {
  const { data, hydrated } = useOnboarding();
  const hasDraft = Boolean(data.personal.fullName.trim() || data.farm.farmName.trim());
  const farmName = data.farm.farmName.trim();
  const fieldName = data.field.fieldName.trim();

  return (
    <main className="onboarding-centered bg-[#f8f4ea]">
      <section className="fg-rise w-full max-w-lg rounded-2xl border border-brand/10 bg-white p-7 text-center shadow-[0_18px_50px_rgba(15,45,32,.08)]">
        <BrandLogo compact className="mx-auto size-14" />
        {!hydrated ? (
          <p className="mt-5 text-sm text-muted" role="status">Restoring your progress…</p>
        ) : hasDraft ? (
          <>
            <h1 className="mt-5 text-xl font-extrabold text-brand-dark">Almost there</h1>
            <p className="mt-2 text-xs leading-5 text-muted">
              {farmName ? `${farmName}${fieldName ? ` · ${fieldName}` : ""} is saved on this device.` : "Your details are saved on this device."}{" "}
              Finish the last step to create your account and start monitoring.
            </p>
            <Link href="/onboarding/setup" className="mt-6 inline-flex min-h-11 items-center justify-center rounded-full bg-brand px-7 text-xs font-extrabold text-white transition active:scale-95">
              Finish setup →
            </Link>
          </>
        ) : (
          <>
            <h1 className="mt-5 text-xl font-extrabold text-brand-dark">You&apos;re all set</h1>
            <p className="mt-2 text-xs leading-5 text-muted">Your farm workspace is ready.</p>
            <Link href="/dashboard" className="mt-6 inline-flex min-h-11 items-center justify-center rounded-full bg-brand px-7 text-xs font-extrabold text-white transition active:scale-95">
              Go to dashboard →
            </Link>
          </>
        )}
      </section>
    </main>
  );
}

"use client";

import { useEffect } from "react";
import { useRouter } from "next/navigation";
import { useOnboarding } from "@/features/onboarding/onboarding-provider";
import { BrandLogo } from "@/components/brand/brand-logo";

function resumePath(data: ReturnType<typeof useOnboarding>["data"]) {
  if (!data.personal.fullName.trim() || !data.personal.phone.trim())
    return "/onboarding/personal";
  if (
    !data.farm.experienceYears ||
    !data.farm.farmName.trim() ||
    !data.farm.farmSizeAcres.trim()
  )
    return "/onboarding/farm";
  if (
    !data.field.fieldName.trim() ||
    !data.field.fieldSizeAcres.trim() ||
    !data.field.cropType
  )
    return "/onboarding/setup";
  return "/onboarding/complete";
}

export function OnboardingGate({ children }: { children: React.ReactNode }) {
  const router = useRouter();
  const { data, hydrated } = useOnboarding();

  useEffect(() => {
    if (hydrated && !data.completed) router.replace(resumePath(data));
  }, [data, hydrated, router]);

  if (!hydrated || !data.completed)
    return (
      <main className="grid min-h-dvh place-items-center bg-[#f8f4ea] p-6">
        <div className="text-center" role="status" aria-live="polite">
          <BrandLogo
            compact
            priority
            className="mx-auto size-16 animate-pulse drop-shadow-lg"
          />
          <p className="mt-4 text-sm font-bold text-brand-dark">
            Preparing your farm workspace…
          </p>
          <p className="mt-1 text-xs text-muted">
            Restoring your saved onboarding progress.
          </p>
        </div>
      </main>
    );
  return children;
}

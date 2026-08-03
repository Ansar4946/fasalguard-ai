"use client";

import { useEffect } from "react";
import { useRouter } from "next/navigation";
import { useOnboarding } from "@/features/onboarding/onboarding-provider";

export default function Home() {
  const router = useRouter();
  const { data, hydrated } = useOnboarding();
  useEffect(() => {
    if (hydrated) router.replace(data.completed ? "/dashboard" : "/onboarding/personal");
  }, [data.completed, hydrated, router]);
  return <main className="grid min-h-dvh place-items-center bg-[#f8f4ea]"><div className="text-center"><span className="mx-auto grid size-14 animate-pulse place-items-center rounded-2xl bg-brand text-sm font-extrabold text-white">FG</span><p className="mt-4 text-sm font-bold text-brand-dark">Opening FasalGuard AI…</p></div></main>;
}

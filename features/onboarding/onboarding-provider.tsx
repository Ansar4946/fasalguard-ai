"use client";
import { createContext, useContext, useEffect, useMemo, useState } from "react";
import type { OnboardingData, OnboardingSection } from "./types";
export const initialOnboardingData: OnboardingData = {
  personal: { fullName: "", phone: "", email: "", language: "English" },
  farm: {
    experienceYears: "",
    province: "Punjab",
    district: "Multan",
    crops: [],
    farmName: "",
    farmSizeAcres: "",
  },
  field: {
    fieldName: "",
    fieldSizeAcres: "",
    cropType: "",
    boundaryPoints: [],
  },
  preferences: {
    anonymousContribution: true,
    nearbyAlerts: true,
    weatherAlerts: true,
    taskReminders: false,
  },
  referral: { code: "", source: "DIRECT" },
  completed: false,
};
type Value = {
  data: OnboardingData;
  updateSection: <K extends OnboardingSection>(
    section: K,
    patch: Partial<OnboardingData[K]>,
  ) => void;
  complete: () => void;
  reset: () => void;
  hydrated: boolean;
};
const Context = createContext<Value | null>(null);
const key = "fasalguard.onboarding.v1";
export function OnboardingProvider({
  children,
}: {
  children: React.ReactNode;
}) {
  const [data, setData] = useState(initialOnboardingData);
  const [hydrated, setHydrated] = useState(false);
  useEffect(() => {
    let active = true;
    queueMicrotask(() => {
      if (!active) return;
      try {
        const saved = localStorage.getItem(key);
        if (saved) {
          const parsed = JSON.parse(saved) as Partial<OnboardingData>;
          setData({
            ...initialOnboardingData,
            ...parsed,
            personal: { ...initialOnboardingData.personal, ...parsed.personal },
            farm: { ...initialOnboardingData.farm, ...parsed.farm },
            field: { ...initialOnboardingData.field, ...parsed.field },
            preferences: { ...initialOnboardingData.preferences, ...parsed.preferences },
            referral: { ...initialOnboardingData.referral, ...parsed.referral },
          });
        }
      } catch {}
      setHydrated(true);
    });
    return () => {
      active = false;
    };
  }, []);
  useEffect(() => {
    if (!hydrated) return;
    try {
      localStorage.setItem(key, JSON.stringify(data));
    } catch {}
  }, [data, hydrated]);
  const value = useMemo<Value>(
    () => ({
      data,
      updateSection: (section, patch) =>
        setData((current) => ({
          ...current,
          [section]: { ...current[section], ...patch },
        })),
      complete: () => setData((current) => ({ ...current, completed: true })),
      reset: () => setData(initialOnboardingData),
      hydrated,
    }),
    [data, hydrated],
  );
  return <Context.Provider value={value}>{children}</Context.Provider>;
}
export function useOnboarding() {
  const value = useContext(Context);
  if (!value)
    throw new Error("useOnboarding must be used within OnboardingProvider");
  return value;
}

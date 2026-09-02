"use client";

import { createContext, useContext, useEffect, useMemo, useState } from "react";
import type { ScanSession } from "./types";

const initialScanSession: ScanSession = {
  farmId: null,
  fieldId: null,
  backendScanId: null,
  images: [],
  step: "field",
  progress: 0,
  updatedAt: new Date(0).toISOString(),
};

type ScanContextValue = {
  session: ScanSession;
  updateSession: (patch: Partial<ScanSession>) => void;
  resetSession: () => void;
  hydrated: boolean;
};

const ScanContext = createContext<ScanContextValue | null>(null);
const storageKey = "fasalguard.scan-session.v1";

export function ScanSessionProvider({ children }: { children: React.ReactNode }) {
  const [session, setSession] = useState(initialScanSession);
  const [hydrated, setHydrated] = useState(false);

  useEffect(() => {
    let active = true;
    queueMicrotask(() => {
      if (!active) return;
      try {
        const saved = window.localStorage.getItem(storageKey);
        if (saved) setSession(JSON.parse(saved) as ScanSession);
      } catch { /* Continue with a fresh scan when local storage is unavailable. */ }
      setHydrated(true);
    });
    return () => { active = false; };
  }, []);

  useEffect(() => {
    if (!hydrated) return;
    try { window.localStorage.setItem(storageKey, JSON.stringify(session)); } catch { /* Offline draft remains in memory. */ }
  }, [session, hydrated]);

  const value = useMemo<ScanContextValue>(() => ({
    session,
    updateSession: (patch) => setSession((current) => ({ ...current, ...patch, updatedAt: new Date().toISOString() })),
    resetSession: () => setSession(initialScanSession),
    hydrated,
  }), [session, hydrated]);

  return <ScanContext.Provider value={value}>{children}</ScanContext.Provider>;
}

export function useScanSession() {
  const context = useContext(ScanContext);
  if (!context) throw new Error("useScanSession must be used within ScanSessionProvider");
  return context;
}

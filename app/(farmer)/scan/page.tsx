"use client";

import { useRouter } from "next/navigation";
import { useEffect } from "react";
import { FieldSelection } from "@/components/scan/field-selection";
import { ScanStepper } from "@/components/scan/scan-stepper";
import { useScanSession } from "@/features/diagnosis/scan-session-provider";
import type { ScanStep } from "@/features/diagnosis/types";

const resumeRoute: Partial<Record<ScanStep, string>> = {
  capture: "/scan/upload",
  symptoms: "/scan/symptoms",
  analysis: "/scan/analysis",
};

export default function SelectScanFieldPage() {
  const router = useRouter();
  const { session, updateSession, resetSession, hydrated } = useScanSession();

  // A finished scan is history, not a draft: opening the scan entry point starts a new one.
  useEffect(() => {
    if (hydrated && session.step === "results") resetSession();
  }, [hydrated, session.step, resetSession]);

  const draftInProgress = hydrated && session.step !== "results" && (session.images.length > 0 || Boolean(session.backendScanId));
  const resumeHref = resumeRoute[session.step];

  function selectField({ farmId, fieldId }: { farmId: string; fieldId: string }) {
    if (fieldId === session.fieldId) return;
    // A backend scan is bound to its field; switching fields must not reuse it or its photos.
    updateSession(
      session.backendScanId || session.images.length
        ? { farmId, fieldId, backendScanId: null, images: [], observations: {}, step: "field", progress: 20 }
        : { farmId, fieldId, step: "field", progress: 20 },
    );
  }

  return (
    <div className="min-h-[calc(100dvh-4rem)] bg-[#eff8ec]">
      <main className="mx-auto max-w-[1180px] p-4 pb-24 md:p-6 md:pb-24 xl:p-7">
        <ScanStepper current="field" />
        <header className="fg-rise mt-5">
          <h1 className="text-[27px] font-extrabold leading-tight">Scan Your Crop</h1>
          <p className="mt-1 max-w-3xl text-xs leading-5 text-muted">
            Choose the field, add clear photos and answer three quick questions. It takes about two minutes.
          </p>
        </header>
        {draftInProgress && resumeHref && (
          <div role="status" className="fg-rise mt-4 flex flex-col gap-3 rounded-2xl border border-brand/20 bg-white p-4 sm:flex-row sm:items-center sm:justify-between">
            <div>
              <p className="text-sm font-extrabold text-brand-dark">You have a scan in progress</p>
              <p className="text-[11px] text-muted">
                {session.images.length} photo{session.images.length === 1 ? "" : "s"} saved. Pick up where you left off, or start over.
              </p>
            </div>
            <div className="flex gap-2">
              <button type="button" onClick={resetSession} className="min-h-10 rounded-full border border-border px-4 text-xs font-bold">
                Start over
              </button>
              <button type="button" onClick={() => router.push(resumeHref)} className="min-h-10 rounded-full bg-brand px-5 text-xs font-extrabold text-white">
                Continue scan →
              </button>
            </div>
          </div>
        )}
        <div className="mt-5">
          {hydrated ? (
            <FieldSelection selectedFieldId={session.fieldId} onSelect={selectField} />
          ) : (
            <div className="h-72 animate-pulse rounded-2xl bg-white" />
          )}
        </div>
        <footer className="fixed bottom-0 left-0 right-0 z-10 border-t border-brand/10 bg-white/95 px-4 py-3 backdrop-blur lg:left-64">
          <div className="mx-auto flex max-w-[1120px] items-center justify-end gap-6">
            <p className="hidden text-[10px] text-muted sm:block">Your progress is saved automatically on this device.</p>
            <button
              type="button"
              disabled={!hydrated || !session.fieldId}
              onClick={() => {
                updateSession({ step: "capture", progress: 40 });
                router.push("/scan/upload");
              }}
              className="min-h-11 rounded-full bg-brand px-8 text-xs font-extrabold text-white transition active:scale-95 disabled:bg-border disabled:text-muted"
            >
              Continue to Photos →
            </button>
          </div>
        </footer>
      </main>
    </div>
  );
}

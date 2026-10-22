"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import {
  AnalysisStatus,
  type AnalysisStage,
} from "@/components/scan/analysis-status";
import { ScanStepper } from "@/components/scan/scan-stepper";
import { useScanSession } from "@/features/diagnosis/scan-session-provider";
import type { CropScan } from "@/features/diagnosis/types";

const terminalStatuses = new Set([
  "DIAGNOSED",
  "NEEDS_FOLLOW_UP",
  "EXPERT_REVIEW",
  "VERIFIED",
  "RESOLVED",
]);

interface PollHandles {
  isCurrent: (token: number) => boolean;
  attempts: { count: number };
  setScan: (scan: CropScan) => void;
  setStatus: (status: "processing" | "offline" | "failed" | "complete") => void;
  setError: (message: string) => void;
}

/** Plain recursive helper (not a hook) — avoids the self-referencing useCallback closure
 * problem entirely, since it isn't one. */
async function poll(
  scanId: string,
  token: number,
  handles: PollHandles,
): Promise<void> {
  const res = await fetch(`/api/crop-scans/${scanId}`, { cache: "no-store" });
  if (!handles.isCurrent(token)) return;
  if (!res.ok) {
    handles.setError("Could not check the scan status.");
    handles.setStatus("failed");
    return;
  }
  const body = (await res.json()) as CropScan;
  if (!handles.isCurrent(token)) return;
  handles.setScan(body);
  if (terminalStatuses.has(body.status)) {
    handles.setStatus("complete");
    return;
  }
  handles.attempts.count += 1;
  if (handles.attempts.count > 90) {
    handles.setError("This scan is taking longer than expected.");
    handles.setStatus("failed");
    return;
  }
  window.setTimeout(() => void poll(scanId, token, handles), 2000);
}

export default function AnalysisPage() {
  const router = useRouter();
  const { session, hydrated, updateSession } = useScanSession();
  const [scan, setScan] = useState<CropScan | null>(null);
  const [status, setStatus] = useState<
    "processing" | "offline" | "failed" | "complete"
  >("processing");
  const [error, setError] = useState<string>();
  const runId = useRef(0);
  const started = useRef(false);
  const pollAttempts = useRef({ count: 0 });

  const runAnalysis = useCallback(async (force = false): Promise<void> => {
    const current = ++runId.current;
    setError(undefined);
    pollAttempts.current = { count: 0 };
    if (!session.backendScanId) {
      setError("No scan was started — go back and add a photo first.");
      setStatus("failed");
      return;
    }
    if (!navigator.onLine) {
      setStatus("offline");
      return;
    }
    setStatus("processing");
    // Revisiting this page (back button, reload, reconnect) must not queue another analysis:
    // only start one when the scan has not been analysed or is being retried after follow-up.
    const existing = await fetch(`/api/crop-scans/${session.backendScanId}`, { cache: "no-store" })
      .then((r) => (r.ok ? (r.json() as Promise<CropScan>) : null))
      .catch(() => null);
    if (current !== runId.current) return;
    if (existing) setScan(existing);
    const alreadyRunning = existing && (existing.status === "ANALYSING" || existing.status === "IMAGE_VALIDATION");
    const alreadyDone = existing && terminalStatuses.has(existing.status) && (!force || existing.status !== "NEEDS_FOLLOW_UP");
    if (alreadyRunning || alreadyDone) {
      await poll(session.backendScanId, current, {
        isCurrent: (token) => token === runId.current,
        attempts: pollAttempts.current,
        setScan,
        setStatus,
        setError,
      });
      return;
    }
    const res = await fetch(
      `/api/crop-scans/${session.backendScanId}/analyse`,
      { method: "POST" },
    );
    if (current !== runId.current) return;
    if (!res.ok) {
      const body = (await res.json().catch(() => ({}))) as {
        error?: { message?: string };
      };
      setError(body.error?.message ?? "The screening service did not respond.");
      setStatus("failed");
      return;
    }
    await poll(session.backendScanId, current, {
      isCurrent: (token) => token === runId.current,
      attempts: pollAttempts.current,
      setScan,
      setStatus,
      setError,
    });
  }, [session.backendScanId]);

  useEffect(() => {
    if (!hydrated || started.current) return;
    started.current = true;
    void runAnalysis(false);
  }, [hydrated, runAnalysis]);

  useEffect(() => {
    const offline = () => {
      runId.current += 1;
      setStatus("offline");
    };
    const online = () => void runAnalysis(false);
    window.addEventListener("offline", offline);
    window.addEventListener("online", online);
    return () => {
      window.removeEventListener("offline", offline);
      window.removeEventListener("online", online);
    };
  }, [runAnalysis]);

  const stages = useMemo<AnalysisStage[]>(() => {
    const s = scan?.status;
    const validationDone = s
      ? s !== "CREATED" && s !== "UPLOADING" && s !== "IMAGE_VALIDATION"
      : false;
    const analysisDone = s ? terminalStatuses.has(s) : false;
    return [
      {
        id: "validation",
        title: "Checking image quality",
        detail: "Real resolution, focus and content checks on your photos.",
        status: validationDone ? "complete" : "active",
      },
      {
        id: "analysing",
        title: "Running AI analysis",
        detail:
          "The vision model screens your images against known crop conditions.",
        status: analysisDone
          ? "complete"
          : validationDone
            ? "active"
            : "pending",
      },
    ];
  }, [scan?.status]);
  const progress =
    scan?.status === "ANALYSING"
      ? 70
      : scan?.status && terminalStatuses.has(scan.status)
        ? 100
        : 30;
  const needsFollowUp =
    status === "complete" && scan?.status === "NEEDS_FOLLOW_UP";
  const readyForResults = status === "complete" && !needsFollowUp;
  const leaf =
    session.images.find((image) => image.id === "leaf-closeup") ?? session.images[0];

  // Advance on its own once screening finishes — the farmer shouldn't have to hunt for a button.
  useEffect(() => {
    if (!readyForResults) return;
    updateSession({ step: "results", progress: 100 });
    const timer = window.setTimeout(() => router.push("/scan/results"), 1200);
    return () => window.clearTimeout(timer);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [readyForResults]);
  const qualityFailure = Boolean(
    scan?.failureCode &&
    /TOO_DARK|OVEREXPOSED|BLURRY|IMAGE_DIMENSIONS|CORRUPT|IMAGE_QUALITY/.test(
      scan.failureCode,
    ),
  );

  return (
    <div className="min-h-[calc(100dvh-4rem)] bg-[#fff9df]">
      <main className="mx-auto max-w-[1120px] p-4 md:p-6 xl:p-7">
        <header className="flex items-start justify-between">
          <div>
            <h1 className="text-[27px] font-extrabold text-brand-dark">
              Scan Your Crop
            </h1>
            <p className="mt-1 text-xs text-muted">
              Leveraging real AI screening to identify your crop-health issue.
            </p>
          </div>
          <span className="rounded-full border border-info/20 bg-blue-50 px-3 py-1 text-[9px] font-bold uppercase text-info">
            AI Processing
          </span>
        </header>
        <div className="mt-4">
          <ScanStepper current="analysis" />
        </div>
        <div className="mt-5 grid items-start gap-4 lg:grid-cols-[minmax(0,1.35fr)_minmax(280px,.9fr)]">
          <AnalysisStatus
            stages={stages}
            progress={progress}
            status={status}
            error={error}
            onRetry={() => {
              if (!session.backendScanId) {
                router.push("/scan/upload");
                return;
              }
              void runAnalysis(true);
            }}
          />
          <aside className="space-y-3">
            <section className="relative grid min-h-[310px] place-items-center overflow-hidden rounded-2xl bg-brand-dark p-6 text-center text-white shadow-sm">
              <div className="absolute inset-0 opacity-10 [background-image:radial-gradient(circle_at_center,white_1px,transparent_1px)] [background-size:18px_18px]" />
              <div className="relative">
                <div className="relative mx-auto size-36 overflow-hidden rounded-2xl border border-white/25 bg-black/20">
                  {leaf?.previewUrl ? (
                    // eslint-disable-next-line @next/next/no-img-element -- local data-URL thumbnail
                    <img src={leaf.previewUrl} alt="Leaf photo being analysed" className="size-full object-cover" />
                  ) : (
                    <span className="grid size-full place-items-center text-4xl">◉</span>
                  )}
                  {status === "processing" && <span className="fg-scan-line" aria-hidden="true" />}
                  {readyForResults && (
                    <span className="fg-pop absolute inset-0 grid place-items-center bg-brand/70 text-4xl font-extrabold">✓</span>
                  )}
                </div>
                <p className="mt-5 text-[10px] font-extrabold uppercase tracking-[.2em] text-white/75">
                  {readyForResults ? "Screening complete" : status === "processing" ? "AI screening in progress" : "Screening paused"}
                </p>
                <p className="mt-2 text-[11px] text-brand-soft" aria-live="polite">
                  {readyForResults ? "Opening your results…" : friendlyStatus(scan?.status)}
                </p>
              </div>
              <div className="absolute bottom-4 left-4 right-4 rounded-xl border border-white/10 bg-black/30 p-3">
                <div className="flex justify-between text-[8px] text-white/60">
                  <span>Analysis progress</span>
                  <span>{progress}%</span>
                </div>
                <div className="mt-2 h-2 rounded-full bg-white/15">
                  <div
                    className="h-2 rounded-full bg-brand-soft transition-all"
                    style={{ width: `${progress}%` }}
                  />
                </div>
              </div>
            </section>
            <section className="rounded-2xl bg-[#9b6300] p-5 text-white">
              <div className="flex gap-3">
                <span className="text-xl">◉</span>
                <div>
                  <h2 className="text-sm font-extrabold">Safety Disclaimer</h2>
                  <p className="mt-1 text-[9px] leading-4 text-white/80">
                    FasalGuard provides early screening support. Results should
                    be verified by an agriculture expert for severe cases. AI
                    recommendations do not replace complete environmental or
                    laboratory assessment.
                  </p>
                </div>
              </div>
            </section>
          </aside>
        </div>
        {needsFollowUp && (
          <div
            role="alert"
            className="mt-5 rounded-2xl border border-warning bg-amber-50 p-5"
          >
            <h2 className="font-extrabold">
              {qualityFailure
                ? "Better photos needed"
                : "Screening is temporarily unavailable"}
            </h2>
            <p className="mt-1 text-xs text-muted">
              {qualityFailure
                ? "The image-quality checks could not find enough clear visual evidence. Retake the leaf close-up in even natural light and hold the camera steady."
                : "Your images are saved safely, but the configured vision model could not complete this screening. Retrying later will not require another upload."}
            </p>
            {qualityFailure ? (
              <Link
                href="/scan/upload"
                className="mt-4 inline-flex min-h-10 items-center rounded-xl bg-brand px-5 text-xs font-bold text-white"
              >
                Retake photos
              </Link>
            ) : (
              <button
                type="button"
                onClick={() => void runAnalysis(true)}
                className="mt-4 inline-flex min-h-10 items-center rounded-xl bg-brand px-5 text-xs font-bold text-white"
              >
                Retry screening
              </button>
            )}
          </div>
        )}
        <footer className="mt-5 flex items-center justify-between border-t border-brand/10 pt-4">
          <Link
            href="/scan/upload"
            className="inline-flex min-h-10 items-center rounded-full border border-brand px-5 text-xs font-bold text-brand"
          >
            ← Back
          </Link>
          <p className="hidden text-[9px] italic text-muted sm:block">
            Real AI screening — completes as soon as the model responds.
          </p>
          <button
            disabled={!readyForResults}
            onClick={() => router.push("/scan/results")}
            className="min-h-10 rounded-full bg-brand px-6 text-xs font-bold text-white disabled:bg-border disabled:text-muted"
          >
            Continue →
          </button>
        </footer>
      </main>
    </div>
  );
}

function friendlyStatus(status: CropScan["status"] | undefined): string {
  switch (status) {
    case undefined:
    case "CREATED":
    case "UPLOADING":
      return "Sending your photos…";
    case "IMAGE_VALIDATION":
      return "Checking the photos are clear enough…";
    case "ANALYSING":
      return "Comparing your leaf with known crop conditions…";
    case "NEEDS_FOLLOW_UP":
      return "We need a little more from you";
    default:
      return "Finishing up…";
  }
}

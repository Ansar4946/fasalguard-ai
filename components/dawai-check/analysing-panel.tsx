"use client";

import { Spinner, GlyphIcon, type T } from "./parts";

export type AnalysisStage = "uploading" | "analysing";

/**
 * Only the upload is a measurable step. Once the file is on the server the label is read, matched
 * and risk-checked in one request, so those three are shown as "in progress" together. No fake progress.
 */
export function AnalysingPanel({ t, stage, withUpload }: { t: T; stage: AnalysisStage; withUpload: boolean }) {
  const steps: Array<{ key: string; state: "done" | "working" | "waiting" }> = [];
  if (withUpload) steps.push({ key: "stageUploading", state: stage === "uploading" ? "working" : "done" });
  const analysing = stage === "analysing" ? "working" : "waiting";
  steps.push(
    { key: "stageReading", state: analysing },
    { key: "stageMatching", state: analysing },
    { key: "stageChecking", state: analysing },
  );
  const current = steps.find((s) => s.state === "working");

  return (
    <section aria-labelledby="dc-analysing-title" aria-busy="true" className="space-y-4">
      <div>
        <h2 id="dc-analysing-title" className="text-lg font-extrabold text-brand-dark">
          {t("analysingTitle")}
        </h2>
        <p className="mt-1 text-sm text-muted">{t("analysingNote")}</p>
      </div>
      <p role="status" aria-live="polite" className="sr-only">
        {current ? t(current.key) : ""}
      </p>
      <ol className="card divide-y divide-border">
        {steps.map((step) => (
          <li key={step.key} className="flex min-h-14 items-center gap-3 px-4 py-3">
            <span
              className={`grid size-8 shrink-0 place-items-center rounded-full ${
                step.state === "done" ? "bg-success text-white" : step.state === "working" ? "bg-brand-soft text-brand" : "bg-surface-soft text-muted"
              }`}
            >
              {step.state === "done" ? <GlyphIcon kind="check" className="size-4" /> : step.state === "working" ? <Spinner className="size-4" /> : <GlyphIcon kind="minus" className="size-4" />}
            </span>
            <span className="min-w-0 flex-1 text-sm font-bold">{t(step.key)}</span>
            <span className="text-xs font-semibold text-muted">
              {t(step.state === "done" ? "stageDone" : step.state === "working" ? "stageWorking" : "stageWaiting")}
            </span>
          </li>
        ))}
      </ol>
      <div aria-hidden="true" className="card space-y-3 p-4">
        <div className="h-5 w-2/3 animate-pulse rounded bg-surface-soft motion-reduce:animate-none" />
        <div className="h-4 w-full animate-pulse rounded bg-surface-soft motion-reduce:animate-none" />
        <div className="h-4 w-5/6 animate-pulse rounded bg-surface-soft motion-reduce:animate-none" />
      </div>
    </section>
  );
}

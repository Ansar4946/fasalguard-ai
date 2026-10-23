/* eslint-disable @next/next/no-img-element -- object-URL previews are local-only. */
"use client";

import type { CSSProperties } from "react";
import { Emblem, GlyphIcon, type T } from "./parts";

export type AnalysisStage = "uploading" | "analysing";

type StepState = "done" | "working" | "waiting";

function StepMark({ state, index }: { state: StepState; index: number }) {
  if (state === "done") {
    return (
      <span className="dc-pop grid size-8 shrink-0 place-items-center rounded-full bg-success text-white">
        <svg viewBox="0 0 24 24" className="size-4" fill="none" stroke="currentColor" strokeWidth="3" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
          <path d="m5 12.5 4.5 4.5L19 7.5" className="dc-check-path" style={{ "--dc-len": 22 } as CSSProperties} />
        </svg>
      </span>
    );
  }
  if (state === "working") {
    return (
      <span className="relative grid size-8 shrink-0 place-items-center rounded-full bg-brand-soft text-brand">
        <span
          aria-hidden="true"
          className="dc-dot size-2.5 rounded-full bg-brand"
          style={{ "--dc-i": index } as CSSProperties}
        />
        <span aria-hidden="true" className="absolute inset-0 animate-spin rounded-full border-2 border-brand/25 border-t-brand motion-reduce:animate-none" />
      </span>
    );
  }
  return (
    <span className="grid size-8 shrink-0 place-items-center rounded-full bg-surface-soft text-muted">
      <GlyphIcon kind="minus" className="size-4" />
    </span>
  );
}

/**
 * Only the upload is a measurable step. Once the file is on the server the label is read, matched
 * and risk-checked in one request, so those three are shown as "in progress" together. No fake progress.
 */
export function AnalysingPanel({
  t,
  stage,
  withUpload,
  photoUrl,
  subject,
}: {
  t: T;
  stage: AnalysisStage;
  withUpload: boolean;
  photoUrl?: string;
  subject?: string;
}) {
  const steps: Array<{ key: string; state: StepState }> = [];
  if (withUpload) steps.push({ key: "stageUploading", state: stage === "uploading" ? "working" : "done" });
  const analysing: StepState = stage === "analysing" ? "working" : "waiting";
  steps.push({ key: "stageReading", state: analysing }, { key: "stageMatching", state: analysing }, { key: "stageChecking", state: analysing });
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

      <div className="relative isolate flex min-h-52 items-center justify-center overflow-hidden rounded-2xl border border-border bg-[#0b2a1d] shadow-md">
        {photoUrl ? (
          <>
            <img src={photoUrl} alt="" aria-hidden="true" className="absolute inset-0 size-full scale-110 object-cover opacity-30 blur-xl" />
            <img src={photoUrl} alt={t("previewAlt")} className="relative z-0 max-h-72 w-full object-contain p-3" />
          </>
        ) : (
          <div className="dc-float relative z-0 flex flex-col items-center gap-3 p-8 text-center">
            <Emblem className="size-16" />
            {subject && <p className="max-w-[16rem] break-words text-base font-extrabold text-white">{subject}</p>}
          </div>
        )}
        <span className="dc-bracket dc-bracket-light border-s-4 border-t-4 rounded-ss-2xl start-3 top-3" aria-hidden="true" />
        <span className="dc-bracket dc-bracket-light border-e-4 border-t-4 rounded-se-2xl end-3 top-3" aria-hidden="true" />
        <span className="dc-bracket dc-bracket-light border-s-4 border-b-4 rounded-es-2xl start-3 bottom-3" aria-hidden="true" />
        <span className="dc-bracket dc-bracket-light border-e-4 border-b-4 rounded-ee-2xl end-3 bottom-3" aria-hidden="true" />
        <span className="dc-beam dc-beam-fast" aria-hidden="true" />
        {current && (
          <p className="absolute inset-x-0 bottom-3 z-10 flex justify-center px-4" aria-hidden="true">
            <span className="rounded-full bg-black/55 px-3 py-1 text-xs font-bold text-white backdrop-blur">{t(current.key)}</span>
          </p>
        )}
      </div>

      <ol className="card divide-y divide-border">
        {steps.map((step, index) => (
          <li key={step.key} className="flex min-h-14 items-center gap-3 px-4 py-3">
            <StepMark state={step.state} index={withUpload ? index - 1 : index} />
            <span className={`min-w-0 flex-1 text-sm font-bold ${step.state === "waiting" ? "text-muted" : ""}`}>{t(step.key)}</span>
            <span className="text-xs font-semibold text-muted">
              {t(step.state === "done" ? "stageDone" : step.state === "working" ? "stageWorking" : "stageWaiting")}
            </span>
          </li>
        ))}
      </ol>

      <div aria-hidden="true" className="card space-y-3 p-4">
        <div className="dc-shimmer h-5 w-2/3 rounded" />
        <div className="dc-shimmer h-4 w-full rounded" />
        <div className="dc-shimmer h-4 w-5/6 rounded" />
      </div>
    </section>
  );
}

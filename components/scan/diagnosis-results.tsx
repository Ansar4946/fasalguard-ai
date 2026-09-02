"use client";

import Image from "next/image";
import Link from "next/link";
import { useEffect, useState } from "react";
import { useScanSession } from "@/features/diagnosis/scan-session-provider";
import type { CropScan } from "@/features/diagnosis/types";
import { ScanStepper } from "./scan-stepper";

const dispositionLabel: Record<NonNullable<CropScan["disposition"]>, string> = {
  SCREENING_COMPLETE: "Screening complete",
  EXPERT_REVIEW_RECOMMENDED: "Expert review recommended",
  BETTER_IMAGES_REQUIRED: "Better images required",
};

export function DiagnosisResults() {
  const { session, hydrated } = useScanSession();
  const [scan, setScan] = useState<CropScan | null>(null);
  const [loadError, setLoadError] = useState(false);

  useEffect(() => {
    if (!hydrated || !session.backendScanId) return;
    let active = true;
    fetch(`/api/crop-scans/${session.backendScanId}`, { cache: "no-store" })
      .then((res) =>
        res.ok
          ? (res.json() as Promise<CropScan>)
          : Promise.reject(new Error("not ok")),
      )
      .then((data) => {
        if (active) setScan(data);
      })
      .catch(() => {
        if (active) setLoadError(true);
      });
    return () => {
      active = false;
    };
  }, [hydrated, session.backendScanId]);

  if (!hydrated || (!scan && !loadError && session.backendScanId))
    return (
      <ResultState
        title="Preparing your result"
        detail="Loading the real scan evidence and AI analysis…"
      />
    );
  if (!session.backendScanId)
    return (
      <ResultState
        title="No scan found"
        detail="Start a new scan to get a real AI screening result."
        action={
          <Link
            href="/scan"
            className="rounded-xl bg-brand px-5 py-3 font-bold text-white"
          >
            Start a scan
          </Link>
        }
      />
    );
  if (loadError || !scan)
    return (
      <ResultState
        title="We could not load this result"
        detail="Your scan is safe. Retry when your connection is stable."
        action={
          <button
            className="rounded-xl bg-brand px-5 py-3 font-bold text-white"
            onClick={() => setLoadError(false)}
          >
            Try again
          </button>
        }
      />
    );
  if (!scan.screenedCondition)
    return (
      <ResultState
        title="This scan has no result yet"
        detail={`Current status: ${scan.status.replace(/_/g, " ").toLowerCase()}.`}
        action={
          <Link
            href="/scan/analysis"
            className="rounded-xl bg-brand px-5 py-3 font-bold text-white"
          >
            Back to analysis
          </Link>
        }
      />
    );

  const confidence = Math.round((scan.confidence ?? 0) * 100);
  const image =
    session.images.find((i) => i.id === "leaf-closeup") ?? session.images[0];

  return (
    <div className="mx-auto max-w-[1060px] space-y-4 px-4 py-5 md:px-6 md:py-7">
      <ScanStepper current="results" />
      <header className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
        <div>
          <h1 className="text-2xl font-extrabold text-brand-dark">
            Scan Your Crop: Results
          </h1>
          <p className="mt-1 text-xs text-muted">
            Real AI screening report{" "}
            {scan.fieldId ? `for field ${scan.fieldId}` : ""}
          </p>
        </div>
        <Link
          href="/dashboard"
          className="inline-flex min-h-10 items-center justify-center rounded-full border border-brand/15 bg-white px-5 text-xs font-extrabold text-brand"
        >
          ← Back to Dashboard
        </Link>
      </header>
      <div className="grid gap-4 lg:grid-cols-3">
        <article className="relative overflow-hidden rounded-2xl border border-brand/10 bg-white p-5 shadow-sm lg:col-span-2">
          <span className="inline-flex items-center gap-2 rounded-full border border-success/20 bg-brand-soft px-3 py-1 text-[9px] font-extrabold uppercase tracking-wide text-brand">
            <span className="size-2 rounded-full bg-success" />
            AI screening complete
          </span>
          <h2 className="mt-3 text-xl font-extrabold text-brand-dark">
            Possible Condition: {titleCase(scan.screenedCondition)}
          </h2>
          <dl className="mt-6 grid grid-cols-3 gap-3">
            <Metric label="Model score">
              <strong className="text-2xl text-brand-dark">
                {confidence}%
              </strong>
            </Metric>
            <Metric label="Disposition">
              <span className="rounded-full bg-amber-100 px-3 py-1 text-xs font-extrabold text-amber-900">
                {scan.disposition ? dispositionLabel[scan.disposition] : "—"}
              </span>
            </Metric>
            <Metric label="Result type">
              <span className="text-xs font-bold text-muted">
                {scan.isFirmDiagnosis
                  ? "Expert confirmed"
                  : "Unconfirmed screening"}
              </span>
            </Metric>
          </dl>
          {scan.alternatives.length > 0 && (
            <div className="mt-6">
              <h3 className="text-sm font-extrabold text-brand-dark">
                Other possible conditions
              </h3>
              <ul className="mt-2 space-y-1">
                {scan.alternatives.map((alt) => (
                  <li
                    key={alt.condition}
                    className="flex justify-between text-xs text-muted"
                  >
                    <span>{titleCase(alt.condition)}</span>
                    <span className="font-bold">
                      {Math.round(alt.confidence * 100)}%
                    </span>
                  </li>
                ))}
              </ul>
            </div>
          )}
          {scan.disclaimer && (
            <div className="mt-6 rounded-xl border border-amber-200 bg-amber-50 p-3 text-xs leading-5 text-amber-900">
              <strong>Important:</strong> {scan.disclaimer}
            </div>
          )}
        </article>
        <aside className="space-y-4">
          <section className="relative overflow-hidden rounded-2xl border border-brand/10 bg-[#dbe9d5] shadow-sm">
            {image?.previewUrl ? (
              <Image
                unoptimized
                width={640}
                height={480}
                src={image.previewUrl}
                alt={`Submitted crop image: ${image.name}`}
                className="aspect-[4/3] w-full object-cover"
              />
            ) : (
              <div className="grid aspect-[4/3] place-items-center bg-brand-dark px-5 text-center text-xs font-bold text-white">
                Crop scan evidence
              </div>
            )}
            <div className="absolute inset-x-0 bottom-0 bg-gradient-to-t from-brand/90 to-transparent p-4 pt-10 text-[10px] font-bold text-white">
              Scanned Image: {image?.name ?? "—"}
            </div>
          </section>
        </aside>
        <section className="rounded-2xl bg-[#00452d] p-5 text-white lg:col-span-3">
          <div className="flex flex-col gap-5 md:flex-row md:items-center md:justify-between">
            <div>
              <h2 className="text-base font-extrabold">
                Ready to take action?
              </h2>
              <p className="mt-1 text-xs text-emerald-100">
                {scan.disposition === "EXPERT_REVIEW_RECOMMENDED"
                  ? "This screening's confidence is low enough that we recommend a real expert review before acting on it."
                  : "This scan is already saved to your account. An expert can review it any time."}
              </p>
            </div>
            <Link
              href="/consultations"
              className="inline-flex min-h-12 items-center justify-center rounded-full bg-[#b9ee9e] px-7 text-xs font-extrabold text-[#245113]"
            >
              Request Expert Review
            </Link>
          </div>
        </section>
      </div>
    </div>
  );
}
function Metric({
  label,
  children,
}: {
  label: string;
  children: React.ReactNode;
}) {
  return (
    <div className="min-h-20 rounded-xl border border-brand/5 bg-[#f4f8f1] p-3">
      <dt className="mb-2 text-[8px] font-extrabold uppercase tracking-wide text-muted">
        {label}
      </dt>
      <dd>{children}</dd>
    </div>
  );
}
function ResultState({
  title,
  detail,
  action,
}: {
  title: string;
  detail: string;
  action?: React.ReactNode;
}) {
  return (
    <div className="mx-auto max-w-xl p-8">
      <section className="rounded-2xl border border-border bg-white p-8 text-center">
        <h1 className="mt-4 text-xl font-extrabold">{title}</h1>
        <p className="mt-2 text-sm text-muted">{detail}</p>
        {action && <div className="mt-5">{action}</div>}
      </section>
    </div>
  );
}
function titleCase(value: string): string {
  return value.replace(/[_-]/g, " ").replace(/\b\w/g, (c) => c.toUpperCase());
}

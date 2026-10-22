"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useEffect, useState } from "react";
import { useScanSession } from "@/features/diagnosis/scan-session-provider";
import type { CropScan, SeverityAssessment, SeverityLevel } from "@/features/diagnosis/types";
import { ScanStepper } from "./scan-stepper";

const dispositionLabel: Record<NonNullable<CropScan["disposition"]>, string> = {
  SCREENING_COMPLETE: "Screening complete",
  EXPERT_REVIEW_RECOMMENDED: "Expert review recommended",
  BETTER_IMAGES_REQUIRED: "Better images required",
};

const severityStyle: Record<SeverityLevel, { label: string; tone: string; bar: string; width: string }> = {
  LOW: { label: "Low", tone: "text-success", bar: "bg-success", width: "25%" },
  MODERATE: { label: "Moderate", tone: "text-warning", bar: "bg-warning", width: "50%" },
  HIGH: { label: "High", tone: "text-danger", bar: "bg-danger", width: "75%" },
  CRITICAL: { label: "Critical", tone: "text-danger", bar: "bg-danger", width: "100%" },
};

type Load<T> = { state: "loading" } | { state: "ready"; value: T } | { state: "error" };

/** The API returns camelCase from POST but the raw snake_case row from GET. */
function normalizeSeverity(raw: Record<string, unknown>): SeverityAssessment | null {
  const severity = raw.severity as SeverityLevel | undefined;
  if (!severity || !(severity in severityStyle)) return null;
  return {
    severity,
    calculatedScore: Number(raw.calculatedScore ?? raw.calculated_score ?? 0),
    expertEscalation: Boolean(raw.expertEscalation ?? raw.expert_escalation),
    escalationReasons: (raw.escalationReasons ?? raw.escalation_reasons ?? []) as string[],
  };
}

/** A model score is never certainty: floor it and cap at 99 so 0.995 is not shown as "100%". */
function displayPercent(score: number): number {
  return Math.min(99, Math.max(0, Math.floor(score * 100)));
}

export function DiagnosisResults({ scanId }: { scanId: string | null }) {
  const router = useRouter();
  const { session, hydrated, updateSession, resetSession } = useScanSession();
  const id = scanId ?? (hydrated ? session.backendScanId : null);
  const isCurrentScan = Boolean(id && id === session.backendScanId);
  const [scan, setScan] = useState<Load<CropScan>>({ state: "loading" });
  const [photoUrl, setPhotoUrl] = useState<string | null>(null);
  const [severity, setSeverity] = useState<Load<SeverityAssessment | null>>({ state: "loading" });
  const [attempt, setAttempt] = useState(0);

  useEffect(() => {
    if (!id) return;
    let active = true;
    fetch(`/api/crop-scans/${id}`, { cache: "no-store" })
      .then((res) => (res.ok ? (res.json() as Promise<CropScan>) : Promise.reject(new Error("not ok"))))
      .then((data) => {
        if (!active) return;
        setScan({ state: "ready", value: data });
        const leaf = data.images.find((image) => image.category === "LEAF_FRONT") ?? data.images[0];
        if (leaf)
          fetch(`/api/media/${leaf.mediaId}/access-url`, { cache: "no-store" })
            .then((res) => (res.ok ? (res.json() as Promise<{ url: string }>) : null))
            .then((body) => { if (active && body?.url) setPhotoUrl(body.url); })
            .catch(() => undefined);
      })
      .catch(() => { if (active) setScan({ state: "error" }); });
    return () => { active = false; };
  }, [id, attempt]);

  // Mark the draft finished so the next visit to /scan starts a fresh scan.
  useEffect(() => {
    if (isCurrentScan && scan.state === "ready" && scan.value.screenedCondition && session.step !== "results")
      updateSession({ step: "results", progress: 100 });
  }, [isCurrentScan, scan, session.step, updateSession]);

  const screened = scan.state === "ready" && Boolean(scan.value.screenedCondition);
  useEffect(() => {
    if (!id || !screened) return;
    let active = true;
    (async () => {
      let res = await fetch(`/api/crop-scans/${id}/severity`, { cache: "no-store" });
      if (res.status === 404) res = await fetch(`/api/crop-scans/${id}/severity`, { method: "POST" });
      if (!active) return;
      if (!res.ok) return setSeverity({ state: "error" });
      setSeverity({ state: "ready", value: normalizeSeverity((await res.json()) as Record<string, unknown>) });
    })().catch(() => { if (active) setSeverity({ state: "error" }); });
    return () => { active = false; };
  }, [id, screened]);

  function startNewScan() {
    resetSession();
    router.push("/scan");
  }

  if (!hydrated && !scanId) return <ResultSkeleton />;
  if (!id)
    return (
      <ResultState
        title="No scan found"
        detail="Start a new scan to get an AI screening result."
        action={<Link href="/scan" className="rounded-xl bg-brand px-5 py-3 font-bold text-white">Start a scan</Link>}
      />
    );
  if (scan.state === "loading") return <ResultSkeleton />;
  if (scan.state === "error")
    return (
      <ResultState
        title="We could not load this result"
        detail="Your scan is safe. Retry when your connection is stable."
        action={
          <button className="rounded-xl bg-brand px-5 py-3 font-bold text-white" onClick={() => { setScan({ state: "loading" }); setAttempt((n) => n + 1); }}>
            Try again
          </button>
        }
      />
    );
  const result = scan.value;
  if (!result.screenedCondition)
    return (
      <ResultState
        title="This scan has no result yet"
        detail={`Current status: ${result.status.replace(/_/g, " ").toLowerCase()}.`}
        action={
          isCurrentScan ? (
            <Link href="/scan/analysis" className="rounded-xl bg-brand px-5 py-3 font-bold text-white">Back to analysis</Link>
          ) : (
            <Link href="/dashboard" className="rounded-xl bg-brand px-5 py-3 font-bold text-white">Back to dashboard</Link>
          )
        }
      />
    );

  const confidence = displayPercent(result.confidence ?? 0);
  const localPhoto = isCurrentScan ? (session.images.find((i) => i.id === "leaf-closeup") ?? session.images[0])?.previewUrl : undefined;
  const photo = photoUrl ?? localPhoto ?? null;
  const needsExpert = result.disposition === "EXPERT_REVIEW_RECOMMENDED" || (severity.state === "ready" && severity.value?.expertEscalation);

  return (
    <div className="mx-auto max-w-[1060px] space-y-4 px-4 py-5 md:px-6 md:py-7">
      {isCurrentScan && <ScanStepper current="results" />}
      <header className="fg-rise flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
        <div>
          <h1 className="text-2xl font-extrabold text-brand-dark">Your Scan Result</h1>
          <p className="mt-1 text-xs text-muted">
            {[result.fieldName, new Date(result.createdAt).toLocaleDateString(undefined, { day: "numeric", month: "short", year: "numeric" })].filter(Boolean).join(" · ")}
          </p>
        </div>
        <div className="flex gap-2">
          <Link href="/dashboard" className="inline-flex min-h-10 items-center justify-center rounded-full border border-brand/15 bg-white px-5 text-xs font-extrabold text-brand">
            Dashboard
          </Link>
          <button type="button" onClick={startNewScan} className="inline-flex min-h-10 items-center justify-center rounded-full bg-brand px-5 text-xs font-extrabold text-white transition active:scale-95">
            Scan another crop
          </button>
        </div>
      </header>
      <div className="grid gap-4 lg:grid-cols-3">
        <article className="fg-rise relative overflow-hidden rounded-2xl border border-brand/10 bg-white p-5 shadow-sm lg:col-span-2">
          <span className="inline-flex items-center gap-2 rounded-full border border-success/20 bg-brand-soft px-3 py-1 text-[9px] font-extrabold uppercase tracking-wide text-brand">
            <span className="size-2 rounded-full bg-success" />
            AI screening complete
          </span>
          <h2 className="mt-3 text-xl font-extrabold text-brand-dark">Possible condition: {titleCase(result.screenedCondition)}</h2>
          <dl className="mt-6 grid grid-cols-3 gap-3">
            <Metric label="Model confidence">
              <strong className="text-2xl text-brand-dark">{confidence}%</strong>
              <div className="mt-1 h-1.5 overflow-hidden rounded-full bg-border">
                <div className="h-full rounded-full bg-brand transition-all duration-700" style={{ width: `${confidence}%` }} />
              </div>
            </Metric>
            <Metric label="Next step">
              <span className="rounded-full bg-amber-100 px-3 py-1 text-xs font-extrabold text-amber-900">
                {result.disposition ? dispositionLabel[result.disposition] : "—"}
              </span>
            </Metric>
            <Metric label="Result type">
              <span className="text-xs font-bold text-muted">{result.isFirmDiagnosis ? "Expert confirmed" : "Unconfirmed screening"}</span>
            </Metric>
          </dl>
          <SeverityCard severity={severity} />
          {result.alternatives.length > 0 && (
            <div className="mt-6">
              <h3 className="text-sm font-extrabold text-brand-dark">Other possible conditions</h3>
              <ul className="mt-2 space-y-2">
                {result.alternatives.map((alt) => (
                  <li key={alt.condition} className="text-xs text-muted">
                    <div className="flex justify-between">
                      <span>{titleCase(alt.condition)}</span>
                      <span className="font-bold">{displayPercent(alt.confidence)}%</span>
                    </div>
                    <div className="mt-1 h-1 overflow-hidden rounded-full bg-border">
                      <div className="h-full rounded-full bg-brand/40" style={{ width: `${displayPercent(alt.confidence)}%` }} />
                    </div>
                  </li>
                ))}
              </ul>
            </div>
          )}
          {result.disclaimer && (
            <div className="mt-6 rounded-xl border border-amber-200 bg-amber-50 p-3 text-xs leading-5 text-amber-900">
              <strong>Important:</strong> {result.disclaimer}
            </div>
          )}
        </article>
        <aside className="fg-rise space-y-4">
          <section className="relative overflow-hidden rounded-2xl border border-brand/10 bg-[#dbe9d5] shadow-sm">
            {photo ? (
              // eslint-disable-next-line @next/next/no-img-element -- short-lived signed URL or local data URL
              <img src={photo} alt="Submitted leaf photo" className="fg-fade-in aspect-[4/3] w-full object-cover" />
            ) : (
              <div className="grid aspect-[4/3] place-items-center bg-brand-dark px-5 text-center text-xs font-bold text-white">Crop scan evidence</div>
            )}
            <div className="absolute inset-x-0 bottom-0 bg-gradient-to-t from-brand/90 to-transparent p-4 pt-10 text-[10px] font-bold text-white">
              {result.images.length} photo{result.images.length === 1 ? "" : "s"} analysed
            </div>
          </section>
        </aside>
        <section className="fg-rise rounded-2xl bg-[#00452d] p-5 text-white lg:col-span-3">
          <div className="flex flex-col gap-5 md:flex-row md:items-center md:justify-between">
            <div>
              <h2 className="text-base font-extrabold">{needsExpert ? "We recommend an expert look at this" : "Ready to take action?"}</h2>
              <p className="mt-1 text-xs text-emerald-100">
                {needsExpert
                  ? "The screening is uncertain or the situation may be serious. An agriculture expert can confirm before you act."
                  : "This scan is saved to your account. An expert can review it any time."}
              </p>
            </div>
            <Link href="/consultations" className="inline-flex min-h-12 items-center justify-center rounded-full bg-[#b9ee9e] px-7 text-xs font-extrabold text-[#245113] transition active:scale-95">
              Request Expert Review
            </Link>
          </div>
        </section>
      </div>
    </div>
  );
}

function SeverityCard({ severity }: { severity: Load<SeverityAssessment | null> }) {
  if (severity.state === "error") return null;
  if (severity.state === "loading")
    return <div className="mt-6 h-20 animate-pulse rounded-xl bg-surface-soft" aria-label="Estimating severity" />;
  if (!severity.value) return null;
  const style = severityStyle[severity.value.severity];
  return (
    <section className="fg-fade-in mt-6 rounded-xl border border-border p-4">
      <div className="flex items-center justify-between">
        <h3 className="text-sm font-extrabold text-brand-dark">Estimated severity</h3>
        <span className={`text-sm font-extrabold ${style.tone}`}>{style.label}</span>
      </div>
      <div className="mt-2 h-2 overflow-hidden rounded-full bg-border">
        <div className={`h-full rounded-full ${style.bar} transition-all duration-700`} style={{ width: style.width }} />
      </div>
      <p className="mt-2 text-[10px] leading-4 text-muted">
        Combines photo confidence with your field answers, recent weather and satellite data where available. Uses an illustrative, not-yet-expert-approved scoring model.
      </p>
    </section>
  );
}

function Metric({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div className="min-h-20 rounded-xl border border-brand/5 bg-[#f4f8f1] p-3">
      <dt className="mb-2 text-[8px] font-extrabold uppercase tracking-wide text-muted">{label}</dt>
      <dd>{children}</dd>
    </div>
  );
}

function ResultSkeleton() {
  return (
    <div className="mx-auto max-w-[1060px] animate-pulse space-y-4 px-4 py-5 md:px-6 md:py-7" role="status">
      <div className="h-8 w-56 rounded-xl bg-brand/10" />
      <div className="grid gap-4 lg:grid-cols-3">
        <div className="h-72 rounded-2xl bg-brand/10 lg:col-span-2" />
        <div className="h-72 rounded-2xl bg-brand/10" />
      </div>
      <span className="sr-only">Loading your result…</span>
    </div>
  );
}

function ResultState({ title, detail, action }: { title: string; detail: string; action?: React.ReactNode }) {
  return (
    <div className="mx-auto max-w-xl p-8">
      <section className="fg-rise rounded-2xl border border-border bg-white p-8 text-center">
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

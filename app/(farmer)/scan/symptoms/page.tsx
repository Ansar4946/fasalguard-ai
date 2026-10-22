"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useState } from "react";
import { ScanStepper } from "@/components/scan/scan-stepper";
import { useScanSession } from "@/features/diagnosis/scan-session-provider";

type ObservationKey = "SPREADING" | "FIELD_PERCENT" | "INSECTS_VISIBLE" | "SYMPTOM_ONSET";

/**
 * `value` is what the severity engine reads: spread answers must lead with "No"/"Slow" when not
 * rapid, and field-extent answers must carry one representative percentage.
 * "Not sure" answers are never sent — missing evidence is treated as uncertainty, not zero risk.
 */
const questions: Array<{ key: ObservationKey; label: string; hint: string; options: Array<{ label: string; value: string | null }> }> = [
  {
    key: "SPREADING",
    label: "How quickly are the symptoms spreading?",
    hint: "Compare with what you saw a few days ago.",
    options: [
      { label: "Not spreading", value: "No, not spreading" },
      { label: "Slowly", value: "Slowly spreading" },
      { label: "Quickly", value: "Yes, spreading quickly" },
      { label: "Not sure", value: null },
    ],
  },
  {
    key: "FIELD_PERCENT",
    label: "How much of the field looks affected?",
    hint: "A rough estimate is fine.",
    options: [
      { label: "A few plants", value: "About 2% of the field" },
      { label: "Less than 25%", value: "About 15% of the field" },
      { label: "25–50%", value: "About 40% of the field" },
      { label: "More than 50%", value: "About 70% of the field" },
    ],
  },
  {
    key: "INSECTS_VISIBLE",
    label: "Can you see insects or sticky residue?",
    hint: "Check the underside of leaves.",
    options: [
      { label: "Yes", value: "Yes, insects or residue visible" },
      { label: "No", value: "No insects visible" },
      { label: "Not sure", value: null },
    ],
  },
  {
    key: "SYMPTOM_ONSET",
    label: "When did you first notice the symptoms?",
    hint: "Optional.",
    options: [
      { label: "In the last 3 days", value: "Within the last 3 days" },
      { label: "This week", value: "Within the last week" },
      { label: "Over a week ago", value: "More than a week ago" },
      { label: "Not sure", value: null },
    ],
  },
];
const required: ObservationKey[] = ["SPREADING", "FIELD_PERCENT", "INSECTS_VISIBLE"];

export default function SymptomsPage() {
  const router = useRouter();
  const { session, updateSession, hydrated } = useScanSession();
  const [answers, setAnswers] = useState<Record<string, string>>(() => session.observations ?? {});
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string>();
  // The session hydrates from storage after first render; adopt saved answers once it does.
  const [adopted, setAdopted] = useState(false);
  if (hydrated && !adopted) {
    setAdopted(true);
    if (Object.keys(session.observations ?? {}).length) setAnswers(session.observations);
  }

  const answered = required.filter((key) => answers[key]).length;
  const complete = answered === required.length;

  function choose(key: ObservationKey, label: string) {
    const next = { ...answers, [key]: label };
    setAnswers(next);
    updateSession({ observations: next });
  }

  async function submit(event: React.FormEvent) {
    event.preventDefault();
    if (!complete || submitting) return;
    if (!session.backendScanId) {
      setError("Your scan isn't ready yet — go back and add the leaf photo first.");
      return;
    }
    setSubmitting(true);
    setError(undefined);
    const observations = questions.flatMap((question) => {
      const value = question.options.find((option) => option.label === answers[question.key])?.value;
      return value ? [{ key: question.key, answer: value }] : [];
    });
    try {
      if (observations.length) {
        const response = await fetch(`/api/crop-scans/${session.backendScanId}/observations`, {
          method: "POST",
          headers: { "content-type": "application/json" },
          body: JSON.stringify({ observations }),
        });
        if (!response.ok) {
          const body = (await response.json().catch(() => ({}))) as { error?: { message?: string } };
          throw new Error(body.error?.message ?? "Could not save your answers.");
        }
      }
      updateSession({ step: "analysis", progress: 60 });
      router.push("/scan/analysis");
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : "Could not save your answers.");
      setSubmitting(false);
    }
  }

  return (
    <div className="page-container space-y-5">
      <ScanStepper current="symptoms" />
      <header className="fg-rise">
        <p className="text-sm font-bold text-success">Step 3 of 5</p>
        <h1 className="mt-1 text-2xl font-extrabold md:text-3xl">Tell us what you see in the field</h1>
        <p className="mt-2 max-w-2xl text-sm text-muted">Your answers help estimate how serious this is. They don&apos;t change what the AI sees in the photos.</p>
      </header>
      <form onSubmit={submit} className="card fg-rise max-w-3xl space-y-7 p-5 md:p-7">
        <div className="flex items-center gap-3" aria-live="polite">
          <div className="h-1.5 flex-1 overflow-hidden rounded-full bg-border">
            <div className="h-full rounded-full bg-brand transition-all duration-500" style={{ width: `${(answered / required.length) * 100}%` }} />
          </div>
          <span className="text-[11px] font-bold text-muted">{answered} of {required.length} answered</span>
        </div>
        {questions.map((question) => (
          <fieldset key={question.key}>
            <legend className="text-sm font-extrabold">{question.label}</legend>
            <p className="mt-0.5 text-[11px] text-muted">{question.hint}</p>
            <div className="mt-3 grid gap-2 sm:grid-cols-2">
              {question.options.map((option) => {
                const checked = answers[question.key] === option.label;
                return (
                  <label
                    key={option.label}
                    className={`flex min-h-12 cursor-pointer items-center gap-3 rounded-xl border px-4 text-sm font-semibold transition duration-150 active:scale-[.98] ${checked ? "border-brand bg-brand-soft text-brand-dark shadow-sm" : "border-border hover:border-brand/40 hover:bg-surface-soft"}`}
                  >
                    <input
                      type="radio"
                      className="sr-only"
                      name={question.key}
                      value={option.label}
                      checked={checked}
                      onChange={() => choose(question.key, option.label)}
                    />
                    <span className={`grid size-5 shrink-0 place-items-center rounded-full border-2 text-[10px] text-white transition ${checked ? "border-brand bg-brand" : "border-border"}`}>
                      {checked && <span className="fg-pop">✓</span>}
                    </span>
                    {option.label}
                  </label>
                );
              })}
            </div>
          </fieldset>
        ))}
        {error && <p role="alert" className="rounded-xl bg-red-50 p-3 text-xs font-bold text-danger">{error}</p>}
        <div className="flex flex-col-reverse gap-3 border-t border-border pt-5 sm:flex-row sm:justify-between">
          <Link href="/scan/upload" className="inline-flex min-h-11 items-center justify-center rounded-xl border border-border px-5 text-sm font-bold">Back</Link>
          <button
            type="submit"
            disabled={!complete || submitting}
            className="min-h-11 rounded-xl bg-brand px-6 text-sm font-bold text-white transition active:scale-95 disabled:cursor-not-allowed disabled:opacity-45"
          >
            {submitting ? "Saving…" : "Start AI analysis →"}
          </button>
        </div>
      </form>
    </div>
  );
}

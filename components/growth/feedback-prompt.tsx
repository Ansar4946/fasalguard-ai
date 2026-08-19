"use client";

import { useState } from "react";

export function FeedbackPrompt({
  feature,
  contextId,
  farmId,
  onDone,
  onUnauthenticated,
}: {
  feature: "ROADMAP_COMPLETION" | "INCIDENT_RESOLUTION" | "WEEKLY_REPORT" | "CROP_DIAGNOSIS";
  contextId?: string;
  farmId?: string;
  onDone?: () => void;
  onUnauthenticated?: () => void;
}) {
  const [useful, setUseful] = useState<boolean | null>(null);
  const [whatHelped, setWhatHelped] = useState("");
  const [whatImprove, setWhatImprove] = useState("");
  const [wouldRecommend, setWouldRecommend] = useState<boolean | null>(null);
  const [permissionToQuote, setPermissionToQuote] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [done, setDone] = useState(false);

  function submit(usefulValue: boolean): void {
    setUseful(usefulValue);
    setSubmitting(true);
    setError(null);
    fetch("/api/growth/feedback/events", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({
        feature,
        contextId,
        farmId,
        useful: usefulValue,
        wouldRecommend: wouldRecommend ?? undefined,
        whatHelped: whatHelped.trim() || undefined,
        whatImprove: whatImprove.trim() || undefined,
        permissionToQuote,
      }),
    })
      .then((res) => {
        if (res.status === 401) {
          onUnauthenticated?.();
          return;
        }
        if (!res.ok) {
          setError("Could not submit your feedback. Try again.");
          return;
        }
        setDone(true);
        onDone?.();
      })
      .catch(() => setError("Could not submit your feedback. Try again."))
      .finally(() => setSubmitting(false));
  }

  if (done)
    return (
      <p className="rounded-xl bg-success/10 p-3 text-xs font-semibold text-success">
        Thanks for the feedback.
      </p>
    );

  if (useful === null)
    return (
      <div className="rounded-xl bg-surface-soft p-3">
        <p className="text-xs font-bold text-brand-dark">Was this useful?</p>
        <div className="mt-2 flex gap-2">
          <button
            type="button"
            onClick={() => setUseful(true)}
            className="inline-flex min-h-9 items-center rounded-full bg-success/10 px-4 text-xs font-bold text-success"
          >
            Yes
          </button>
          <button
            type="button"
            onClick={() => setUseful(false)}
            className="inline-flex min-h-9 items-center rounded-full bg-danger/10 px-4 text-xs font-bold text-danger"
          >
            No
          </button>
        </div>
      </div>
    );

  return (
    <div className="space-y-2 rounded-xl bg-surface-soft p-3">
      <p className="text-xs font-bold text-brand-dark">
        {useful ? "Glad it helped — want to add more?" : "Sorry to hear that — what can we improve?"}
      </p>
      <label className="block text-[10px] font-bold text-muted">
        What helped? (optional)
        <textarea
          value={whatHelped}
          onChange={(e) => setWhatHelped(e.target.value)}
          rows={2}
          className="mt-1 block w-full rounded-lg border border-brand/15 bg-white p-2 text-xs"
        />
      </label>
      <label className="block text-[10px] font-bold text-muted">
        What should improve? (optional)
        <textarea
          value={whatImprove}
          onChange={(e) => setWhatImprove(e.target.value)}
          rows={2}
          className="mt-1 block w-full rounded-lg border border-brand/15 bg-white p-2 text-xs"
        />
      </label>
      <div className="text-[10px] font-bold text-muted">
        Would you recommend FasalGuard? (optional)
        <div className="mt-1 flex gap-2">
          <button
            type="button"
            onClick={() => setWouldRecommend(true)}
            className={`rounded-full px-3 py-1 text-[11px] font-bold ${wouldRecommend === true ? "bg-success text-white" : "bg-white text-muted"}`}
          >
            Yes
          </button>
          <button
            type="button"
            onClick={() => setWouldRecommend(false)}
            className={`rounded-full px-3 py-1 text-[11px] font-bold ${wouldRecommend === false ? "bg-danger text-white" : "bg-white text-muted"}`}
          >
            No
          </button>
        </div>
      </div>
      <label className="flex items-center gap-2 text-[10px] font-semibold text-muted">
        <input
          type="checkbox"
          checked={permissionToQuote}
          onChange={(e) => setPermissionToQuote(e.target.checked)}
        />
        You may quote this feedback publicly (we&apos;ll only publish it if we reach out and you
        agree to the exact wording)
      </label>
      {error && <p className="text-[10px] font-semibold text-danger">{error}</p>}
      <button
        type="button"
        disabled={submitting}
        onClick={() => submit(useful)}
        className="inline-flex min-h-9 items-center rounded-full bg-brand px-4 text-[11px] font-bold text-white disabled:opacity-50"
      >
        Submit feedback
      </button>
    </div>
  );
}

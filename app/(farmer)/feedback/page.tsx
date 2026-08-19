"use client";

import { Suspense, useState } from "react";
import { useSearchParams } from "next/navigation";
import { FeedbackPrompt } from "@/components/growth/feedback-prompt";

const FEATURE_LABELS: Record<string, string> = {
  ROADMAP_COMPLETION: "your first farm investigation",
  INCIDENT_RESOLUTION: "this incident's resolution",
  WEEKLY_REPORT: "your weekly farm summary",
  CROP_DIAGNOSIS: "your crop scan result",
};

function FeedbackPageContent() {
  const params = useSearchParams();
  const feature = params.get("feature");
  const contextId = params.get("contextId") ?? undefined;
  const [signInRequired, setSignInRequired] = useState(false);

  if (!feature || !(feature in FEATURE_LABELS))
    return (
      <div className="mx-auto max-w-md px-4 py-10">
        <p className="rounded-2xl border border-amber-300 bg-amber-50 p-4 text-sm font-semibold text-amber-900">
          This feedback link is missing or invalid.
        </p>
      </div>
    );

  if (signInRequired)
    return (
      <div className="mx-auto max-w-md px-4 py-10">
        <p className="rounded-2xl border border-amber-300 bg-amber-50 p-4 text-sm font-semibold text-amber-900">
          Please sign in to FasalGuard, then open this feedback link again from your email.
        </p>
        <a
          href="/login"
          className="mt-3 inline-flex min-h-10 items-center rounded-full bg-brand px-5 text-xs font-bold text-white"
        >
          Sign in
        </a>
      </div>
    );

  return (
    <div className="mx-auto max-w-md px-4 py-10">
      <h1 className="text-lg font-bold text-brand-dark">
        Tell us about {FEATURE_LABELS[feature]}
      </h1>
      <div className="mt-4">
        <FeedbackPrompt
          feature={
            feature as "ROADMAP_COMPLETION" | "INCIDENT_RESOLUTION" | "WEEKLY_REPORT" | "CROP_DIAGNOSIS"
          }
          contextId={contextId}
          onUnauthenticated={() => setSignInRequired(true)}
        />
      </div>
    </div>
  );
}

export default function FeedbackPage() {
  return (
    <Suspense fallback={null}>
      <FeedbackPageContent />
    </Suspense>
  );
}

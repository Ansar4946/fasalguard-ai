"use client";

import { useEffect, useState } from "react";

interface Referral {
  code: string;
  invitesCount: number;
}

async function fetchReferral(): Promise<Referral | null> {
  const res = await fetch("/api/growth/referral", { cache: "no-store" });
  if (!res.ok) return null;
  return (await res.json()) as Referral;
}

export function ReferralCard() {
  const [referral, setReferral] = useState<Referral | null>(null);
  const [copied, setCopied] = useState(false);

  useEffect(() => {
    // setState only happens inside this .then(), never synchronously in the effect body.
    fetchReferral()
      .then((data) => setReferral(data))
      .catch(() => null);
  }, []);

  if (!referral?.code) return null;

  const link =
    typeof window !== "undefined"
      ? `${window.location.origin}/?ref=${referral.code}`
      : `/?ref=${referral.code}`;

  function copy() {
    navigator.clipboard
      .writeText(link)
      .then(() => setCopied(true))
      .catch(() => null);
  }

  return (
    <section className="mx-auto mt-4 max-w-[1180px] rounded-2xl border border-brand/10 bg-white p-4 shadow-sm md:mt-6">
      <p className="text-[10px] font-extrabold uppercase tracking-wide text-brand">
        Invite a farmer
      </p>
      <p className="mt-1 text-xs leading-5 text-muted">
        Share your link — {referral.invitesCount} farmer{referral.invitesCount === 1 ? " has" : "s have"} joined
        through it so far.
      </p>
      <div className="mt-3 flex items-center gap-2">
        <input
          readOnly
          value={link}
          className="h-10 flex-1 rounded-lg border border-border bg-background px-3 text-xs text-muted"
        />
        <button
          type="button"
          onClick={copy}
          className="min-h-10 shrink-0 rounded-lg bg-brand px-4 text-xs font-bold text-white"
        >
          {copied ? "Copied" : "Copy"}
        </button>
      </div>
    </section>
  );
}

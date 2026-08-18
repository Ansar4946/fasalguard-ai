"use client";

import { FormEvent, useEffect, useState } from "react";

interface Plan {
  code: string;
  name: string;
  priceMinor: number | null;
  currency: string;
  limits: Record<string, number | boolean | null>;
}

interface Subscription {
  subscription: { status: string };
  plan: Plan | null;
}

const PROVIDERS = [
  { value: "MANUAL_BANK_TRANSFER", label: "Bank transfer" },
  { value: "MANUAL_JAZZCASH", label: "JazzCash" },
  { value: "MANUAL_EASYPAISA", label: "EasyPaisa" },
];

function money(minor: number, currency: string): string {
  return `${currency} ${(minor / 100).toLocaleString(undefined, { minimumFractionDigits: 0 })}`;
}

export function UpgradeRequestForm() {
  const [plans, setPlans] = useState<Plan[] | null>(null);
  const [current, setCurrent] = useState<Subscription | null>(null);
  const [planCode, setPlanCode] = useState("");
  const [provider, setProvider] = useState(PROVIDERS[0]!.value);
  const [reference, setReference] = useState("");
  const [status, setStatus] = useState<"idle" | "submitting" | "sent" | "error">("idle");
  const [message, setMessage] = useState<string>();

  useEffect(() => {
    // setState only happens inside these .then()s, never synchronously in the effect body.
    Promise.all([
      fetch("/api/billing/plans", { cache: "no-store" }).then((r) => (r.ok ? r.json() : null)),
      fetch("/api/billing/subscription", { cache: "no-store" }).then((r) => (r.ok ? r.json() : null)),
    ])
      .then(([plansBody, subscriptionBody]: [Plan[] | null, Subscription | null]) => {
        if (plansBody) {
          const upgradable = plansBody.filter((p) => p.priceMinor !== null);
          setPlans(upgradable);
          if (upgradable[0]) setPlanCode(upgradable[0].code);
        }
        setCurrent(subscriptionBody);
      })
      .catch(() => null);
  }, []);

  function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!planCode || reference.trim().length < 4) {
      setMessage("Choose a plan and enter your payment reference.");
      return;
    }
    setStatus("submitting");
    setMessage(undefined);
    fetch("/api/billing/upgrade-request", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ planCode, provider, providerPaymentReference: reference.trim() }),
    })
      .then(async (res) => {
        const body = await res.json().catch(() => ({}));
        if (!res.ok) throw new Error(body?.error?.message ?? "Request failed");
        setStatus("sent");
      })
      .catch((error: unknown) => {
        setStatus("error");
        setMessage(error instanceof Error ? error.message : "Could not submit your request.");
      });
  }

  if (status === "sent")
    return (
      <div className="rounded-2xl border border-success/20 bg-green-50 p-5 text-sm text-brand-dark">
        <p className="font-bold">Upgrade request submitted.</p>
        <p className="mt-1 text-xs leading-5 text-muted">
          Your payment is <strong>pending</strong> until an admin verifies it against a real bank
          or mobile-money statement — this can take a little time. Your plan will not change until
          then.
        </p>
      </div>
    );

  return (
    <form onSubmit={submit} className="space-y-4 rounded-2xl border border-brand/10 bg-white p-5">
      {current?.plan && (
        <p className="text-xs text-muted">
          Current plan: <strong className="text-brand-dark">{current.plan.name}</strong>
        </p>
      )}
      {message && (
        <p role="alert" className="rounded-xl border border-danger/25 bg-red-50 px-3 py-2 text-xs font-semibold text-danger">
          {message}
        </p>
      )}
      <label className="block">
        <span className="mb-1 block text-[10px] font-semibold">Plan</span>
        <select
          value={planCode}
          onChange={(e) => setPlanCode(e.target.value)}
          className="h-10 w-full rounded-lg border border-[#ccd6cf] bg-[#f7f8fc] px-3 text-xs outline-none focus:border-brand"
        >
          {(plans ?? []).map((plan) => (
            <option key={plan.code} value={plan.code}>
              {plan.name} — {plan.priceMinor !== null ? `${money(plan.priceMinor, plan.currency)}/mo` : "custom"}
            </option>
          ))}
        </select>
      </label>
      <label className="block">
        <span className="mb-1 block text-[10px] font-semibold">Payment method</span>
        <select
          value={provider}
          onChange={(e) => setProvider(e.target.value)}
          className="h-10 w-full rounded-lg border border-[#ccd6cf] bg-[#f7f8fc] px-3 text-xs outline-none focus:border-brand"
        >
          {PROVIDERS.map((p) => (
            <option key={p.value} value={p.value}>
              {p.label}
            </option>
          ))}
        </select>
      </label>
      <label className="block">
        <span className="mb-1 block text-[10px] font-semibold">Payment reference</span>
        <input
          value={reference}
          onChange={(e) => setReference(e.target.value)}
          placeholder="Transaction ID from your bank/mobile-money app"
          className="h-10 w-full rounded-lg border border-[#ccd6cf] bg-[#f7f8fc] px-3 text-xs outline-none focus:border-brand"
        />
      </label>
      <button
        type="submit"
        disabled={status === "submitting"}
        className="inline-flex min-h-11 w-full items-center justify-center rounded-full bg-brand text-xs font-bold text-white disabled:opacity-60"
      >
        {status === "submitting" ? "Submitting..." : "Submit Upgrade Request"}
      </button>
      <p className="text-[10px] leading-4 text-muted">
        No payment gateway is connected yet — send your payment via the method above, then submit
        your reference here. An admin verifies it manually before your plan activates.
      </p>
    </form>
  );
}

"use client";

import { useEffect, useState } from "react";

interface RevenueResponse {
  generatedAt: string;
  policy: {
    excludesTestAccounts: boolean;
    mixedCurrenciesAreNeverSummed: boolean;
    revenueRequiresVerifiedPayment: boolean;
  };
  totalRevenueByCurrency: Record<string, number>;
  monthlyRevenueByCurrency: Record<string, number>;
  mrrByCurrency: Record<string, number>;
  payingUsersCount: number;
  planDistribution: Array<{ planCode: string; count: number }>;
  successfulPaymentsCount: number;
  failedPaymentsCount: number;
  pendingPaymentsCount: number;
  refundedPaymentsCount: number;
}

interface PaymentRow {
  id: string;
  userId: string;
  planCode: string | null;
  provider: string;
  providerPaymentReference: string;
  amountMinor: string;
  currency: string;
  status: string;
  notes: string | null;
  createdAt: string;
}

type LoadState = "loading" | "ready" | "unauthorized" | "error";

function money(amountMinor: number, currency: string): string {
  return `${currency} ${(amountMinor / 100).toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
}

function currencyMapEntries(map: Record<string, number>): Array<[string, number]> {
  const entries = Object.entries(map);
  return entries.length ? entries : [["PKR", 0]];
}

async function fetchDashboard(): Promise<
  { revenue: RevenueResponse; pending: PaymentRow[] } | "unauthorized" | "error"
> {
  const [revenueRes, paymentsRes] = await Promise.all([
    fetch("/api/admin/billing/revenue", { cache: "no-store" }),
    fetch("/api/admin/billing/payments?status=PENDING", { cache: "no-store" }),
  ]);
  if (revenueRes.status === 403 || paymentsRes.status === 403) return "unauthorized";
  if (!revenueRes.ok || !paymentsRes.ok) return "error";
  const revenue = (await revenueRes.json()) as RevenueResponse;
  const pending = (await paymentsRes.json()) as PaymentRow[];
  return { revenue, pending };
}

export function BillingDashboard() {
  const [state, setState] = useState<LoadState>("loading");
  const [revenue, setRevenue] = useState<RevenueResponse | null>(null);
  const [pending, setPending] = useState<PaymentRow[]>([]);
  const [actioning, setActioning] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);

  useEffect(() => {
    // setState only ever happens inside these .then()/.catch() callbacks, never
    // synchronously in the effect body — fetchDashboard() itself never calls setState.
    fetchDashboard()
      .then((result) => {
        if (result === "unauthorized") return setState("unauthorized");
        if (result === "error") return setState("error");
        setRevenue(result.revenue);
        setPending(result.pending);
        setState("ready");
      })
      .catch(() => setState("error"));
  }, []);

  const verify = (id: string): void => {
    setActioning(id);
    fetch(`/api/admin/billing/payments/${id}/verify`, { method: "POST", body: "{}" })
      .then((res) => {
        if (!res.ok) throw new Error("verify failed");
        setNotice("Payment verified — subscription activated.");
        return fetchDashboard();
      })
      .then((result) => {
        if (result !== "unauthorized" && result !== "error") {
          setRevenue(result.revenue);
          setPending(result.pending);
        }
      })
      .catch(() => setNotice("Could not verify this payment. Try again."))
      .finally(() => setActioning(null));
  };

  const reject = (id: string): void => {
    const reason = window.prompt("Reason for rejecting this payment:");
    if (!reason) return;
    setActioning(id);
    fetch(`/api/admin/billing/payments/${id}/reject`, {
      method: "POST",
      body: JSON.stringify({ reason }),
    })
      .then((res) => {
        if (!res.ok) throw new Error("reject failed");
        setNotice("Payment rejected.");
        return fetchDashboard();
      })
      .then((result) => {
        if (result !== "unauthorized" && result !== "error") {
          setRevenue(result.revenue);
          setPending(result.pending);
        }
      })
      .catch(() => setNotice("Could not reject this payment. Try again."))
      .finally(() => setActioning(null));
  };

  if (state === "loading")
    return (
      <div className="mx-auto max-w-6xl px-4 py-10 text-sm text-muted" role="status">
        Loading real billing data…
      </div>
    );
  if (state === "unauthorized")
    return (
      <div className="mx-auto max-w-6xl px-4 py-10">
        <p className="rounded-2xl border border-amber-300 bg-amber-50 p-4 text-sm font-semibold text-amber-900">
          You need an Admin or Super Admin account to view billing evidence.
        </p>
      </div>
    );
  if (state === "error" || !revenue)
    return (
      <div className="mx-auto max-w-6xl px-4 py-10">
        <p className="rounded-2xl border border-red-200 bg-red-50 p-4 text-sm font-semibold text-red-900">
          Could not load billing data. Try refreshing.
        </p>
      </div>
    );

  return (
    <div className="mx-auto max-w-6xl px-4 py-6 sm:px-6">
      <header>
        <p className="text-[10px] font-extrabold uppercase tracking-[.16em] text-success">
          Every value below is a real, persisted, admin-verified record
        </p>
        <h1 className="mt-1 text-2xl font-bold text-brand-dark">Revenue &amp; Subscriptions</h1>
        <p className="mt-1 max-w-2xl text-xs leading-5 text-muted">
          Card payments activate instantly via a verified Stripe webhook; bank/mobile-money
          payments are verified manually against a real statement. Zero means zero, never a
          placeholder.
        </p>
      </header>

      <StripeStatusCard />

      {notice && (
        <div
          role="status"
          className="mt-4 rounded-xl border border-brand/15 bg-brand-soft px-4 py-2 text-xs font-semibold text-brand"
        >
          {notice}
        </div>
      )}

      <section className="mt-5 grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
        <Stat label="Total revenue" rows={currencyMapEntries(revenue.totalRevenueByCurrency)} />
        <Stat
          label="Revenue this month"
          rows={currencyMapEntries(revenue.monthlyRevenueByCurrency)}
        />
        <Stat label="MRR (monthly plans)" rows={currencyMapEntries(revenue.mrrByCurrency)} />
        <article className="rounded-2xl border border-brand/10 bg-white p-4 shadow-sm">
          <p className="text-[9px] font-bold uppercase tracking-wide text-muted">Paying users</p>
          <p className="mt-2 text-xl font-extrabold text-brand-dark">{revenue.payingUsersCount}</p>
        </article>
      </section>

      <section className="mt-4 grid gap-4 lg:grid-cols-2">
        <article className="rounded-2xl border border-brand/10 bg-white p-5 shadow-sm">
          <h2 className="text-base font-bold text-brand-dark">Plan distribution</h2>
          <p className="text-[9px] font-semibold text-muted">Active + trialing subscriptions</p>
          <ul className="mt-4 space-y-2">
            {revenue.planDistribution.length === 0 && (
              <li className="text-xs text-muted">No subscriptions yet.</li>
            )}
            {revenue.planDistribution.map((row) => (
              <li key={row.planCode} className="flex items-center justify-between text-xs">
                <span className="font-semibold text-brand-dark">{row.planCode}</span>
                <span className="font-bold text-muted">{row.count}</span>
              </li>
            ))}
          </ul>
        </article>
        <article className="rounded-2xl border border-brand/10 bg-white p-5 shadow-sm">
          <h2 className="text-base font-bold text-brand-dark">Payment outcomes</h2>
          <p className="text-[9px] font-semibold text-muted">All-time, every persisted attempt</p>
          <dl className="mt-4 grid grid-cols-2 gap-3 text-xs">
            <Outcome label="Successful" value={revenue.successfulPaymentsCount} />
            <Outcome label="Pending review" value={revenue.pendingPaymentsCount} />
            <Outcome label="Failed / rejected" value={revenue.failedPaymentsCount} />
            <Outcome label="Refunded" value={revenue.refundedPaymentsCount} />
          </dl>
        </article>
      </section>

      <p className="mt-3 text-[10px] leading-4 text-muted">
        Currencies are never summed together. Revenue only counts payments with a real verified
        source. Test/demo accounts are excluded from every number above.
      </p>

      <section className="mt-6">
        <h2 className="text-base font-bold text-brand-dark">Pending payment verification</h2>
        <p className="text-[9px] font-semibold text-muted">
          Verify against your own bank/mobile-money statement before approving.
        </p>
        {pending.length === 0 ? (
          <p className="mt-4 rounded-2xl border border-brand/10 bg-white p-4 text-xs text-muted">
            No pending upgrade requests.
          </p>
        ) : (
          <div className="mt-4 overflow-x-auto rounded-2xl border border-brand/10 bg-white shadow-sm">
            <table className="w-full min-w-[640px] text-left text-xs">
              <thead className="bg-surface-soft text-[9px] font-bold uppercase tracking-wide text-muted">
                <tr>
                  <th className="px-4 py-3">Plan</th>
                  <th className="px-4 py-3">Amount</th>
                  <th className="px-4 py-3">Provider</th>
                  <th className="px-4 py-3">Reference</th>
                  <th className="px-4 py-3">Requested</th>
                  <th className="px-4 py-3 text-right">Actions</th>
                </tr>
              </thead>
              <tbody>
                {pending.map((payment) => (
                  <tr key={payment.id} className="border-t border-border">
                    <td className="px-4 py-3 font-semibold text-brand-dark">
                      {payment.planCode ?? "—"}
                    </td>
                    <td className="px-4 py-3">{money(Number(payment.amountMinor), payment.currency)}</td>
                    <td className="px-4 py-3">{payment.provider}</td>
                    <td className="px-4 py-3 font-mono text-[11px]">
                      {payment.providerPaymentReference}
                    </td>
                    <td className="px-4 py-3">{new Date(payment.createdAt).toLocaleString()}</td>
                    <td className="px-4 py-3 text-right">
                      <div className="flex justify-end gap-2">
                        <button
                          disabled={actioning === payment.id}
                          onClick={() => verify(payment.id)}
                          className="min-h-8 rounded-lg bg-brand px-3 text-[10px] font-bold text-white disabled:opacity-50"
                        >
                          Verify
                        </button>
                        <button
                          disabled={actioning === payment.id}
                          onClick={() => reject(payment.id)}
                          className="min-h-8 rounded-lg border border-red-200 px-3 text-[10px] font-bold text-red-700 disabled:opacity-50"
                        >
                          Reject
                        </button>
                      </div>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </section>
    </div>
  );
}

function Stat({ label, rows }: { label: string; rows: Array<[string, number]> }) {
  return (
    <article className="rounded-2xl border border-brand/10 bg-white p-4 shadow-sm">
      <p className="text-[9px] font-bold uppercase tracking-wide text-muted">{label}</p>
      <div className="mt-2 space-y-1">
        {rows.map(([currency, amount]) => (
          <p key={currency} className="text-lg font-extrabold text-brand-dark">
            {money(amount, currency)}
          </p>
        ))}
      </div>
    </article>
  );
}

function Outcome({ label, value }: { label: string; value: number }) {
  return (
    <div>
      <dt className="text-[9px] font-semibold text-muted">{label}</dt>
      <dd className="text-base font-extrabold text-brand-dark">{value}</dd>
    </div>
  );
}

function StripeStatusCard() {
  const [status, setStatus] = useState<{ configured: boolean; webhookConfigured: boolean } | null>(
    null,
  );

  useEffect(() => {
    // setState only happens inside this .then()/.catch(), never synchronously in the effect body.
    fetch("/api/admin/billing/stripe-status", { cache: "no-store" })
      .then((res) => (res.ok ? (res.json() as Promise<typeof status>) : null))
      .then((body) => setStatus(body))
      .catch(() => setStatus(null));
  }, []);

  if (!status) return null;
  const ready = status.configured && status.webhookConfigured;

  return (
    <div
      className={`mt-4 rounded-2xl border p-4 text-xs font-semibold ${
        ready
          ? "border-success/20 bg-success/5 text-success"
          : "border-amber-300 bg-amber-50 text-amber-900"
      }`}
    >
      {ready
        ? "Stripe is configured — card payments activate instantly via webhook."
        : "Stripe is not fully configured yet — card payments are unavailable until STRIPE_SECRET_KEY and STRIPE_WEBHOOK_SECRET are set."}
    </div>
  );
}

"use client";

import type { FarmLedgerEntry } from "@/features/farm-finance/types";
import { formatPkrMinor } from "@/features/farm-finance/ussd-formatters";

export type LedgerState =
  | { status: "loading" | "retrying"; entries: FarmLedgerEntry[] | null }
  | { status: "ready"; entries: FarmLedgerEntry[] }
  | { status: "error"; entries: FarmLedgerEntry[] | null; message: string }
  | { status: "unauthorized"; entries: null; message: string };

export function LedgerCard({ state, receiptId, onRefresh }: { state: LedgerState; receiptId: string | null; onRefresh: () => void }) {
  const refreshing = state.status === "loading" || state.status === "retrying";
  return (
    <section className="rounded-3xl border border-white/70 bg-white/75 p-5 shadow-[0_14px_40px_-18px_rgb(3_69_44/.35)] backdrop-blur" aria-labelledby="ledger-heading">
      <div className="flex items-center justify-between gap-3">
        <h2 id="ledger-heading" className="text-xl font-extrabold">Recent farm expenses</h2>
        <button type="button" onClick={onRefresh} disabled={refreshing} className="min-h-11 rounded-xl border border-brand px-4 text-sm font-bold text-brand-dark transition-transform active:scale-95 disabled:opacity-50">Refresh</button>
      </div>
      <div aria-live="polite">
        {(state.status === "error" || state.status === "unauthorized") && (
          <p className="mt-4 rounded-xl bg-red-50 p-4 text-sm font-semibold text-danger" role="alert">
            {state.status === "error" ? `Ledger unavailable: ${state.message}${state.entries ? " Showing the last records loaded; they may be out of date." : ""}` : state.message}
          </p>
        )}
        {state.status === "retrying" && <p className="mt-4 rounded-xl bg-surface-soft p-4 text-sm text-muted">Retrying…</p>}
        {state.status === "loading" && (
          <div className="mt-4 grid gap-3 sm:grid-cols-2" aria-busy="true">
            <p className="sr-only">Loading farm expenses…</p>
            {[0, 1].map((index) => <div key={index} aria-hidden="true" className="h-28 animate-pulse rounded-2xl bg-surface-soft" />)}
          </div>
        )}
        {state.status === "ready" && state.entries.length === 0 && <p className="mt-4 rounded-xl bg-surface-soft p-4 text-sm text-muted">No USSD expenses have been recorded yet.</p>}
        {state.entries && state.entries.length > 0 && (
          <div className="mt-4 grid gap-3 sm:grid-cols-2">
            {state.entries.map((entry) => (
              <article key={entry.id} className={`rounded-2xl border p-4 transition-shadow hover:shadow-md ${entry.id === receiptId ? "border-brand bg-brand-soft" : "border-border bg-white"}`}>
                <p className="text-xs font-bold uppercase tracking-wide text-muted">{entry.category}</p>
                <p className="mt-1 text-xl font-extrabold">{formatPkrMinor(entry.amountMinor)}</p>
                <p className="mt-2 text-sm font-semibold">{entry.farmName}</p>
                <p className="text-xs text-muted">{entry.occurredOn} · {entry.channel}</p>
                <p className="mt-2 truncate font-mono text-[10px] text-muted" title={entry.id}>{entry.id}</p>
              </article>
            ))}
          </div>
        )}
      </div>
    </section>
  );
}

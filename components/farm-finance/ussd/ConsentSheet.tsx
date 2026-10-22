"use client";

import { useEffect, useRef } from "react";

/** Bottom sheet shown before the first dial. The checkbox gates every call and session start. */
export function ConsentSheet({
  acknowledged,
  onAcknowledge,
  onContinue,
}: {
  acknowledged: boolean;
  onAcknowledge: (value: boolean) => void;
  onContinue: () => void;
}) {
  const box = useRef<HTMLInputElement>(null);
  useEffect(() => {
    box.current?.focus({ preventScroll: true });
  }, []);
  return (
    <div className="absolute inset-0 z-30 flex items-end bg-black/55 backdrop-blur-[2px]">
      <div role="dialog" aria-modal="true" aria-labelledby="consent-title" className="fg-sheet w-full rounded-t-3xl bg-white p-5 text-slate-900 shadow-2xl">
        <span aria-hidden="true" className="mx-auto mb-3 block h-1 w-10 rounded-full bg-slate-300" />
        <p className="inline-block rounded-full bg-amber-100 px-2.5 py-0.5 text-[11px] font-extrabold uppercase tracking-[0.14em] text-amber-900">Simulation</p>
        <h2 id="consent-title" className="mt-2 text-lg font-extrabold">No operator is connected</h2>
        <p className="mt-1 text-sm leading-6 text-slate-700">
          This browser reproduces the application flow. It does not place a USSD call or transfer money. Confirming an expense creates a real ledger record.
        </p>
        <label className="mt-3 flex min-h-11 cursor-pointer items-center gap-3 rounded-xl bg-emerald-50 px-3 font-semibold text-emerald-950">
          <input ref={box} type="checkbox" checked={acknowledged} onChange={(event) => onAcknowledge(event.target.checked)} className="size-6 shrink-0 accent-emerald-700" />
          I understand this is a simulation.
        </label>
        <button type="button" onClick={onContinue} disabled={!acknowledged} className="mt-3 min-h-12 w-full rounded-xl bg-emerald-700 font-extrabold text-white transition-transform active:scale-[.98] disabled:opacity-50">
          Continue to dialer
        </button>
      </div>
    </div>
  );
}

"use client";

import { useEffect, useRef, type FormEvent, type RefObject } from "react";
import { ReceiptCard, type ReceiptView } from "./ReceiptCard";

export function LoadingDots() {
  return (
    <span className="inline-flex items-center gap-1.5" role="img" aria-label="Loading">
      {[0, 1, 2].map((index) => (
        <span key={index} className="fg-dot size-2 rounded-full bg-emerald-700" style={{ animationDelay: `${index * 160}ms` }} />
      ))}
    </span>
  );
}

export interface UssdOverlayProps {
  screen: string;
  active: boolean;
  busy: boolean;
  error: string | null;
  input: string;
  onInput: (value: string) => void;
  onSend: (event: FormEvent) => void;
  onCancel: () => void;
  onRetry: (() => void) | null;
  receipt: ReceiptView | null;
  screenRef: RefObject<HTMLPreElement | null>;
}

/** Android-style USSD dialog: response text, reply field, Send and Cancel. */
export function UssdOverlay(props: UssdOverlayProps) {
  const { screen, active, busy, error, input, onInput, onSend, onCancel, onRetry, receipt, screenRef } = props;
  const field = useRef<HTMLInputElement>(null);
  useEffect(() => {
    if (active && !busy && window.matchMedia("(pointer: fine)").matches) field.current?.focus({ preventScroll: true });
  }, [active, busy, screen]);
  return (
    <div className="absolute inset-x-3 top-1 z-20 flex max-h-[calc(100%-0.25rem)] justify-center">
      <div className="fg-dialog flex min-h-0 w-full flex-col rounded-2xl bg-[#f6f8f5] p-3.5 text-slate-900 shadow-[0_18px_40px_-12px_rgb(0_0_0/.6)] ring-1 ring-black/5" aria-busy={busy}>
        <div className="min-h-0 flex-1 overflow-y-auto">
          <pre ref={screenRef} tabIndex={-1} role="status" aria-live="polite" aria-atomic="true" className="whitespace-pre-wrap break-words font-mono text-[13px] leading-5 text-slate-900 outline-none focus-visible:ring-2 focus-visible:ring-emerald-600">{screen}</pre>
          {busy && <p className="mt-2"><LoadingDots /></p>}
          {receipt && <ReceiptCard receipt={receipt} />}
          {error && <p className="mt-2 rounded-lg bg-red-50 p-2 text-xs font-semibold text-red-800" role="alert">{error}</p>}
        </div>
        <form onSubmit={onSend} className="mt-2.5 shrink-0">
          {active && (
            <>
              <label className="sr-only" htmlFor="ussd-input">USSD menu response</label>
              <input id="ussd-input" ref={field} value={input} onChange={(event) => onInput(event.target.value)} maxLength={32} disabled={busy} inputMode="numeric" autoComplete="off" className="min-h-11 w-full rounded-lg border-0 border-b-2 border-emerald-700 bg-white px-3 font-mono text-base tracking-widest text-slate-900 disabled:opacity-60" />
            </>
          )}
          <div className="mt-2 flex gap-2">
            <button type="button" onClick={onCancel} className="min-h-11 flex-1 rounded-lg px-3 text-sm font-bold text-emerald-800 transition-colors hover:bg-emerald-50 active:scale-[.97]">{active ? "Cancel" : "OK"}</button>
            {onRetry && <button type="button" onClick={onRetry} disabled={busy} className="min-h-11 flex-1 rounded-lg border border-emerald-700 px-3 text-sm font-bold text-emerald-800 disabled:opacity-50">Retry same step</button>}
            {active && <button type="submit" disabled={busy} className="min-h-11 flex-1 rounded-lg bg-emerald-700 px-3 text-sm font-extrabold text-white transition-transform active:scale-[.97] disabled:opacity-50">Send</button>}
          </div>
        </form>
      </div>
    </div>
  );
}

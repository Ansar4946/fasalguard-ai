"use client";

import type { FormEvent } from "react";

const fieldClass =
  "mt-1 min-h-12 w-full rounded-xl border border-border bg-white/80 px-3 text-base text-foreground shadow-inner transition-shadow focus:border-brand focus:outline-none focus:ring-2 focus:ring-brand/30";

export function PinCard({ busy, message, onSubmit }: { busy: boolean; message: string | null; onSubmit: (event: FormEvent<HTMLFormElement>) => void }) {
  return (
    <form onSubmit={onSubmit} className="rounded-3xl border border-white/70 bg-white/75 p-5 shadow-[0_14px_40px_-18px_rgb(3_69_44/.35)] backdrop-blur">
      <h2 className="text-lg font-extrabold">Configure transaction PIN</h2>
      <p className="mt-1 text-sm text-muted">Your account password authorizes a separate 4–6 digit USSD PIN.</p>
      <label className="mt-4 block text-sm font-bold" htmlFor="current-password">Current password</label>
      <input id="current-password" name="currentPassword" type="password" minLength={8} maxLength={128} required autoComplete="current-password" className={fieldClass} />
      <div className="grid gap-3 sm:grid-cols-2">
        <div>
          <label className="mt-3 block text-sm font-bold" htmlFor="new-pin">New PIN</label>
          <input id="new-pin" name="pin" type="password" pattern="[0-9]{4,6}" required inputMode="numeric" autoComplete="new-password" className={fieldClass} />
        </div>
        <div>
          <label className="mt-3 block text-sm font-bold" htmlFor="confirm-pin">Confirm PIN</label>
          <input id="confirm-pin" name="confirmPin" type="password" pattern="[0-9]{4,6}" required inputMode="numeric" autoComplete="new-password" className={fieldClass} />
        </div>
      </div>
      <button type="submit" disabled={busy} className="mt-4 min-h-12 w-full rounded-xl bg-gradient-to-b from-brand to-brand-dark px-4 font-extrabold text-white shadow-md transition-transform active:scale-[.98] disabled:opacity-50">Save PIN</button>
      {message && <p className="mt-3 rounded-lg bg-surface-soft p-3 text-sm" role="status" aria-live="polite">{message}</p>}
    </form>
  );
}

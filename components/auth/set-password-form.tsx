"use client";

import { FormEvent, useState } from "react";
import Link from "next/link";

export function SetPasswordForm({ token }: { token: string }) {
  const [error, setError] = useState<string>();
  const [done, setDone] = useState(false);
  const [busy, setBusy] = useState(false);

  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const data = new FormData(event.currentTarget);
    const password = String(data.get("password") ?? "");
    const confirmation = String(data.get("confirmation") ?? "");
    if (password.length < 12) return setError("Use at least 12 characters.");
    if (password !== confirmation) return setError("Passwords do not match.");
    setBusy(true);
    setError(undefined);
    const response = await fetch("/api/auth/password/setup", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ token, password }),
    });
    const body = await response.json().catch(() => ({}));
    if (!response.ok) {
      setError(body?.error?.message ?? "This link is invalid or expired.");
      setBusy(false);
      return;
    }
    setDone(true);
  }

  if (done)
    return (
      <div className="text-center">
        <div className="mx-auto grid size-12 place-items-center rounded-full bg-brand-soft text-xl text-brand">
          ✓
        </div>
        <h1 className="mt-4 text-2xl font-extrabold text-brand-dark">
          Password created
        </h1>
        <p className="mt-2 text-sm text-muted">
          Your FasalGuard account is ready for future sign-ins.
        </p>
        <Link
          href="/dashboard"
          className="mt-6 inline-flex min-h-11 items-center rounded-full bg-brand px-7 text-sm font-bold text-white"
        >
          Open dashboard →
        </Link>
      </div>
    );

  return (
    <form
      onSubmit={submit}
      className="w-full max-w-md rounded-3xl border border-brand/10 bg-white p-6 shadow-[0_20px_60px_rgba(15,45,32,.10)] sm:p-8"
    >
      <p className="text-[11px] font-bold uppercase tracking-[.14em] text-success">
        Secure account setup
      </p>
      <h1 className="mt-2 text-2xl font-extrabold text-brand-dark">
        Choose your password
      </h1>
      <p className="mt-2 text-sm leading-6 text-muted">
        Use at least 12 characters. This one-time link expires automatically.
      </p>
      {error && (
        <p
          role="alert"
          className="mt-4 rounded-xl bg-red-50 px-4 py-3 text-xs font-semibold text-danger"
        >
          {error}
        </p>
      )}
      <label className="mt-6 block text-xs font-bold">
        New password
        <input
          name="password"
          type="password"
          autoComplete="new-password"
          className="mt-2 h-12 w-full rounded-2xl border border-border bg-[#f3f7ff] px-4 text-sm outline-none focus:border-brand focus-visible:outline-none focus-visible:ring-4 focus-visible:ring-brand/10"
        />
      </label>
      <label className="mt-4 block text-xs font-bold">
        Confirm password
        <input
          name="confirmation"
          type="password"
          autoComplete="new-password"
          className="mt-2 h-12 w-full rounded-2xl border border-border bg-[#f3f7ff] px-4 text-sm outline-none focus:border-brand focus-visible:outline-none focus-visible:ring-4 focus-visible:ring-brand/10"
        />
      </label>
      <button
        disabled={busy}
        className="mt-6 min-h-12 w-full rounded-full bg-brand px-6 text-sm font-bold text-white shadow-lg shadow-green-900/15 disabled:opacity-60"
      >
        {busy ? "Saving..." : "Set password"}
      </button>
    </form>
  );
}

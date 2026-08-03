"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { FormEvent, useId, useState } from "react";

type FormErrors = { identifier?: string; password?: string };

export function LoginForm() {
  const router = useRouter();
  const errorId = useId();
  const [showPassword, setShowPassword] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const [errors, setErrors] = useState<FormErrors>({});

  function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const data = new FormData(event.currentTarget);
    const identifier = String(data.get("identifier") ?? "").trim();
    const password = String(data.get("password") ?? "");
    const nextErrors: FormErrors = {};
    if (identifier.length < 5) nextErrors.identifier = "Enter a valid phone number or email address.";
    if (password.length < 6) nextErrors.password = "Password must contain at least 6 characters.";
    setErrors(nextErrors);
    if (Object.keys(nextErrors).length) return;
    setSubmitting(true);
    window.setTimeout(() => router.push("/dashboard"), 350);
  }

  return (
    <div className="w-full max-w-[380px]">
      <div className="mb-7 flex flex-col items-center lg:hidden"><div className="mb-3 grid size-12 place-items-center rounded-2xl bg-brand text-white shadow-lg"><BrandPlant /></div><p className="text-lg font-bold text-brand">FasalGuard AI</p></div>
      <header className="mb-6"><p className="text-[10px] font-bold text-success">Welcome back</p><h1 className="mt-1 text-2xl font-bold tracking-tight text-brand-dark">Sign in to your account</h1><p className="mt-1 text-xs leading-5 text-muted">Manage your fields and monitor crop health.</p></header>

      <form noValidate onSubmit={submit} className="space-y-4">
        <Field id="identifier" label="Phone or Email" error={errors.identifier} errorId={`${errorId}-identifier`}><FieldIcon type="person"/><input id="identifier" name="identifier" type="text" autoComplete="username" aria-invalid={Boolean(errors.identifier)} aria-describedby={errors.identifier ? `${errorId}-identifier` : undefined} placeholder="Enter phone or email address" className="min-w-0 flex-1 bg-transparent py-3 pr-3 text-xs outline-none" onChange={() => setErrors((current) => ({ ...current, identifier: undefined }))} /></Field>
        <Field id="password" label="Password" error={errors.password} errorId={`${errorId}-password`}><FieldIcon type="lock"/><input id="password" name="password" type={showPassword ? "text" : "password"} autoComplete="current-password" aria-invalid={Boolean(errors.password)} aria-describedby={errors.password ? `${errorId}-password` : undefined} placeholder="Enter your password" className="min-w-0 flex-1 bg-transparent py-3 text-xs outline-none" onChange={() => setErrors((current) => ({ ...current, password: undefined }))} /><button type="button" onClick={() => setShowPassword((visible) => !visible)} className="grid size-10 place-items-center text-[9px] font-bold text-muted hover:text-brand" aria-label={showPassword ? "Hide password" : "Show password"} aria-pressed={showPassword}>{showPassword ? "Hide" : "Show"}</button></Field>
        <div className="flex items-center justify-between gap-3 text-[10px]"><label className="flex min-h-9 cursor-pointer items-center gap-2 font-medium text-muted"><input name="remember" type="checkbox" className="size-4 accent-brand" />Remember me</label><Link href="/login?help=password" className="min-h-9 content-center font-bold text-brand hover:underline">Forgot password?</Link></div>
        <button disabled={submitting} type="submit" className="flex min-h-11 w-full items-center justify-center gap-2 rounded-full bg-brand px-5 text-xs font-bold text-white shadow-lg shadow-green-900/15 transition hover:-translate-y-0.5 hover:bg-brand-dark disabled:cursor-wait disabled:opacity-70">{submitting ? "Signing in..." : "Sign in"}<span aria-hidden="true">→</span></button>
        <button type="button" onClick={() => router.push("/dashboard")} className="flex min-h-11 w-full items-center justify-center gap-2 rounded-full border border-brand/15 px-5 text-xs font-bold text-brand transition hover:bg-brand/5"><span aria-hidden="true">▯</span>OTP sign in</button>
      </form>

      <div className="mt-7 text-center"><p className="text-[10px] text-muted">Don&apos;t have an account? <Link href="/onboarding/personal" className="font-bold text-brand hover:underline">Create farmer account</Link></p><div className="my-5 flex items-center gap-3" aria-hidden="true"><span className="h-px flex-1 bg-border"/><span className="text-[9px] font-bold uppercase tracking-[.15em] text-muted">Portal access</span><span className="h-px flex-1 bg-border"/></div><Link href="/expert" className="inline-flex min-h-10 items-center justify-center gap-2 rounded-xl px-4 text-[10px] font-bold text-brand hover:bg-surface-soft"><span aria-hidden="true">◇</span>Expert login</Link><div className="mt-5 flex justify-center gap-3 opacity-45"><span className="rounded border border-border px-3 py-1 text-[8px]">Secure</span><span className="rounded border border-border px-3 py-1 text-[8px]">Private</span></div></div>
    </div>
  );
}

function Field({ id, label, error, errorId, children }: { id: string; label: string; error?: string; errorId: string; children: React.ReactNode }) { return <div><label htmlFor={id} className="mb-1.5 block text-[10px] font-semibold text-foreground">{label}</label><div className={`flex min-h-11 items-center rounded-xl border bg-[#eef4ff] transition focus-within:bg-white focus-within:ring-2 focus-within:ring-brand/10 ${error ? "border-danger" : "border-transparent focus-within:border-brand"}`}>{children}</div>{error && <p id={errorId} role="alert" className="mt-1 text-[10px] font-semibold text-danger">{error}</p>}</div>; }
function FieldIcon({ type }: { type: "person" | "lock" }) { return <span className="grid size-10 shrink-0 place-items-center text-muted"><svg aria-hidden="true" viewBox="0 0 24 24" className="size-4" fill="none" stroke="currentColor" strokeWidth="1.7" strokeLinecap="round" strokeLinejoin="round">{type === "person" ? <><circle cx="12" cy="8" r="3"/><path d="M6 20c.7-4 2.7-6 6-6s5.3 2 6 6"/></> : <><rect x="5" y="10" width="14" height="11" rx="2"/><path d="M8 10V7a4 4 0 0 1 8 0v3"/></>}</svg></span>; }
function BrandPlant() { return <svg viewBox="0 0 24 24" className="size-6" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round"><path d="M12 21v-9M12 15c-5 0-7-3-7-7 4 0 7 2 7 7ZM12 12c0-5 3-7 7-7 0 4-2 7-7 7Z"/><path d="M7 21h10"/></svg>; }

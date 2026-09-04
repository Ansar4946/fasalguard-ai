"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { FormEvent, useId, useState } from "react";
import { authClient, AuthClientError } from "@/features/auth/auth-client";
import { BrandLogo } from "@/components/brand/brand-logo";

type FormErrors = { identifier?: string };

const FARMER_RETURN_PATHS = new Set([
  "/dashboard",
  "/farms",
  "/fields",
  "/scan",
  "/satellite",
  "/weather",
  "/market-intelligence",
  "/radar",
  "/alerts",
  "/tasks",
  "/consultations",
  "/assistant",
  "/learning",
  "/reports",
]);

function safeFarmerReturnTo(returnTo?: string): string | null {
  if (!returnTo || !returnTo.startsWith("/") || returnTo.startsWith("//"))
    return null;
  try {
    const url = new URL(returnTo, "https://fasalguard.local");
    const allowed = [...FARMER_RETURN_PATHS].some(
      (path) => url.pathname === path || url.pathname.startsWith(`${path}/`),
    );
    return allowed ? `${url.pathname}${url.search}${url.hash}` : null;
  } catch {
    return null;
  }
}

function destination(role: string, returnTo?: string) {
  if (role === "AGRICULTURE_EXPERT") return "/expert";
  if (role === "GOVERNMENT_VIEWER" || role === "NGO_VIEWER")
    return "/government";
  return safeFarmerReturnTo(returnTo) ?? "/dashboard";
}

export function LoginForm({ returnTo }: { returnTo?: string }) {
  const router = useRouter();
  const errorId = useId();
  const [submitting, setSubmitting] = useState(false);
  const [errors, setErrors] = useState<FormErrors>({});
  const [formError, setFormError] = useState<string>();

  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const data = new FormData(event.currentTarget);
    const identifier = String(data.get("identifier") ?? "").trim();
    const nextErrors: FormErrors = {};
    if (identifier.length < 5)
      nextErrors.identifier = "Enter a valid phone number or email address.";
    setErrors(nextErrors);
    if (Object.keys(nextErrors).length || submitting) return;
    setFormError(undefined);
    setSubmitting(true);
    try {
      const { user } = await authClient.login(identifier);
      router.replace(destination(user.role, returnTo));
      router.refresh();
    } catch (error) {
      setFormError(
        error instanceof AuthClientError
          ? error.message
          : "Unable to sign in. Please try again.",
      );
      setSubmitting(false);
    }
  }

  return (
    <div className="w-full max-w-[420px]">
      <div className="mb-8 flex flex-col items-center lg:hidden">
        <BrandLogo priority className="h-auto w-52" />
      </div>

      <header className="mb-7">
        <p className="text-[11px] font-bold text-success">Welcome back</p>
        <h1 className="mt-1 text-2xl font-extrabold tracking-tight text-brand-dark">
          Sign in to your account
        </h1>
        <p className="mt-1.5 text-sm leading-6 text-muted">
          Manage your fields and monitor crop health.
        </p>
      </header>

      <form noValidate onSubmit={submit} className="space-y-4">
        {formError && (
          <div
            role="alert"
            className="rounded-2xl border border-danger/25 bg-red-50 px-4 py-3 text-xs font-semibold text-danger"
          >
            {formError}
          </div>
        )}

        <Field
          id="identifier"
          label="Phone or Email"
          error={errors.identifier}
          errorId={`${errorId}-identifier`}
        >
          <FieldIcon type="person" />
          <input
            id="identifier"
            name="identifier"
            type="text"
            inputMode="email"
            autoComplete="username"
            aria-invalid={Boolean(errors.identifier)}
            aria-describedby={
              errors.identifier ? `${errorId}-identifier` : undefined
            }
            placeholder="Enter phone or email address"
            className="min-w-0 flex-1 bg-transparent py-3.5 pr-4 text-sm text-foreground outline-none placeholder:text-muted/70 focus:outline-none focus-visible:outline-none"
            onChange={() =>
              setErrors((current) => ({ ...current, identifier: undefined }))
            }
          />
        </Field>

        <div className="flex items-center justify-between gap-3 text-[11px]">
          <label className="flex min-h-9 cursor-pointer items-center gap-2 font-medium text-muted">
            <input
              name="remember"
              type="checkbox"
              className="size-4 rounded accent-brand"
            />
            Remember me
          </label>
        </div>

        <button
          disabled={submitting}
          type="submit"
          className="flex min-h-12 w-full items-center justify-center gap-2 rounded-full bg-brand px-5 text-sm font-bold text-white shadow-[0_10px_24px_rgba(7,95,61,.18)] transition duration-200 hover:-translate-y-0.5 hover:bg-brand-dark hover:shadow-[0_14px_30px_rgba(7,95,61,.24)] disabled:cursor-wait disabled:translate-y-0 disabled:opacity-70"
        >
          {submitting ? "Signing in..." : "Sign in"}
          <span aria-hidden="true">→</span>
        </button>
        <button
          type="button"
          disabled
          title="OTP sign-in requires a configured production SMS provider."
          className="flex min-h-12 w-full cursor-not-allowed items-center justify-center gap-2 rounded-full border border-border bg-white px-5 text-sm font-semibold text-muted opacity-60"
        >
          <span aria-hidden="true">▯</span>OTP sign in unavailable
        </button>
      </form>

      <div className="mt-8 text-center">
        <p className="text-[11px] text-muted">
          Don&apos;t have an account?{" "}
          <Link
            href="/onboarding/personal"
            className="font-bold text-brand hover:underline"
          >
            Create farmer account
          </Link>
        </p>
        <div className="my-5 flex items-center gap-3" aria-hidden="true">
          <span className="h-px flex-1 bg-border" />
          <span className="text-[9px] font-bold uppercase tracking-[.18em] text-muted">
            Portal access
          </span>
          <span className="h-px flex-1 bg-border" />
        </div>
        <Link
          href="/expert"
          className="inline-flex min-h-10 items-center justify-center gap-2 rounded-xl px-4 text-sm font-semibold text-brand transition hover:bg-surface-soft"
        >
          <span aria-hidden="true">◇</span>Expert login
        </Link>
        <div className="mt-5 flex justify-center gap-3 opacity-50">
          <span className="rounded-lg border border-border px-3 py-1 text-[9px]">
            Secure
          </span>
          <span className="rounded-lg border border-border px-3 py-1 text-[9px]">
            Private
          </span>
        </div>
      </div>
    </div>
  );
}

function Field({
  id,
  label,
  error,
  errorId,
  children,
}: {
  id: string;
  label: string;
  error?: string;
  errorId: string;
  children: React.ReactNode;
}) {
  return (
    <div>
      <label
        htmlFor={id}
        className="mb-2 block text-[11px] font-semibold text-foreground"
      >
        {label}
      </label>
      <div
        className={`flex min-h-13 items-center overflow-hidden rounded-2xl border bg-[#f3f7ff] shadow-[inset_0_1px_0_rgba(255,255,255,.8)] transition-[border-color,box-shadow,background-color] duration-200 focus-within:bg-white focus-within:shadow-[0_0_0_4px_rgba(7,95,61,.10)] ${error ? "border-danger bg-red-50/50" : "border-[#dfe7e2] focus-within:border-brand"}`}
      >
        {children}
      </div>
      {error && (
        <p
          id={errorId}
          role="alert"
          className="mt-1.5 text-[10px] font-semibold text-danger"
        >
          {error}
        </p>
      )}
    </div>
  );
}

function FieldIcon({ type }: { type: "person" }) {
  return (
    <span className="grid size-12 shrink-0 place-items-center text-muted">
      <svg
        aria-hidden="true"
        viewBox="0 0 24 24"
        className="size-4"
        fill="none"
        stroke="currentColor"
        strokeWidth="1.7"
        strokeLinecap="round"
        strokeLinejoin="round"
      >
        {type === "person" && (
          <>
            <circle cx="12" cy="8" r="3" />
            <path d="M6 20c.7-4 2.7-6 6-6s5.3 2 6 6" />
          </>
        )}
      </svg>
    </span>
  );
}

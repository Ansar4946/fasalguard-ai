"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { FormEvent, useEffect, useRef, useState } from "react";
import { OnboardingStepper } from "@/components/onboarding/onboarding-stepper";
import { useOnboarding } from "@/features/onboarding/onboarding-provider";
import { BrandLogo } from "@/components/brand/brand-logo";

type PersonalDraft = {
  fullName: string;
  phone: string;
  email: string;
  language: "English" | "Urdu" | "Punjabi";
};
type FieldErrors = Partial<Record<keyof PersonalDraft, string>>;

function validate(values: PersonalDraft): FieldErrors {
  const errors: FieldErrors = {};
  if (values.fullName.trim().length < 2)
    errors.fullName = "Enter your full name.";
  const phoneDigits = values.phone.replace(/\D/g, "");
  if (phoneDigits.length < 10 || phoneDigits.length > 12)
    errors.phone = "Enter a valid mobile number (10–12 digits).";
  if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(values.email))
    errors.email =
      "Enter a valid email address so we can confirm your account.";
  return errors;
}

export function PersonalInformation() {
  const router = useRouter();
  const { data, updateSection, hydrated } = useOnboarding();
  const values = data.personal as PersonalDraft;
  const [errors, setErrors] = useState<FieldErrors>({});
  const [submitting, setSubmitting] = useState(false);
  const [saveState, setSaveState] = useState<"saved" | "saving">("saved");
  const saveTimer = useRef<ReturnType<typeof setTimeout> | null>(null);

  useEffect(
    () => () => {
      if (saveTimer.current) clearTimeout(saveTimer.current);
    },
    [],
  );

  function update<K extends keyof PersonalDraft>(
    key: K,
    value: PersonalDraft[K],
  ) {
    updateSection("personal", { [key]: value });
    setErrors((current) => ({ ...current, [key]: undefined }));
    setSaveState("saving");
    if (saveTimer.current) clearTimeout(saveTimer.current);
    saveTimer.current = setTimeout(() => setSaveState("saved"), 450);
  }

  function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const nextErrors = validate(values);
    setErrors(nextErrors);
    const firstError = Object.keys(nextErrors)[0];
    if (firstError) {
      document.getElementById(firstError)?.focus();
      return;
    }
    setSubmitting(true);
    router.push("/onboarding/farm");
  }

  return (
    <main className="relative flex min-h-svh items-start justify-center overflow-x-clip bg-[#f8f4ea] px-3 py-6 min-[400px]:px-4 sm:px-6 sm:py-8 lg:items-center lg:py-10 [@media(max-height:760px)]:items-start [@media(max-height:760px)]:py-5">
      <div
        aria-hidden="true"
        className="absolute -left-24 -top-24 size-64 rounded-full bg-[#fffdf6] blur-2xl"
      />
      <div
        aria-hidden="true"
        className="absolute -bottom-32 -right-28 size-80 rounded-full bg-brand-soft/25 blur-3xl"
      />
      <div className="relative w-full max-w-[760px] 2xl:max-w-[840px]">
        <header className="mb-4 text-center sm:mb-5">
          <BrandLogo priority className="mx-auto h-auto w-56" />
          <p className="mx-auto mt-1 max-w-md text-[11px] leading-5 text-muted sm:text-xs">
            Welcome! Let&apos;s set up your digital farm profile so you can
            start monitoring your crops.
          </p>
        </header>

        <section
          className="mb-4 rounded-2xl border border-brand/10 bg-white p-4 shadow-[0_8px_30px_rgba(15,45,32,.05)] sm:px-6 sm:py-5"
          aria-label="Onboarding progress"
        >
          <OnboardingStepper current={1} />
        </section>

        <section className="min-w-0 rounded-2xl border border-brand/10 bg-white p-4 shadow-[0_18px_50px_rgba(15,45,32,.08)] min-[400px]:p-5 sm:p-7 lg:p-8">
          <div
            className="mb-4 flex h-4 justify-end"
            role="status"
            aria-live="polite"
          >
            <span className="flex items-center gap-1.5 text-[9px] font-bold uppercase tracking-[.12em] text-muted">
              <span
                className={`size-2 rounded-full ${!hydrated || saveState === "saving" ? "animate-pulse bg-amber-500" : "bg-success"}`}
              />
              {!hydrated
                ? "Loading draft"
                : saveState === "saving"
                  ? "Saving changes"
                  : "Draft saved on this device"}
            </span>
          </div>
          <form noValidate onSubmit={submit} className="space-y-4">
            <FormField id="fullName" label="Full Name" error={errors.fullName}>
              <InputIcon kind="person" />
              <input
                id="fullName"
                name="fullName"
                autoComplete="name"
                value={values.fullName}
                onChange={(event) => update("fullName", event.target.value)}
                aria-invalid={Boolean(errors.fullName)}
                aria-describedby={
                  errors.fullName ? "fullName-error" : undefined
                }
                placeholder="e.g. Ahmad Khan"
                className="min-w-0 flex-1 bg-transparent py-3 pr-3 text-xs outline-none"
              />
            </FormField>

            <div className="grid min-w-0 gap-4 md:grid-cols-[minmax(0,.95fr)_minmax(0,1.05fr)] md:gap-5">
              <FormField id="phone" label="Phone Number" error={errors.phone}>
                <InputIcon kind="phone" />
                <input
                  id="phone"
                  name="phone"
                  type="tel"
                  inputMode="tel"
                  autoComplete="tel"
                  maxLength={16}
                  value={values.phone}
                  onChange={(event) =>
                    update(
                      "phone",
                      event.target.value.replace(/[^\d+() -]/g, ""),
                    )
                  }
                  aria-invalid={Boolean(errors.phone)}
                  aria-describedby={errors.phone ? "phone-error" : undefined}
                  placeholder="+92 3XX XXXXXXX"
                  className="min-w-0 flex-1 bg-transparent py-3 pr-3 text-xs outline-none"
                />
              </FormField>
              <FormField id="email" label="Email Address" error={errors.email}>
                <InputIcon kind="mail" />
                <input
                  id="email"
                  name="email"
                  type="email"
                  inputMode="email"
                  autoComplete="email"
                  value={values.email}
                  onChange={(event) => update("email", event.target.value)}
                  aria-invalid={Boolean(errors.email)}
                  aria-describedby={errors.email ? "email-error" : undefined}
                  placeholder="ahmad@example.com"
                  className="min-w-0 flex-1 bg-transparent py-3 pr-3 text-xs outline-none"
                />
              </FormField>
            </div>

            <FormField id="language" label="Preferred Language">
              <InputIcon kind="language" />
              <select
                id="language"
                name="language"
                value={values.language}
                onChange={(event) =>
                  update(
                    "language",
                    event.target.value as PersonalDraft["language"],
                  )
                }
                className="min-w-0 flex-1 appearance-none bg-transparent py-3 pr-3 text-xs outline-none"
              >
                <option value="English">English</option>
                <option value="Urdu">Urdu / اردو</option>
                <option value="Punjabi">Punjabi / پنجابی</option>
              </select>
              <span aria-hidden="true" className="pr-4 text-xs text-muted">
                ⌄
              </span>
            </FormField>

            <div className="flex flex-col gap-2 pt-2 min-[400px]:flex-row min-[400px]:items-center min-[400px]:gap-3">
              <button
                type="submit"
                disabled={!hydrated || submitting}
                className="inline-flex min-h-11 flex-1 items-center justify-center gap-2 rounded-full bg-brand px-6 text-xs font-bold text-white shadow-lg shadow-green-900/15 transition hover:-translate-y-0.5 hover:bg-brand-dark disabled:cursor-not-allowed disabled:opacity-60"
              >
                {submitting ? "Continuing..." : "Continue"}
                <span aria-hidden="true">→</span>
              </button>
              <Link
                href="/login"
                className="inline-flex min-h-11 items-center justify-center rounded-full px-4 text-xs font-bold text-brand hover:bg-surface-soft"
              >
                Back
              </Link>
            </div>
          </form>
        </section>

        <p className="mx-auto mt-5 max-w-md text-center text-[9px] leading-4 text-muted">
          This onboarding draft stays on this device until account registration
          and farm boundary mapping are completed.
        </p>
      </div>
    </main>
  );
}

function FormField({
  id,
  label,
  error,
  children,
}: {
  id: string;
  label: string;
  error?: string;
  children: React.ReactNode;
}) {
  return (
    <div className="min-w-0">
      <label
        htmlFor={id}
        className="mb-1.5 block text-[10px] font-semibold text-foreground"
      >
        {label}
      </label>
      <div
        className={`onboarding-input flex min-h-11 min-w-0 items-center overflow-hidden rounded-xl border bg-[#f7f8fc] transition focus-within:bg-white focus-within:ring-2 focus-within:ring-brand/10 ${error ? "border-danger" : "border-[#cfd9d2] focus-within:border-brand"}`}
      >
        {children}
      </div>
      {error && (
        <p
          id={`${id}-error`}
          className="mt-1 text-[10px] font-semibold text-danger"
        >
          {error}
        </p>
      )}
    </div>
  );
}

function InputIcon({
  kind,
}: {
  kind: "person" | "phone" | "mail" | "language";
}) {
  const paths = {
    person: (
      <>
        <circle cx="12" cy="8" r="3" />
        <path d="M6 20c.7-4 2.7-6 6-6s5.3 2 6 6" />
      </>
    ),
    phone: (
      <path d="M7 3h3l1.5 4-2 1.5a14 14 0 0 0 6 6l1.5-2 4 1.5v3c0 2-1 3-3 3A17 17 0 0 1 4 6c0-2 1-3 3-3Z" />
    ),
    mail: (
      <>
        <rect x="3" y="5" width="18" height="14" rx="2" />
        <path d="m4 7 8 6 8-6" />
      </>
    ),
    language: (
      <>
        <circle cx="12" cy="12" r="9" />
        <path d="M3 12h18M12 3c3 3 3 15 0 18M12 3c-3 3-3 15 0 18" />
      </>
    ),
  };
  return (
    <span className="grid size-10 shrink-0 place-items-center text-muted">
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
        {paths[kind]}
      </svg>
    </span>
  );
}

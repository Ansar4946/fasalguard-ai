"use client";

import Link from "next/link";
import { FormEvent, useState } from "react";
import { useOnboarding } from "@/features/onboarding/onboarding-provider";
import { authClient, AuthClientError } from "@/features/auth/auth-client";
import { BrandLogo } from "@/components/brand/brand-logo";
import { BoundaryPicker } from "@/components/farms/boundary-picker";
import { toGeoJsonPolygon } from "@/lib/geo/polygon";

type Errors = {
  fieldName?: string;
  fieldSizeAcres?: string;
  cropType?: string;
  boundary?: string;
};

export function FarmSetup() {
  const { data, updateSection, complete } = useOnboarding();
  const [errors, setErrors] = useState<Errors>({});
  const [submitting, setSubmitting] = useState(false);
  const [formError, setFormError] = useState<string>();

  async function finish(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const nextErrors: Errors = {};
    if (data.field.fieldName.trim().length < 2)
      nextErrors.fieldName = "Enter a field name.";
    if (!data.field.fieldSizeAcres || Number(data.field.fieldSizeAcres) <= 0)
      nextErrors.fieldSizeAcres = "Enter an area greater than zero.";
    if (!data.field.cropType) nextErrors.cropType = "Select a crop type.";
    if (data.field.boundaryPoints.length < 3)
      nextErrors.boundary =
        "Tap at least 3 points on the map to draw your farm boundary.";
    if (!data.personal.email.trim())
      setFormError("Return to personal information and add an email address.");
    setErrors(nextErrors);
    const firstError = Object.keys(nextErrors)[0];
    if (firstError || !data.personal.email.trim()) {
      document.getElementById(firstError)?.focus();
      return;
    }
    if (submitting) return;
    setSubmitting(true);
    setFormError(undefined);
    const digits = data.personal.phone.replace(/\D/g, "");
    const phone = digits.startsWith("0")
      ? `+92${digits.slice(1)}`
      : digits.startsWith("92")
        ? `+${digits}`
        : `+${digits}`;
    try {
      const result = await authClient.completeOnboarding({
        fullName: data.personal.fullName.trim(),
        email: data.personal.email.trim(),
        phone,
        preferredLanguage:
          data.personal.language === "Urdu"
            ? "ur"
            : data.personal.language === "Punjabi"
              ? "pa"
              : "en",
        ...data.preferences,
        referralCode: data.referral.code || undefined,
        acquisitionSource: data.referral.source,
      });
      complete();
      // The account (and session) now exists. Farm/field creation is a best-effort
      // follow-up: failure here must never block the user from reaching the
      // dashboard, since their account was already successfully created above.
      let farmError = false;
      try {
        const boundary = toGeoJsonPolygon(data.field.boundaryPoints);
        const farmResponse = await fetch("/api/farms", {
          method: "POST",
          headers: { "content-type": "application/json" },
          body: JSON.stringify({
            name: data.farm.farmName.trim(),
            boundary,
            province: data.farm.province.trim() || undefined,
            district: data.farm.district.trim() || undefined,
          }),
        });
        const farmBody = await farmResponse.json().catch(() => ({}));
        if (!farmResponse.ok || !farmBody?.id) {
          farmError = true;
        } else {
          const fieldResponse = await fetch(
            `/api/farms/${farmBody.id}/fields`,
            {
              method: "POST",
              headers: { "content-type": "application/json" },
              body: JSON.stringify({
                name: data.field.fieldName.trim(),
                boundary,
              }),
            },
          );
          if (!fieldResponse.ok) farmError = true;
        }
      } catch {
        farmError = true;
      }
      const query = new URLSearchParams({
        onboarding: "complete",
        email: result.emailDelivery,
      });
      if (farmError) query.set("farmError", "1");
      window.location.assign(`/dashboard?${query.toString()}`);
    } catch (error) {
      setFormError(
        error instanceof AuthClientError
          ? error.message
          : "Unable to create your account. Please try again.",
      );
      setSubmitting(false);
    }
  }

  return (
    <main className="flex min-h-svh flex-col bg-[#f8f4ea]">
      <header className="flex h-16 shrink-0 items-center justify-between border-b border-brand/5 bg-white/70 px-5 backdrop-blur sm:px-8">
        <Link
          href="/onboarding/farm"
          className="flex items-center gap-2 text-xs font-bold text-brand-dark"
        >
          <BrandLogo className="h-auto w-36" />
        </Link>
        <span className="text-[9px] font-semibold text-muted">
          Step 4 &amp; 5 of 5
        </span>
      </header>
      <div className="mx-auto w-full max-w-5xl flex-1 px-3 py-4 min-[400px]:px-4 sm:px-6 sm:py-5 2xl:max-w-6xl">
        <section>
          <div className="flex items-end justify-between">
            <h1 className="text-xl font-bold text-brand-dark">
              Finalizing Your Farm
            </h1>
            <span className="text-[10px] font-bold text-success">
              80% Complete
            </span>
          </div>
          <div className="mt-2 h-1.5 rounded-full bg-[#dce8f3]">
            <div className="h-full w-4/5 rounded-full bg-brand" />
          </div>
        </section>

        <form
          id="farm-setup-form"
          onSubmit={finish}
          noValidate
          className="mt-4 grid min-w-0 items-start gap-4 lg:grid-cols-12"
        >
          {formError && (
            <div
              role="alert"
              className="rounded-xl border border-danger/25 bg-red-50 px-4 py-3 text-xs font-semibold text-danger lg:col-span-12"
            >
              {formError}
            </div>
          )}
          <section className="min-w-0 rounded-2xl border border-brand/10 bg-white p-4 shadow-[0_10px_30px_rgba(15,45,32,.06)] min-[400px]:p-5 lg:col-span-7">
            <div className="flex items-center gap-3">
              <span className="grid size-8 place-items-center rounded-full bg-brand text-white">
                <PinIcon />
              </span>
              <h2 className="text-sm font-bold text-brand-dark">
                Add First Field
              </h2>
            </div>
            <div className="mt-5 grid gap-3 sm:grid-cols-2">
              <Field id="fieldName" label="Field Name" error={errors.fieldName}>
                <input
                  id="fieldName"
                  value={data.field.fieldName}
                  onChange={(event) => {
                    updateSection("field", { fieldName: event.target.value });
                    setErrors((current) => ({
                      ...current,
                      fieldName: undefined,
                    }));
                  }}
                  placeholder="e.g. North Orchard"
                  className="h-10 w-full rounded-lg border border-[#ccd6cf] bg-[#f7f8fc] px-3 text-[10px] outline-none focus:border-brand"
                />
              </Field>
              <Field
                id="fieldSizeAcres"
                label="Total Area (Acres)"
                error={errors.fieldSizeAcres}
              >
                <input
                  id="fieldSizeAcres"
                  type="number"
                  min="0.1"
                  step="0.1"
                  inputMode="decimal"
                  value={data.field.fieldSizeAcres}
                  onChange={(event) => {
                    updateSection("field", {
                      fieldSizeAcres: event.target.value,
                    });
                    setErrors((current) => ({
                      ...current,
                      fieldSizeAcres: undefined,
                    }));
                  }}
                  placeholder="0.0"
                  className="h-10 w-full rounded-lg border border-[#ccd6cf] bg-[#f7f8fc] px-3 text-[10px] outline-none focus:border-brand"
                />
              </Field>
            </div>
            <div className="mt-4">
              <Field
                id="cropType"
                label="Crop currently planted in this field"
                error={errors.cropType}
              >
                <select
                  id="cropType"
                  value={data.field.cropType}
                  onChange={(event) => {
                    updateSection("field", { cropType: event.target.value });
                    setErrors((current) => ({
                      ...current,
                      cropType: undefined,
                    }));
                  }}
                  className="h-10 w-full rounded-lg border border-[#ccd6cf] bg-[#f7f8fc] px-3 text-[10px] outline-none focus:border-brand"
                >
                  <option value="">Select primary crop</option>
                  <option>Cotton</option>
                  <option>Wheat</option>
                  <option>Rice</option>
                  <option>Sugarcane</option>
                  <option>Maize</option>
                </select>
              </Field>
            </div>
            <div className="mt-4" id="boundary">
              <div className="flex items-center justify-between">
                <p className="text-[10px] font-semibold">Farm Boundary</p>
                <span className="text-[8px] italic text-muted">
                  Used for local weather &amp; alerts
                </span>
              </div>
              <div className="mt-2">
                <BoundaryPicker
                  points={data.field.boundaryPoints}
                  onChange={(points) => {
                    updateSection("field", { boundaryPoints: points });
                    setErrors((current) => ({ ...current, boundary: undefined }));
                  }}
                />
              </div>
              {errors.boundary && (
                <p className="mt-1 text-[9px] font-semibold text-danger">
                  {errors.boundary}
                </p>
              )}
              <p className="mt-2 text-[9px] leading-4 text-muted">
                We&apos;ll use this boundary for your farm and first field —
                refine it anytime from Fields. Exact coordinates remain
                private and are never shown on community maps.
              </p>
            </div>
          </section>

          <div className="min-w-0 space-y-3 lg:col-span-5">
            <section className="rounded-2xl border border-brand/10 bg-white p-5 shadow-[0_10px_30px_rgba(15,45,32,.06)]">
              <div className="flex items-center gap-3">
                <span className="grid size-8 place-items-center rounded-full bg-brand-soft text-brand">
                  <SettingsIcon />
                </span>
                <h2 className="text-sm font-bold text-brand-dark">
                  Preferences
                </h2>
              </div>
              <div className="mt-4 space-y-3">
                <Toggle
                  label="Anonymous contribution"
                  detail="Help the community by sharing anonymous disease data."
                  checked={data.preferences.anonymousContribution}
                  onChange={(value) =>
                    updateSection("preferences", {
                      anonymousContribution: value,
                    })
                  }
                />
                <Toggle
                  label="Nearby outbreak alerts"
                  detail="Instant notification of pests detected within 10 km."
                  checked={data.preferences.nearbyAlerts}
                  onChange={(value) =>
                    updateSection("preferences", { nearbyAlerts: value })
                  }
                />
                <Toggle
                  label="Weather-risk alerts"
                  detail="Warnings for frost, heatwaves or flash flooding."
                  checked={data.preferences.weatherAlerts}
                  onChange={(value) =>
                    updateSection("preferences", { weatherAlerts: value })
                  }
                />
                <Toggle
                  label="Task reminders"
                  detail="Notifications for scheduled spraying or harvesting."
                  checked={data.preferences.taskReminders}
                  onChange={(value) =>
                    updateSection("preferences", { taskReminders: value })
                  }
                />
              </div>
            </section>
            <aside className="flex gap-3 rounded-xl border border-brand/10 bg-[#edf6e9] p-4">
              <span className="grid size-7 shrink-0 place-items-center rounded-full bg-white text-brand">
                <ShieldIcon />
              </span>
              <div>
                <p className="text-[10px] font-bold text-brand-dark">
                  Your Data is Secure
                </p>
                <p className="mt-1 text-[9px] leading-4 text-muted">
                  Privacy settings can be changed later. Public maps only use
                  approximate locations.
                </p>
              </div>
            </aside>
          </div>
        </form>
      </div>
      <footer className="shrink-0 border-t border-brand/10 bg-white px-3 pt-3 pb-[max(.75rem,env(safe-area-inset-bottom))] min-[400px]:px-5 sm:px-8">
        <div className="mx-auto flex max-w-4xl items-center justify-between gap-2">
          <Link
            href="/onboarding/farm"
            className="inline-flex min-h-11 items-center gap-2 rounded-full px-3 text-[10px] font-bold text-muted hover:bg-surface-soft"
          >
            ← Back
          </Link>
          <button
            type="submit"
            form="farm-setup-form"
            disabled={submitting}
            className="inline-flex min-h-11 items-center gap-2 rounded-full bg-brand px-4 text-[11px] font-bold text-white shadow-lg shadow-green-900/15 transition hover:-translate-y-0.5 disabled:cursor-wait disabled:translate-y-0 disabled:opacity-70 sm:px-6 sm:text-xs"
          >
            {submitting ? "Creating account..." : "Finish Setup"}{" "}
            <span className="grid size-5 place-items-center rounded-full border border-white/30">
              ✓
            </span>
          </button>
        </div>
      </footer>
    </main>
  );
}

function Field({
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
    <div>
      <label htmlFor={id} className="mb-1.5 block text-[10px] font-semibold">
        {label}
      </label>
      {children}
      {error && (
        <p className="mt-1 text-[9px] font-semibold text-danger">{error}</p>
      )}
    </div>
  );
}
function Toggle({
  label,
  detail,
  checked,
  onChange,
}: {
  label: string;
  detail: string;
  checked: boolean;
  onChange: (value: boolean) => void;
}) {
  return (
    <label className="flex cursor-pointer items-start justify-between gap-3">
      <span>
        <strong className="block text-[10px] text-brand-dark">{label}</strong>
        <span className="mt-0.5 block text-[8px] leading-3 text-muted">
          {detail}
        </span>
      </span>
      <span
        className={`relative mt-0.5 h-5 w-9 shrink-0 rounded-full transition ${checked ? "bg-brand" : "bg-[#cbd5ce]"}`}
      >
        <input
          type="checkbox"
          checked={checked}
          onChange={(event) => onChange(event.target.checked)}
          className="sr-only"
        />
        <span
          className={`absolute top-0.5 size-4 rounded-full bg-white shadow transition ${checked ? "left-[18px]" : "left-0.5"}`}
        />
      </span>
    </label>
  );
}
function PinIcon() {
  return (
    <svg
      viewBox="0 0 24 24"
      className="size-4"
      fill="none"
      stroke="currentColor"
      strokeWidth="1.8"
    >
      <path d="M20 10c0 5-8 11-8 11S4 15 4 10a8 8 0 1 1 16 0Z" />
      <circle cx="12" cy="10" r="2" />
    </svg>
  );
}
function SettingsIcon() {
  return (
    <svg
      viewBox="0 0 24 24"
      className="size-4"
      fill="none"
      stroke="currentColor"
      strokeWidth="1.8"
    >
      <circle cx="12" cy="12" r="3" />
      <path d="M12 3v3M12 18v3M3 12h3M18 12h3M5.6 5.6l2.1 2.1M16.3 16.3l2.1 2.1M18.4 5.6l-2.1 2.1M7.7 16.3l-2.1 2.1" />
    </svg>
  );
}
function ShieldIcon() {
  return (
    <svg
      viewBox="0 0 24 24"
      className="size-4"
      fill="none"
      stroke="currentColor"
      strokeWidth="1.8"
    >
      <path d="M12 3 5 6v5c0 5 3 8 7 10 4-2 7-5 7-10V6Z" />
      <path d="m9 12 2 2 4-4" />
    </svg>
  );
}

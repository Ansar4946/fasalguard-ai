"use client";

import Link from "next/link";
import { FormEvent, useState } from "react";
import { BrandLogo } from "@/components/brand/brand-logo";

type Draft = {
  name: string;
  email: string;
  phone: string;
  country: string;
  farmSizeAcres: string;
  mainCrop: string;
  farmCount: string;
};

const initial: Draft = {
  name: "",
  email: "",
  phone: "",
  country: "Pakistan",
  farmSizeAcres: "",
  mainCrop: "",
  farmCount: "",
};

export default function JoinPilotPage() {
  const [values, setValues] = useState<Draft>(initial);
  const [status, setStatus] = useState<"idle" | "submitting" | "sent" | "error">("idle");
  const [error, setError] = useState<string>();

  function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (values.name.trim().length < 2 || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(values.email)) {
      setError("Enter your name and a valid email address.");
      return;
    }
    setStatus("submitting");
    setError(undefined);
    fetch("/api/growth/pilot-leads", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({
        name: values.name.trim(),
        email: values.email.trim(),
        phone: values.phone.trim() || undefined,
        country: values.country.trim(),
        farmSizeAcres: values.farmSizeAcres ? Number(values.farmSizeAcres) : undefined,
        mainCrop: values.mainCrop.trim(),
        farmCount: values.farmCount ? Number(values.farmCount) : undefined,
      }),
    })
      .then((res) => {
        if (!res.ok) throw new Error("submit failed");
        setStatus("sent");
      })
      .catch(() => {
        setStatus("error");
        setError("Could not submit right now. Please try again.");
      });
  }

  if (status === "sent")
    return (
      <main className="grid min-h-dvh place-items-center bg-[#f8f4ea] px-4">
        <div className="max-w-md text-center">
          <BrandLogo priority className="mx-auto h-auto w-40" />
          <h1 className="mt-6 text-xl font-bold text-brand-dark">You&apos;re on the list</h1>
          <p className="mt-2 text-sm leading-6 text-muted">
            Thanks — we&apos;ll be in touch about joining the free pilot. In the meantime you can
            create a full account and start monitoring your farm right away.
          </p>
          <Link
            href="/onboarding/personal"
            className="mt-6 inline-flex min-h-11 items-center justify-center rounded-full bg-brand px-6 text-xs font-bold text-white"
          >
            Start Monitoring My Farm
          </Link>
        </div>
      </main>
    );

  return (
    <main className="flex min-h-dvh items-center justify-center bg-[#f8f4ea] px-4 py-10">
      <div className="w-full max-w-lg rounded-2xl border border-brand/10 bg-white p-6 shadow-[0_18px_50px_rgba(15,45,32,.08)] sm:p-8">
        <BrandLogo priority className="h-auto w-40" />
        <h1 className="mt-4 text-xl font-bold text-brand-dark">Join the free pilot</h1>
        <p className="mt-1 text-xs leading-5 text-muted">
          Tell us a little about your farm and we&apos;ll reach out about onboarding you.
        </p>
        <form onSubmit={submit} noValidate className="mt-5 space-y-3">
          {error && (
            <p role="alert" className="rounded-xl border border-danger/25 bg-red-50 px-3 py-2 text-xs font-semibold text-danger">
              {error}
            </p>
          )}
          <Field label="Full name">
            <input
              value={values.name}
              onChange={(e) => setValues((v) => ({ ...v, name: e.target.value }))}
              className="h-10 w-full rounded-lg border border-[#ccd6cf] bg-[#f7f8fc] px-3 text-xs outline-none focus:border-brand"
            />
          </Field>
          <Field label="Email">
            <input
              type="email"
              value={values.email}
              onChange={(e) => setValues((v) => ({ ...v, email: e.target.value }))}
              className="h-10 w-full rounded-lg border border-[#ccd6cf] bg-[#f7f8fc] px-3 text-xs outline-none focus:border-brand"
            />
          </Field>
          <Field label="Phone (optional)">
            <input
              type="tel"
              placeholder="+92 3XX XXXXXXX"
              value={values.phone}
              onChange={(e) => setValues((v) => ({ ...v, phone: e.target.value }))}
              className="h-10 w-full rounded-lg border border-[#ccd6cf] bg-[#f7f8fc] px-3 text-xs outline-none focus:border-brand"
            />
          </Field>
          <div className="grid grid-cols-2 gap-3">
            <Field label="Country">
              <input
                value={values.country}
                onChange={(e) => setValues((v) => ({ ...v, country: e.target.value }))}
                className="h-10 w-full rounded-lg border border-[#ccd6cf] bg-[#f7f8fc] px-3 text-xs outline-none focus:border-brand"
              />
            </Field>
            <Field label="Main crop">
              <input
                value={values.mainCrop}
                onChange={(e) => setValues((v) => ({ ...v, mainCrop: e.target.value }))}
                placeholder="e.g. Cotton"
                className="h-10 w-full rounded-lg border border-[#ccd6cf] bg-[#f7f8fc] px-3 text-xs outline-none focus:border-brand"
              />
            </Field>
          </div>
          <div className="grid grid-cols-2 gap-3">
            <Field label="Farm size (acres)">
              <input
                type="number"
                min="0"
                step="0.1"
                value={values.farmSizeAcres}
                onChange={(e) => setValues((v) => ({ ...v, farmSizeAcres: e.target.value }))}
                className="h-10 w-full rounded-lg border border-[#ccd6cf] bg-[#f7f8fc] px-3 text-xs outline-none focus:border-brand"
              />
            </Field>
            <Field label="Number of farms">
              <input
                type="number"
                min="0"
                step="1"
                value={values.farmCount}
                onChange={(e) => setValues((v) => ({ ...v, farmCount: e.target.value }))}
                className="h-10 w-full rounded-lg border border-[#ccd6cf] bg-[#f7f8fc] px-3 text-xs outline-none focus:border-brand"
              />
            </Field>
          </div>
          <button
            type="submit"
            disabled={status === "submitting"}
            className="mt-2 inline-flex min-h-11 w-full items-center justify-center rounded-full bg-brand text-xs font-bold text-white disabled:opacity-60"
          >
            {status === "submitting" ? "Submitting..." : "Join Free Pilot"}
          </button>
          <p className="text-center text-[10px] text-muted">
            Already sure?{" "}
            <Link href="/onboarding/personal" className="font-bold text-brand underline">
              Start monitoring my farm instead
            </Link>
          </p>
        </form>
      </div>
    </main>
  );
}

function Field({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <label className="block">
      <span className="mb-1 block text-[10px] font-semibold text-foreground">{label}</span>
      {children}
    </label>
  );
}

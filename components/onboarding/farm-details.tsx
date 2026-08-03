"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { FormEvent, useState } from "react";
import { useOnboarding } from "@/features/onboarding/onboarding-provider";
import type { OnboardingData } from "@/features/onboarding/types";

const cropOptions = ["Cotton", "Wheat", "Rice", "Maize", "Sugarcane"];
const districts: Record<string, string[]> = {
  Punjab: ["Bahawalpur", "Faisalabad", "Lahore", "Multan", "Rahim Yar Khan"],
  Sindh: ["Hyderabad", "Khairpur", "Sukkur"],
  "Khyber Pakhtunkhwa": ["Mardan", "Peshawar", "Swat"],
  Balochistan: ["Quetta", "Sibi"],
};

type FarmErrors = Partial<Record<keyof OnboardingData["farm"], string>>;

export function FarmDetails() {
  const { data, updateSection } = useOnboarding();
  const draft = data.farm;
  const router = useRouter();
  const [errors, setErrors] = useState<FarmErrors>({});

  function update<K extends keyof OnboardingData["farm"]>(key: K, value: OnboardingData["farm"][K]) {
    updateSection("farm", { [key]: value });
    setErrors((current) => ({ ...current, [key]: undefined }));
  }

  function toggleCrop(crop: string) {
    update("crops", draft.crops.includes(crop) ? draft.crops.filter((item) => item !== crop) : [...draft.crops, crop]);
  }

  function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const nextErrors: FarmErrors = {};
    if (!draft.experienceYears) nextErrors.experienceYears = "Select your farming experience.";
    if (!draft.province) nextErrors.province = "Select a province.";
    if (!draft.district.trim()) nextErrors.district = "Select a district.";
    if (!draft.crops.length) nextErrors.crops = "Select at least one crop.";
    if (draft.farmName.trim().length < 2) nextErrors.farmName = "Enter a farm name.";
    const size = Number(draft.farmSizeAcres);
    if (!draft.farmSizeAcres || !Number.isFinite(size) || size <= 0 || size > 100000) nextErrors.farmSizeAcres = "Enter a valid area greater than 0 acres.";
    setErrors(nextErrors);
    const firstError = Object.keys(nextErrors)[0];
    if (firstError) {
      document.getElementById(firstError)?.focus();
      return;
    }
    router.push("/onboarding/setup");
  }

  return (
    <main className="relative min-h-svh overflow-x-clip bg-[#f8f4ea] px-3 py-4 min-[400px]:px-4 sm:px-6 sm:py-6 lg:py-8">
      <div className="relative mx-auto w-full max-w-5xl 2xl:max-w-6xl">
        <header>
          <div className="flex items-center justify-between"><Link href="/onboarding/personal" className="flex items-center gap-2 text-sm font-bold text-brand-dark"><PlantMark small />FasalGuard AI</Link><Link href="/dashboard" className="min-h-9 content-center rounded-lg px-3 text-[10px] font-semibold text-muted hover:bg-white">Save &amp; Exit</Link></div>
          <div className="mt-3 h-1.5 overflow-hidden rounded-full bg-[#dce8f3]"><div className="h-full w-2/5 rounded-full bg-brand shadow-[0_0_10px_rgba(7,95,61,.18)]" /></div>
          <div className="mt-2 flex justify-between text-[10px] font-semibold"><span className="text-brand-dark">Experience &amp; Farm Details</span><span className="text-muted">40% Complete</span></div>
        </header>

        <form noValidate onSubmit={submit} className="mt-4 grid min-w-0 gap-4 lg:grid-cols-12">
          <section className="min-w-0 rounded-2xl border border-brand/10 bg-white p-4 shadow-[0_10px_30px_rgba(15,45,32,.05)] min-[400px]:p-5 lg:col-span-7" aria-labelledby="experience-heading">
            <SectionTitle icon="person" title="Your Experience" subtitle="Tell us about your agricultural background." id="experience-heading" />
            <div className="mt-5">
              <FieldLabel htmlFor="experience">Years of experience</FieldLabel>
              <select id="experience" value={draft.experienceYears} onChange={(event) => update("experienceYears", event.target.value)} aria-invalid={Boolean(errors.experienceYears)} aria-describedby={errors.experienceYears ? "experience-error" : undefined} className={`h-10 w-full rounded-lg border bg-[#f7f8fc] px-3 text-[11px] outline-none focus:border-brand ${errors.experienceYears ? "border-danger" : "border-[#ccd6cf]"}`}><option value="">Select duration</option><option value="new">Less than 1 year</option><option value="1-5">1–5 years</option><option value="6-10">6–10 years</option><option value="11+">More than 10 years</option></select>
              {errors.experienceYears && <ErrorText id="experience-error">{errors.experienceYears}</ErrorText>}
            </div>
            <div className="mt-4 grid min-w-0 gap-3 sm:grid-cols-2">
              <div><FieldLabel htmlFor="province">Province</FieldLabel><select id="province" value={draft.province} onChange={(event) => { update("province", event.target.value); update("district", ""); }} className="h-10 w-full rounded-lg border border-[#ccd6cf] bg-[#f7f8fc] px-3 text-[11px] outline-none focus:border-brand">{Object.keys(districts).map((item) => <option key={item}>{item}</option>)}</select></div>
              <div><FieldLabel htmlFor="district">District</FieldLabel><select id="district" value={draft.district} onChange={(event) => update("district", event.target.value)} aria-invalid={Boolean(errors.district)} aria-describedby={errors.district ? "district-error" : undefined} className={`h-10 w-full rounded-lg border bg-[#f7f8fc] px-3 text-[11px] outline-none focus:border-brand ${errors.district ? "border-danger" : "border-[#ccd6cf]"}`}><option value="">Select district</option>{districts[draft.province]?.map((item) => <option key={item}>{item}</option>)}</select>{errors.district && <ErrorText id="district-error">{errors.district}</ErrorText>}</div>
            </div>
            <fieldset className="mt-5"><legend className="text-[10px] font-semibold text-foreground">Crops grown</legend><div className="mt-2 flex flex-wrap gap-2">{cropOptions.map((crop) => <button key={crop} type="button" aria-pressed={draft.crops.includes(crop)} onClick={() => toggleCrop(crop)} className={`min-h-8 rounded-full border px-3 text-[10px] font-semibold transition ${draft.crops.includes(crop) ? "border-brand bg-brand-soft text-brand-dark shadow-sm" : "border-border bg-white text-muted hover:border-brand/40"}`}>{crop}</button>)}</div>{errors.crops && <ErrorText>{errors.crops}</ErrorText>}</fieldset>
          </section>

          <div className="min-w-0 space-y-3 lg:col-span-5">
            <section className="rounded-2xl border border-brand/10 bg-white p-5 shadow-[0_10px_30px_rgba(15,45,32,.05)]" aria-labelledby="farm-heading">
              <SectionTitle icon="farm" title="First Farm" subtitle="You can add more farms later." id="farm-heading" />
              <div className="mt-5"><FieldLabel htmlFor="farmName">Farm name</FieldLabel><input id="farmName" value={draft.farmName} onChange={(event) => update("farmName", event.target.value)} autoComplete="organization" aria-invalid={Boolean(errors.farmName)} aria-describedby={errors.farmName ? "farm-name-error" : undefined} placeholder="e.g. Golden Acres" className={`h-10 w-full rounded-lg border bg-[#f7f8fc] px-3 text-[11px] outline-none focus:border-brand ${errors.farmName ? "border-danger" : "border-[#ccd6cf]"}`} />{errors.farmName && <ErrorText id="farm-name-error">{errors.farmName}</ErrorText>}</div>
              <div className="mt-4"><FieldLabel htmlFor="farmSizeAcres">Farm size (acres)</FieldLabel><input id="farmSizeAcres" value={draft.farmSizeAcres} onChange={(event) => update("farmSizeAcres", event.target.value)} type="number" inputMode="decimal" min="0.1" step="0.1" aria-invalid={Boolean(errors.farmSizeAcres)} aria-describedby={errors.farmSizeAcres ? "farm-size-error" : undefined} placeholder="0.0" className={`h-10 w-full rounded-lg border bg-[#f7f8fc] px-3 text-[11px] outline-none focus:border-brand ${errors.farmSizeAcres ? "border-danger" : "border-[#ccd6cf]"}`} />{errors.farmSizeAcres && <ErrorText id="farm-size-error">{errors.farmSizeAcres}</ErrorText>}</div>
              <div className="mt-5 rounded-xl bg-brand p-4 text-center text-white"><p className="text-xs font-semibold italic leading-5">“Precision monitoring starts with accurate farm mapping.”</p></div>
            </section>
            <aside className="flex gap-3 rounded-xl border border-amber-200 bg-[#fff7dd] p-3"><span className="grid size-7 shrink-0 place-items-center rounded-full bg-white text-sm text-amber-700">!</span><p className="text-[9px] leading-4 text-amber-950/75">Correct farm size helps our AI estimate local weather and disease alerts more accurately.</p></aside>
          </div>

          <div className="flex flex-col-reverse gap-2 pt-1 min-[400px]:flex-row min-[400px]:items-center min-[400px]:justify-between md:col-span-12"><Link href="/onboarding/personal" className="inline-flex min-h-11 items-center justify-center gap-2 rounded-full px-4 text-[10px] font-bold text-brand hover:bg-white">← Back</Link><button type="submit" className="inline-flex min-h-11 items-center justify-center gap-2 rounded-full bg-brand px-7 text-xs font-bold text-white shadow-lg shadow-green-900/15 transition hover:-translate-y-0.5 hover:bg-brand-dark">Continue →</button></div>
        </form>
      </div>
    </main>
  );
}

function SectionTitle({ icon, title, subtitle, id }: { icon: "person" | "farm"; title: string; subtitle: string; id: string }) { return <div className="flex items-center gap-3"><span className="grid size-8 place-items-center rounded-full bg-brand-soft text-brand"><SectionIcon type={icon} /></span><div><h2 id={id} className="text-sm font-bold text-brand-dark">{title}</h2><p className="mt-0.5 text-[9px] text-muted">{subtitle}</p></div></div>; }
function SectionIcon({ type }: { type: "person" | "farm" }) { return <svg viewBox="0 0 24 24" className="size-4" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round">{type === "person" ? <><circle cx="12" cy="8" r="3"/><path d="M6 20c.7-4 2.7-6 6-6s5.3 2 6 6"/></> : <><path d="M4 20V9l8-5 8 5v11"/><path d="M8 20v-7h8v7M3 20h18"/></>}</svg>; }
function FieldLabel({ htmlFor, children }: { htmlFor: string; children: React.ReactNode }) { return <label htmlFor={htmlFor} className="mb-1.5 block text-[10px] font-semibold text-foreground">{children}</label>; }
function ErrorText({ id, children }: { id?: string; children: React.ReactNode }) { return <p id={id} className="mt-1 text-[9px] font-semibold text-danger">{children}</p>; }
function PlantMark({ small }: { small?: boolean }) { return <svg viewBox="0 0 48 48" className={small ? "size-5" : "size-full"} fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M24 43V23M24 30C13 30 9 23 9 14c9 0 15 5 15 16ZM24 23C24 12 30 7 39 7c0 9-5 16-15 16Z"/><path d="M14 43h20"/></svg>; }

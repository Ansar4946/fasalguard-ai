"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { FormEvent, useState } from "react";
import { useOnboarding } from "@/features/onboarding/onboarding-provider";
import type { OnboardingData } from "@/features/onboarding/types";
import { BrandLogo } from "@/components/brand/brand-logo";
import { describeGeolocationError } from "@/lib/geo/geolocation";

// Real, complete administrative divisions — the previous list only covered a handful of
// districts per province (e.g. 5 of Punjab's 36), so most farmers couldn't find their own.
const districts: Record<string, string[]> = {
  Punjab: [
    "Attock", "Bahawalnagar", "Bahawalpur", "Bhakkar", "Chakwal", "Chiniot",
    "Dera Ghazi Khan", "Faisalabad", "Gujranwala", "Gujrat", "Hafizabad", "Jhang",
    "Jhelum", "Kasur", "Khanewal", "Khushab", "Lahore", "Layyah", "Lodhran",
    "Mandi Bahauddin", "Mianwali", "Multan", "Muzaffargarh", "Nankana Sahib",
    "Narowal", "Okara", "Pakpattan", "Rahim Yar Khan", "Rajanpur", "Rawalpindi",
    "Sahiwal", "Sargodha", "Sheikhupura", "Sialkot", "Toba Tek Singh", "Vehari",
  ],
  Sindh: [
    "Badin", "Dadu", "Ghotki", "Hyderabad", "Jacobabad", "Jamshoro",
    "Kambar Shahdadkot", "Karachi", "Kashmore", "Khairpur", "Korangi", "Larkana",
    "Matiari", "Mirpur Khas", "Naushahro Feroze", "Sanghar", "Shaheed Benazirabad",
    "Shikarpur", "Sujawal", "Sukkur", "Tando Allahyar", "Tando Muhammad Khan",
    "Tharparkar", "Thatta", "Umerkot",
  ],
  "Khyber Pakhtunkhwa": [
    "Abbottabad", "Bajaur", "Bannu", "Batagram", "Buner", "Charsadda",
    "Chitral Lower", "Chitral Upper", "Dera Ismail Khan", "Hangu", "Haripur",
    "Karak", "Khyber", "Kohat", "Kolai-Palas", "Kurram", "Lakki Marwat",
    "Lower Dir", "Malakand", "Mansehra", "Mardan", "Mohmand", "North Waziristan",
    "Nowshera", "Orakzai", "Peshawar", "Shangla", "South Waziristan", "Swabi",
    "Swat", "Tank", "Torghar", "Upper Dir",
  ],
  Balochistan: [
    "Awaran", "Barkhan", "Chagai", "Chaman", "Dera Bugti", "Duki", "Gwadar",
    "Harnai", "Jafarabad", "Jhal Magsi", "Kacchi", "Kalat", "Kech", "Kharan",
    "Khuzdar", "Killa Abdullah", "Killa Saifullah", "Kohlu", "Lasbela",
    "Loralai", "Mastung", "Musakhel", "Nasirabad", "Nushki", "Panjgur",
    "Pishin", "Quetta", "Sherani", "Sibi", "Sohbatpur", "Washuk", "Zhob", "Ziarat",
  ],
  "Islamabad Capital Territory": ["Islamabad"],
};

/** Geoapify's district name doesn't always match ours exactly ("Multan District" vs
 * "Multan"). Try an exact match first, then a normalized one, before giving up honestly. */
function matchDistrict(candidates: string[], detected: string): string | null {
  // Geoapify's admin-area suffix isn't consistent — Peshawar comes back "Peshawar District",
  // Karachi comes back "Karachi Division" — strip either before comparing.
  const normalize = (value: string) =>
    value.toLowerCase().replace(/\s*(district|division)$/, "").trim();
  const target = normalize(detected);
  return candidates.find((c) => normalize(c) === target) ?? null;
}

type FarmErrors = Partial<Record<keyof OnboardingData["farm"], string>>;

export function FarmDetails() {
  const { data, updateSection } = useOnboarding();
  const draft = data.farm;
  const router = useRouter();
  const [errors, setErrors] = useState<FarmErrors>({});
  const [locating, setLocating] = useState(false);
  const [locateError, setLocateError] = useState("");

  function useCurrentLocation(): void {
    if (!("geolocation" in navigator)) {
      setLocateError("Your browser doesn't support location detection.");
      return;
    }
    setLocating(true);
    setLocateError("");
    navigator.geolocation.getCurrentPosition(
      (position) => {
        fetch(`/api/geocode/reverse?lat=${position.coords.latitude}&lon=${position.coords.longitude}`)
          .then((res) => (res.ok ? res.json() : null))
          .then((result: { province?: string | null; district?: string | null } | null) => {
            const provinceKey = result?.province
              ? Object.keys(districts).find(
                  (p) => p.toLowerCase() === result.province!.toLowerCase(),
                )
              : undefined;
            if (!provinceKey) {
              setLocateError("Couldn't match your location to a listed province — select it manually.");
              return;
            }
            update("province", provinceKey);
            const matchedDistrict = result?.district
              ? matchDistrict(districts[provinceKey]!, result.district)
              : null;
            update("district", matchedDistrict ?? "");
            if (!matchedDistrict)
              setLocateError(`Set province to ${provinceKey} — select your district manually.`);
          })
          .catch(() => setLocateError("Couldn't look up your location — select it manually."))
          .finally(() => setLocating(false));
      },
      (error) => {
        setLocating(false);
        setLocateError(describeGeolocationError(error));
      },
      { enableHighAccuracy: true, timeout: 10_000 },
    );
  }

  function update<K extends keyof OnboardingData["farm"]>(
    key: K,
    value: OnboardingData["farm"][K],
  ) {
    updateSection("farm", { [key]: value });
    setErrors((current) => ({ ...current, [key]: undefined }));
  }

  function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const nextErrors: FarmErrors = {};
    if (!draft.experienceYears)
      nextErrors.experienceYears = "Select your farming experience.";
    if (!draft.province) nextErrors.province = "Select a province.";
    if (!draft.district.trim()) nextErrors.district = "Select a district.";
    if (draft.farmName.trim().length < 2)
      nextErrors.farmName = "Enter a farm name.";
    const size = Number(draft.farmSizeAcres);
    if (
      !draft.farmSizeAcres ||
      !Number.isFinite(size) ||
      size <= 0 ||
      size > 100000
    )
      nextErrors.farmSizeAcres = "Enter a valid area greater than 0 acres.";
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
          <div className="flex items-center justify-between">
            <Link
              href="/onboarding/personal"
              className="flex items-center gap-2 text-sm font-bold text-brand-dark"
            >
              <BrandLogo className="h-auto w-36" />
            </Link>
            <Link
              href="/dashboard"
              className="min-h-9 content-center rounded-lg px-3 text-[10px] font-semibold text-muted hover:bg-white"
            >
              Save &amp; Exit
            </Link>
          </div>
          <div className="mt-3 h-1.5 overflow-hidden rounded-full bg-[#dce8f3]">
            <div className="h-full w-2/5 rounded-full bg-brand shadow-[0_0_10px_rgba(7,95,61,.18)]" />
          </div>
          <div className="mt-2 flex justify-between text-[10px] font-semibold">
            <span className="text-brand-dark">
              Experience &amp; Farm Details
            </span>
            <span className="text-muted">40% Complete</span>
          </div>
        </header>

        <form
          noValidate
          onSubmit={submit}
          className="mt-4 grid min-w-0 gap-4 lg:grid-cols-12"
        >
          <section
            className="min-w-0 rounded-2xl border border-brand/10 bg-white p-4 shadow-[0_10px_30px_rgba(15,45,32,.05)] min-[400px]:p-5 lg:col-span-7"
            aria-labelledby="experience-heading"
          >
            <SectionTitle
              icon="person"
              title="Your Experience"
              subtitle="Tell us about your agricultural background."
              id="experience-heading"
            />
            <div className="mt-5">
              <FieldLabel htmlFor="experience">Years of experience</FieldLabel>
              <select
                id="experience"
                value={draft.experienceYears}
                onChange={(event) =>
                  update("experienceYears", event.target.value)
                }
                aria-invalid={Boolean(errors.experienceYears)}
                aria-describedby={
                  errors.experienceYears ? "experience-error" : undefined
                }
                className={`h-10 w-full rounded-lg border bg-[#f7f8fc] px-3 text-[11px] outline-none focus:border-brand ${errors.experienceYears ? "border-danger" : "border-[#ccd6cf]"}`}
              >
                <option value="">Select duration</option>
                <option value="new">Less than 1 year</option>
                <option value="1-5">1–5 years</option>
                <option value="6-10">6–10 years</option>
                <option value="11+">More than 10 years</option>
              </select>
              {errors.experienceYears && (
                <ErrorText id="experience-error">
                  {errors.experienceYears}
                </ErrorText>
              )}
            </div>
            <div className="mt-4 flex items-center justify-between gap-2">
              <p className="text-[10px] font-semibold text-foreground">Province &amp; district</p>
              <button
                type="button"
                onClick={useCurrentLocation}
                disabled={locating}
                className="flex h-8 shrink-0 items-center gap-1.5 rounded-lg border border-[#ccd6cf] bg-[#f7f8fc] px-2.5 text-[9px] font-bold text-brand-dark hover:bg-brand-soft disabled:opacity-60"
              >
                <svg aria-hidden="true" viewBox="0 0 24 24" className="size-3" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round">
                  <path d="M12 21s7-6.5 7-12a7 7 0 1 0-14 0c0 5.5 7 12 7 12Z" />
                  <circle cx="12" cy="9" r="2.5" />
                </svg>
                {locating ? "Locating…" : "Use my location"}
              </button>
            </div>
            {locateError && (
              <p className="mt-1 text-[9px] font-semibold text-amber-700">{locateError}</p>
            )}
            <div className="mt-2 grid min-w-0 gap-3 sm:grid-cols-2">
              <div>
                <FieldLabel htmlFor="province">Province</FieldLabel>
                <select
                  id="province"
                  value={draft.province}
                  onChange={(event) => {
                    update("province", event.target.value);
                    update("district", "");
                  }}
                  className="h-10 w-full rounded-lg border border-[#ccd6cf] bg-[#f7f8fc] px-3 text-[11px] outline-none focus:border-brand"
                >
                  {Object.keys(districts).map((item) => (
                    <option key={item}>{item}</option>
                  ))}
                </select>
              </div>
              <div>
                <FieldLabel htmlFor="district">District</FieldLabel>
                <select
                  id="district"
                  value={draft.district}
                  onChange={(event) => update("district", event.target.value)}
                  aria-invalid={Boolean(errors.district)}
                  aria-describedby={
                    errors.district ? "district-error" : undefined
                  }
                  className={`h-10 w-full rounded-lg border bg-[#f7f8fc] px-3 text-[11px] outline-none focus:border-brand ${errors.district ? "border-danger" : "border-[#ccd6cf]"}`}
                >
                  <option value="">Select district</option>
                  {districts[draft.province]?.map((item) => (
                    <option key={item}>{item}</option>
                  ))}
                </select>
                {errors.district && (
                  <ErrorText id="district-error">{errors.district}</ErrorText>
                )}
              </div>
            </div>
            <div className="mt-5 rounded-xl border border-brand/10 bg-surface-soft px-4 py-3">
              <p className="text-[10px] font-bold text-brand-dark">
                Crop selection comes next
              </p>
              <p className="mt-1 text-[9px] leading-4 text-muted">
                Choose the crop currently planted in your first field on the
                next screen. This keeps farm experience separate from active
                crop data.
              </p>
            </div>
          </section>

          <div className="min-w-0 space-y-3 lg:col-span-5">
            <section
              className="rounded-2xl border border-brand/10 bg-white p-5 shadow-[0_10px_30px_rgba(15,45,32,.05)]"
              aria-labelledby="farm-heading"
            >
              <SectionTitle
                icon="farm"
                title="First Farm"
                subtitle="You can add more farms later."
                id="farm-heading"
              />
              <div className="mt-5">
                <FieldLabel htmlFor="farmName">Farm name</FieldLabel>
                <input
                  id="farmName"
                  value={draft.farmName}
                  onChange={(event) => update("farmName", event.target.value)}
                  autoComplete="organization"
                  aria-invalid={Boolean(errors.farmName)}
                  aria-describedby={
                    errors.farmName ? "farm-name-error" : undefined
                  }
                  placeholder="e.g. Golden Acres"
                  className={`h-10 w-full rounded-lg border bg-[#f7f8fc] px-3 text-[11px] outline-none focus:border-brand ${errors.farmName ? "border-danger" : "border-[#ccd6cf]"}`}
                />
                {errors.farmName && (
                  <ErrorText id="farm-name-error">{errors.farmName}</ErrorText>
                )}
              </div>
              <div className="mt-4">
                <FieldLabel htmlFor="farmSizeAcres">
                  Farm size (acres)
                </FieldLabel>
                <input
                  id="farmSizeAcres"
                  value={draft.farmSizeAcres}
                  onChange={(event) =>
                    update("farmSizeAcres", event.target.value)
                  }
                  type="number"
                  inputMode="decimal"
                  min="0.1"
                  step="0.1"
                  aria-invalid={Boolean(errors.farmSizeAcres)}
                  aria-describedby={
                    errors.farmSizeAcres ? "farm-size-error" : undefined
                  }
                  placeholder="0.0"
                  className={`h-10 w-full rounded-lg border bg-[#f7f8fc] px-3 text-[11px] outline-none focus:border-brand ${errors.farmSizeAcres ? "border-danger" : "border-[#ccd6cf]"}`}
                />
                {errors.farmSizeAcres && (
                  <ErrorText id="farm-size-error">
                    {errors.farmSizeAcres}
                  </ErrorText>
                )}
              </div>
              <div className="mt-5 rounded-xl bg-brand p-4 text-center text-white">
                <p className="text-xs font-semibold italic leading-5">
                  “Precision monitoring starts with accurate farm mapping.”
                </p>
              </div>
            </section>
            <aside className="flex gap-3 rounded-xl border border-amber-200 bg-[#fff7dd] p-3">
              <span className="grid size-7 shrink-0 place-items-center rounded-full bg-white text-sm text-amber-700">
                !
              </span>
              <p className="text-[9px] leading-4 text-amber-950/75">
                Correct farm size helps our AI estimate local weather and
                disease alerts more accurately.
              </p>
            </aside>
          </div>

          <div className="flex flex-col-reverse gap-2 pt-1 min-[400px]:flex-row min-[400px]:items-center min-[400px]:justify-between md:col-span-12">
            <Link
              href="/onboarding/personal"
              className="inline-flex min-h-11 items-center justify-center gap-2 rounded-full px-4 text-[10px] font-bold text-brand hover:bg-white"
            >
              ← Back
            </Link>
            <button
              type="submit"
              className="inline-flex min-h-11 items-center justify-center gap-2 rounded-full bg-brand px-7 text-xs font-bold text-white shadow-lg shadow-green-900/15 transition hover:-translate-y-0.5 hover:bg-brand-dark"
            >
              Continue →
            </button>
          </div>
        </form>
      </div>
    </main>
  );
}

function SectionTitle({
  icon,
  title,
  subtitle,
  id,
}: {
  icon: "person" | "farm";
  title: string;
  subtitle: string;
  id: string;
}) {
  return (
    <div className="flex items-center gap-3">
      <span className="grid size-8 place-items-center rounded-full bg-brand-soft text-brand">
        <SectionIcon type={icon} />
      </span>
      <div>
        <h2 id={id} className="text-sm font-bold text-brand-dark">
          {title}
        </h2>
        <p className="mt-0.5 text-[9px] text-muted">{subtitle}</p>
      </div>
    </div>
  );
}
function SectionIcon({ type }: { type: "person" | "farm" }) {
  return (
    <svg
      viewBox="0 0 24 24"
      className="size-4"
      fill="none"
      stroke="currentColor"
      strokeWidth="1.8"
      strokeLinecap="round"
      strokeLinejoin="round"
    >
      {type === "person" ? (
        <>
          <circle cx="12" cy="8" r="3" />
          <path d="M6 20c.7-4 2.7-6 6-6s5.3 2 6 6" />
        </>
      ) : (
        <>
          <path d="M4 20V9l8-5 8 5v11" />
          <path d="M8 20v-7h8v7M3 20h18" />
        </>
      )}
    </svg>
  );
}
function FieldLabel({
  htmlFor,
  children,
}: {
  htmlFor: string;
  children: React.ReactNode;
}) {
  return (
    <label
      htmlFor={htmlFor}
      className="mb-1.5 block text-[10px] font-semibold text-foreground"
    >
      {children}
    </label>
  );
}
function ErrorText({
  id,
  children,
}: {
  id?: string;
  children: React.ReactNode;
}) {
  return (
    <p id={id} className="mt-1 text-[9px] font-semibold text-danger">
      {children}
    </p>
  );
}

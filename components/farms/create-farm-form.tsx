"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { FormEvent, useState } from "react";
import { BoundaryPicker } from "@/components/farms/boundary-picker";
import { toGeoJsonPolygon } from "@/lib/geo/polygon";

const inputClass =
  "h-10 w-full rounded-lg border border-[#ccd6cf] bg-[#f7f8fc] px-3 text-[11px] outline-none focus:border-brand";

export function CreateFarmForm() {
  const router = useRouter();
  const [name, setName] = useState("");
  const [province, setProvince] = useState("");
  const [district, setDistrict] = useState("");
  const [tehsil, setTehsil] = useState("");
  const [soilType, setSoilType] = useState("");
  const [irrigationType, setIrrigationType] = useState("");
  const [waterSource, setWaterSource] = useState("");
  const [points, setPoints] = useState<[number, number][]>([]);
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState("");

  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (name.trim().length < 2) {
      setError("Enter a farm name.");
      return;
    }
    if (points.length < 3) {
      setError("Place at least 3 points on the map to draw the farm boundary.");
      return;
    }
    setError("");
    setSubmitting(true);
    try {
      const response = await fetch("/api/farms", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({
          name: name.trim(),
          boundary: toGeoJsonPolygon(points),
          province: province.trim() || undefined,
          district: district.trim() || undefined,
          tehsil: tehsil.trim() || undefined,
          soilType: soilType.trim() || undefined,
          irrigationType: irrigationType.trim() || undefined,
          waterSource: waterSource.trim() || undefined,
        }),
      });
      const body = await response.json().catch(() => ({}));
      if (!response.ok) {
        setError(body.error?.message ?? "Could not create the farm. Try again.");
        return;
      }
      router.push(`/farms/${body.id}`);
      router.refresh();
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <form noValidate onSubmit={submit} className="mt-6 grid gap-4 lg:grid-cols-12">
      <section className="min-w-0 rounded-2xl border border-brand/10 bg-white p-5 shadow-[0_10px_30px_rgba(15,45,32,.05)] lg:col-span-7">
        <h2 className="text-sm font-bold text-brand-dark">Farm boundary</h2>
        <p className="mt-1 text-[10px] text-muted">
          Walk the edge of your farm or use satellite view to place each corner.
        </p>
        <div className="mt-4">
          <BoundaryPicker points={points} onChange={setPoints} />
        </div>
      </section>

      <div className="min-w-0 space-y-4 lg:col-span-5">
        <section className="rounded-2xl border border-brand/10 bg-white p-5 shadow-[0_10px_30px_rgba(15,45,32,.05)]">
          <h2 className="text-sm font-bold text-brand-dark">Farm details</h2>
          <div className="mt-4">
            <label htmlFor="name" className="mb-1.5 block text-[10px] font-semibold text-foreground">
              Farm name
            </label>
            <input
              id="name"
              value={name}
              onChange={(event) => setName(event.target.value)}
              placeholder="e.g. Green Valley Farm"
              className={inputClass}
            />
          </div>
          <div className="mt-3 grid grid-cols-2 gap-3">
            <div>
              <label htmlFor="province" className="mb-1.5 block text-[10px] font-semibold text-foreground">
                Province
              </label>
              <input id="province" value={province} onChange={(event) => setProvince(event.target.value)} className={inputClass} />
            </div>
            <div>
              <label htmlFor="district" className="mb-1.5 block text-[10px] font-semibold text-foreground">
                District
              </label>
              <input id="district" value={district} onChange={(event) => setDistrict(event.target.value)} className={inputClass} />
            </div>
          </div>
          <div className="mt-3">
            <label htmlFor="tehsil" className="mb-1.5 block text-[10px] font-semibold text-foreground">
              Tehsil
            </label>
            <input id="tehsil" value={tehsil} onChange={(event) => setTehsil(event.target.value)} className={inputClass} />
          </div>
          <div className="mt-3 grid grid-cols-2 gap-3">
            <div>
              <label htmlFor="soilType" className="mb-1.5 block text-[10px] font-semibold text-foreground">
                Soil type
              </label>
              <input id="soilType" value={soilType} onChange={(event) => setSoilType(event.target.value)} className={inputClass} />
            </div>
            <div>
              <label htmlFor="irrigationType" className="mb-1.5 block text-[10px] font-semibold text-foreground">
                Irrigation type
              </label>
              <input
                id="irrigationType"
                value={irrigationType}
                onChange={(event) => setIrrigationType(event.target.value)}
                className={inputClass}
              />
            </div>
          </div>
          <div className="mt-3">
            <label htmlFor="waterSource" className="mb-1.5 block text-[10px] font-semibold text-foreground">
              Water source
            </label>
            <input id="waterSource" value={waterSource} onChange={(event) => setWaterSource(event.target.value)} className={inputClass} />
          </div>
        </section>
        {error && (
          <p role="alert" className="rounded-lg border border-danger/20 bg-danger/5 px-3 py-2 text-[10px] font-semibold text-danger">
            {error}
          </p>
        )}
      </div>

      <div className="flex items-center justify-between gap-2 lg:col-span-12">
        <Link href="/farms" className="inline-flex min-h-11 items-center justify-center gap-2 rounded-full px-4 text-[10px] font-bold text-brand hover:bg-white">
          ← Cancel
        </Link>
        <button
          type="submit"
          disabled={submitting}
          className="inline-flex min-h-11 items-center justify-center gap-2 rounded-full bg-brand px-7 text-xs font-bold text-white shadow-lg shadow-green-900/15 transition hover:-translate-y-0.5 hover:bg-brand-dark disabled:opacity-60"
        >
          {submitting ? "Creating farm…" : "Create Farm →"}
        </button>
      </div>
    </form>
  );
}

"use client";

import Link from "next/link";
import { useEffect, useState } from "react";

interface Farm {
  id: string;
  name: string;
}
interface Field {
  id: string;
  farmId: string;
  name: string;
  areaHectares: number;
  currentCropCycle: { cropId: string; growthStage: string | null; status: string } | null;
}

async function getJSON<T>(url: string): Promise<T | null> {
  const res = await fetch(url, { cache: "no-store" });
  if (!res.ok) return null;
  return (await res.json()) as T;
}

export function FieldSelection({
  selectedFieldId,
  onSelect,
}: {
  selectedFieldId: string | null;
  onSelect: (choice: { farmId: string; fieldId: string }) => void;
}) {
  const [farms, setFarms] = useState<Farm[] | null>(null);
  const [fields, setFields] = useState<Field[] | null>(null);

  useEffect(() => {
    getJSON<Farm[]>("/api/farms").then((result) => setFarms(result ?? []));
  }, []);

  useEffect(() => {
    if (!farms?.length) return;
    Promise.all(farms.map((farm) => getJSON<Field[]>(`/api/farms/${farm.id}/fields`))).then((results) => {
      const merged = results.flatMap((list, index) =>
        (list ?? []).map((field) => ({ ...field, farmId: farms[index]!.id })),
      );
      setFields(merged);
      // A scan draft can outlive demo fixtures or a deleted field. Never keep showing the
      // first real field while silently retaining that stale ID in the persisted session.
      if (merged[0] && !merged.some((field) => field.id === selectedFieldId))
        onSelect({ farmId: merged[0].farmId, fieldId: merged[0].id });
    });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [farms]);

  if (farms === null || (farms.length > 0 && fields === null))
    return <div className="rounded-2xl bg-white p-8 text-center text-sm text-muted">Loading your fields…</div>;
  if (farms.length === 0)
    return (
      <div className="rounded-2xl bg-white p-8 text-center">
        <p className="text-sm text-muted">You don&apos;t have a farm yet.</p>
        <Link href="/farms/new" className="mt-3 inline-flex text-sm font-bold text-brand underline">Add a farm</Link>
      </div>
    );
  if (!fields || fields.length === 0)
    return (
      <div className="rounded-2xl bg-white p-8 text-center">
        <p className="text-sm text-muted">None of your farms have a field yet.</p>
        <Link href="/farms" className="mt-3 inline-flex text-sm font-bold text-brand underline">Add a field</Link>
      </div>
    );
  const farmName = (farmId: string) => farms.find((f) => f.id === farmId)?.name ?? "";
  const selected = fields.find((f) => f.id === selectedFieldId) ?? fields[0]!;

  return (
    <div className="grid gap-4 lg:grid-cols-[minmax(0,1fr)_250px]">
      <fieldset>
        <div className="mb-3 flex items-center justify-between">
          <legend className="text-xs font-extrabold text-brand">Step 1: Select Field</legend>
          <Link href="/farms" className="text-[10px] font-bold text-brand">Add New Field</Link>
        </div>
        <div className="grid gap-3 sm:grid-cols-2">
          {fields.map((field) => {
            const checked = field.id === selected.id;
            return (
              <label key={field.id} className={`relative min-h-28 cursor-pointer rounded-2xl border bg-white p-4 shadow-sm transition ${checked ? "border-2 border-brand" : "border-brand/10"}`}>
                <input className="sr-only" type="radio" name="field" checked={checked} onChange={() => onSelect({ farmId: field.farmId, fieldId: field.id })} />
                <h2 className={`text-sm font-extrabold ${checked ? "text-brand" : ""}`}>{field.name}</h2>
                <p className="mt-1 text-[9px] text-muted">{farmName(field.farmId)}</p>
                <div className="mt-4 flex gap-2">
                  {field.currentCropCycle?.growthStage && (
                    <span className="rounded-full bg-blue-50 px-2 py-1 text-[8px] font-bold uppercase text-info">{field.currentCropCycle.growthStage}</span>
                  )}
                  <span className="rounded-full bg-brand-soft px-2 py-1 text-[8px] font-bold uppercase text-brand">{field.areaHectares.toFixed(1)} ha</span>
                </div>
                <span className={`absolute right-3 top-3 grid size-5 place-items-center rounded-full border text-[9px] ${checked ? "border-brand bg-brand text-white" : "border-border"}`}>{checked ? "✓" : ""}</span>
              </label>
            );
          })}
        </div>
      </fieldset>
      <aside aria-live="polite" className="h-fit rounded-2xl border border-brand/10 bg-white p-4 shadow-sm">
        <div className="flex items-center gap-3">
          <span className="grid size-10 place-items-center rounded-xl bg-brand-soft text-brand">
            <svg viewBox="0 0 24 24" className="size-5" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true"><path d="M4 20V9l8-5 8 5v11" /><path d="M8 20v-7h8v7M3 20h18" /></svg>
          </span>
          <div>
            <h2 className="text-sm font-extrabold">Field Summary</h2>
            <p className="text-[9px] text-muted">{selected.name} selected</p>
          </div>
        </div>
        <dl className="mt-4 space-y-3">
          <Summary label="Farm" value={farmName(selected.farmId)} />
          <Summary label="Size" value={`${selected.areaHectares.toFixed(2)} ha`} />
          <Summary label="Crop cycle" value={selected.currentCropCycle ? selected.currentCropCycle.status : "None active"} />
        </dl>
        <p className="mt-4 text-[9px] leading-4 text-muted">The AI will screen images against this field&apos;s real crop cycle, when one is active.</p>
      </aside>
    </div>
  );
}
function Summary({ label, value }: { label: string; value: string }) {
  return <div className="flex items-center justify-between gap-3 text-[10px]"><dt className="text-muted">{label}</dt><dd className="font-extrabold text-brand">{value}</dd></div>;
}

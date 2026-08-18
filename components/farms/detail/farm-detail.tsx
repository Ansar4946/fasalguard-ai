import Link from "next/link";
import { Icon } from "@/components/ui/icon";
import { BoundaryPreview } from "@/components/farms/boundary-preview";
import { DeleteFarmButton } from "@/components/farms/delete-farm-button";
import type { GeoJsonPolygon } from "@/lib/geo/polygon";

export interface FarmDetailData {
  id: string;
  name: string;
  province: string | null;
  district: string | null;
  tehsil: string | null;
  soilType: string | null;
  irrigationType: string | null;
  waterSource: string | null;
  boundary: GeoJsonPolygon;
  areaHectares: number;
}

const HECTARES_TO_ACRES = 2.47105;

export function FarmDetail({ farm }: { farm: FarmDetailData }) {
  const location = [farm.tehsil, farm.district, farm.province].filter(Boolean).join(", ") || "Location not set";
  const acres = (farm.areaHectares * HECTARES_TO_ACRES).toFixed(1);

  return (
    <div className="mx-auto max-w-[1180px] p-4 md:p-6 xl:p-8">
      <header>
        <div className="flex flex-col gap-4 sm:flex-row sm:items-start sm:justify-between">
          <div>
            <nav className="text-xs text-muted">
              <Link href="/farms">My Farms</Link> <span>›</span> <strong className="text-brand">{farm.name}</strong>
            </nav>
            <h1 className="mt-2 text-[28px] font-extrabold leading-tight">{farm.name}</h1>
            <p className="mt-1 text-sm text-muted">⌖ {location}</p>
          </div>
          <div className="flex shrink-0 items-start gap-2">
            <Link
              href={`/farms/${farm.id}/edit`}
              className="inline-flex min-h-10 items-center justify-center gap-2 rounded-full bg-brand px-4 text-xs font-bold text-white transition hover:bg-brand-dark"
            >
              Edit
            </Link>
            <DeleteFarmButton farmId={farm.id} farmName={farm.name} />
          </div>
        </div>
        <section className="mt-6 grid grid-cols-2 gap-3 md:grid-cols-4">
          <Quick icon="field" label="Total Area" value={`${acres} Acres`} tone="blue" />
          <Quick icon="expert" label="Avg Health" value="Not yet available" tone="muted" />
          <Quick icon="radar" label="Irrigation" value={farm.irrigationType ?? "Not set"} tone="amber" />
          <Quick icon="bell" label="Active Alerts" value="No alerts yet" tone="muted" />
        </section>
      </header>

      <nav className="mt-6 flex gap-6 overflow-x-auto border-b border-brand/10 text-xs font-bold">
        <Link href={`/farms/${farm.id}`} className="min-h-11 whitespace-nowrap border-b-2 border-brand pt-3 text-brand">
          Overview
        </Link>
        <Link href={`/farms/${farm.id}/fields`} className="min-h-11 whitespace-nowrap pt-3 text-muted">
          Fields
        </Link>
        <Link href="/satellite" className="min-h-11 whitespace-nowrap pt-3 text-muted">
          Satellite
        </Link>
        <Link href="/weather" className="min-h-11 whitespace-nowrap pt-3 text-muted">
          Weather
        </Link>
      </nav>

      <div className="mt-5 grid gap-5 lg:grid-cols-12">
        <section className="rounded-3xl border border-brand/10 bg-white p-5 shadow-sm lg:col-span-7">
          <div className="flex items-center gap-2">
            <Icon name="farm" className="size-5 text-brand" />
            <h2 className="text-base font-extrabold">Farm Infrastructure</h2>
          </div>
          <div className="mt-5 space-y-3">
            <Infrastructure label="Soil Type" value={farm.soilType ?? "Not set"} />
            <Infrastructure label="Irrigation" value={farm.irrigationType ?? "Not set"} />
            <Infrastructure label="Water Source" value={farm.waterSource ?? "Not set"} />
          </div>
          <div className="mt-5 rounded-2xl border border-dashed border-brand/15 bg-surface-soft p-4 text-center">
            <p className="text-xs font-bold text-brand-dark">Crop distribution</p>
            <p className="mt-1 text-[10px] text-muted">Add fields with crops to see crop distribution here.</p>
          </div>
        </section>

        <section className="overflow-hidden rounded-3xl border border-brand/10 bg-white shadow-sm lg:col-span-5">
          <div className="flex items-center gap-2 border-b border-brand/5 p-5">
            <Icon name="satellite" className="size-5 text-brand" />
            <h2 className="text-base font-extrabold">Farm Boundary</h2>
          </div>
          <div className="p-3">
            <BoundaryPreview boundary={farm.boundary} />
          </div>
        </section>

        <section className="overflow-hidden rounded-3xl border border-brand/10 bg-white shadow-sm lg:col-span-12">
          <div className="flex items-center justify-between border-b border-brand/5 p-5">
            <div className="flex items-center gap-2">
              <Icon name="bell" className="size-5 text-brand" />
              <h2 className="text-base font-extrabold">Intelligence &amp; Alerts</h2>
            </div>
          </div>
          <div className="flex min-h-32 flex-col items-center justify-center gap-2 p-8 text-center">
            <p className="text-xs font-bold text-brand-dark">No alerts yet</p>
            <p className="max-w-sm text-[10px] text-muted">
              Weather, satellite, and crop-health alerts will appear here once monitoring is active for this farm.
            </p>
          </div>
        </section>
      </div>
    </div>
  );
}

function Quick({
  icon,
  label,
  value,
  tone,
}: {
  icon: "field" | "expert" | "radar" | "bell";
  label: string;
  value: string;
  tone: "blue" | "amber" | "muted";
}) {
  const style = tone === "amber" ? "bg-amber-50 text-warning" : tone === "blue" ? "bg-blue-50 text-info" : "bg-surface-soft text-muted";
  return (
    <article className="flex min-h-20 items-center gap-3 rounded-2xl border border-brand/10 bg-white p-4">
      <span className={`grid size-10 shrink-0 place-items-center rounded-xl ${style}`}>
        <Icon name={icon} />
      </span>
      <div>
        <p className="text-[10px] font-bold text-muted">{label}</p>
        <p className="mt-1 text-sm font-extrabold">{value}</p>
      </div>
    </article>
  );
}

function Infrastructure({ label, value }: { label: string; value: string }) {
  return (
    <div className="flex items-center justify-between rounded-xl bg-brand/5 p-3 text-xs">
      <span>{label}</span>
      <strong className="text-brand">{value}</strong>
    </div>
  );
}

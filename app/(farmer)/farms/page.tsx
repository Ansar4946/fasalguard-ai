import type { Metadata } from "next";
import Link from "next/link";
import { Icon } from "@/components/ui/icon";
import { authenticatedJson } from "@/lib/auth/server-session";

export const metadata: Metadata = {
  title: "My Farms",
  description: "Manage farms, fields, crops and health records.",
};

interface FarmSummary {
  id: string;
  name: string;
  province: string | null;
  district: string | null;
  tehsil: string | null;
  soilType: string | null;
  irrigationType: string | null;
  waterSource: string | null;
  areaHectares: number;
  createdAt: string;
}

const HECTARES_TO_ACRES = 2.47105;

export default async function FarmsPage() {
  const { response, body } = await authenticatedJson<FarmSummary[]>("/farms");
  const farms = response.ok && Array.isArray(body) ? body : [];
  const totalAcres = farms.reduce((sum, farm) => sum + farm.areaHectares * HECTARES_TO_ACRES, 0);

  return (
    <div className="mx-auto max-w-[1180px] p-4 md:p-6 xl:p-8">
      <header className="flex flex-col gap-4 sm:flex-row sm:items-end sm:justify-between">
        <div>
          <h1 className="text-[28px] font-extrabold leading-tight text-brand-dark">My Farms</h1>
          <p className="mt-1 text-sm text-muted">Manage farms, fields, crops and health records.</p>
        </div>
        <div className="flex flex-wrap gap-2">
          <Link
            href="/farms/new"
            className="inline-flex min-h-10 items-center gap-2 rounded-full bg-brand px-5 text-xs font-extrabold text-white"
          >
            <Icon name="plus" className="size-4" />
            Add Farm
          </Link>
        </div>
      </header>

      {!response.ok && (
        <p
          role="alert"
          className="mt-6 rounded-xl border border-danger/20 bg-danger/5 px-4 py-3 text-xs font-semibold text-danger"
        >
          Could not load your farms right now. Try refreshing the page.
        </p>
      )}

      {response.ok && farms.length > 0 && (
        <section className="mt-7 grid grid-cols-2 gap-3 md:grid-cols-4">
          <Stat icon="farm" label="Total Farms" value={String(farms.length)} />
          <Stat icon="field" label="Total Area" value={`${totalAcres.toFixed(1)} acres`} />
        </section>
      )}

      {response.ok && farms.length === 0 && (
        <div className="mt-10 flex min-h-56 flex-col items-center justify-center rounded-3xl border border-dashed border-brand/20 bg-white/35 text-center">
          <span className="grid size-11 place-items-center rounded-full bg-brand-soft text-brand">
            <Icon name="farm" />
          </span>
          <strong className="mt-3 text-base text-brand-dark">No farms yet</strong>
          <p className="mt-1 max-w-xs text-xs text-muted">
            Add your first farm and draw its boundary to start monitoring crops and fields.
          </p>
          <Link
            href="/farms/new"
            className="mt-4 inline-flex min-h-10 items-center gap-2 rounded-full bg-brand px-5 text-xs font-extrabold text-white"
          >
            <Icon name="plus" className="size-4" />
            Add Farm
          </Link>
        </div>
      )}

      {farms.length > 0 && (
        <section className="mt-7 space-y-5" aria-label="Your farms">
          {farms.map((farm) => (
            <FarmCard key={farm.id} farm={farm} />
          ))}
        </section>
      )}
    </div>
  );
}

function Stat({ icon, label, value }: { icon: "farm" | "field"; label: string; value: string }) {
  return (
    <article className="flex min-h-24 items-center gap-4 rounded-2xl border border-brand/10 bg-white p-4 shadow-[0_8px_25px_rgba(0,69,45,.04)] sm:p-5">
      <span className="grid size-11 shrink-0 place-items-center rounded-xl bg-brand/5 text-brand">
        <Icon name={icon} />
      </span>
      <div>
        <p className="text-[10px] font-extrabold uppercase tracking-wider text-muted">{label}</p>
        <p className="mt-1 text-xl font-extrabold">{value}</p>
      </div>
    </article>
  );
}

function FarmCard({ farm }: { farm: FarmSummary }) {
  const location =
    [farm.tehsil, farm.district, farm.province].filter(Boolean).join(", ") || "Location not set";
  const acres = (farm.areaHectares * HECTARES_TO_ACRES).toFixed(1);
  return (
    <article className="overflow-hidden rounded-3xl border border-brand/10 bg-white shadow-[0_8px_28px_rgba(0,69,45,.05)] md:flex md:min-h-48">
      <div className="relative flex h-32 items-center justify-center bg-brand-soft md:h-auto md:w-[27%]">
        <Icon name="farm" className="size-8 text-brand" />
      </div>
      <div className="flex flex-1 flex-col justify-between p-5 sm:p-7">
        <div>
          <h2 className="text-xl font-extrabold">{farm.name}</h2>
          <p className="mt-2 text-xs text-muted">
            ⌖ {location} · {acres} acres
          </p>
          {(farm.soilType || farm.irrigationType || farm.waterSource) && (
            <div className="mt-3 flex flex-wrap gap-2">
              {farm.soilType && <Tag>{farm.soilType} soil</Tag>}
              {farm.irrigationType && <Tag>{farm.irrigationType} irrigation</Tag>}
              {farm.waterSource && <Tag>{farm.waterSource}</Tag>}
            </div>
          )}
        </div>
        <div className="mt-5 flex justify-end">
          <Link
            href={`/farms/${farm.id}`}
            className="inline-flex min-h-10 items-center gap-2 rounded-xl bg-brand px-6 text-xs font-extrabold text-white"
          >
            View Farm →
          </Link>
        </div>
      </div>
    </article>
  );
}

function Tag({ children }: { children: React.ReactNode }) {
  return (
    <span className="rounded bg-amber-50 px-2 py-1 text-[10px] font-bold text-amber-900">{children}</span>
  );
}

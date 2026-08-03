import Link from "next/link";

import type { Farm } from "@/features/farms/types";

type FarmCardProps = {
  farm: Farm;
};

function Icon({ children, className = "size-4" }: { children: React.ReactNode; className?: string }) {
  return (
    <svg aria-hidden="true" className={className} fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round">
      {children}
    </svg>
  );
}

function healthDescription(score: number) {
  if (score >= 85) return { label: "Healthy", color: "text-success", bar: "bg-success" };
  if (score >= 65) return { label: "Monitor", color: "text-warning", bar: "bg-warning" };
  return { label: "Needs attention", color: "text-danger", bar: "bg-danger" };
}

export function FarmCard({ farm }: FarmCardProps) {
  const health = healthDescription(farm.healthScore);
  const crops = Array.from(new Set(farm.fields.map((field) => field.crop)));

  return (
    <article className="card overflow-hidden">
      <div className="grid md:grid-cols-[minmax(13rem,28%)_1fr]">
        <div className="relative min-h-44 overflow-hidden bg-[linear-gradient(145deg,#d9f5c7_0%,#8fcf8e_45%,#477d55_100%)] md:min-h-full">
          <div aria-hidden="true" className="absolute inset-0 opacity-45 [background-image:linear-gradient(28deg,transparent_42%,rgba(255,255,255,.8)_43%,rgba(255,255,255,.8)_45%,transparent_46%),linear-gradient(112deg,transparent_48%,rgba(255,255,255,.65)_49%,rgba(255,255,255,.65)_51%,transparent_52%)] [background-size:5rem_4rem,7rem_6rem]" />
          <div className="absolute inset-x-3 bottom-3 flex items-center justify-between gap-2">
            <span className="inline-flex items-center gap-1.5 rounded-full bg-white/90 px-3 py-1.5 text-xs font-bold text-brand-dark shadow-sm backdrop-blur">
              <Icon><path d="M20 10c0 5-8 11-8 11S4 15 4 10a8 8 0 1 1 16 0Z" /><circle cx="12" cy="10" r="2.5" /></Icon>
              {farm.location}
            </span>
            <span className="rounded-full bg-brand-dark/90 px-3 py-1.5 text-xs font-bold text-white">{farm.sizeAcres} acres</span>
          </div>
        </div>

        <div className="flex min-w-0 flex-col p-5 sm:p-6">
          <div className="flex items-start justify-between gap-4">
            <div className="min-w-0">
              <div className="flex flex-wrap items-center gap-2">
                <h2 className="text-xl font-extrabold tracking-tight text-foreground sm:text-2xl">{farm.name}</h2>
                <span className="inline-flex items-center gap-1 rounded-full bg-green-50 px-2.5 py-1 text-[0.7rem] font-extrabold uppercase tracking-wide text-success">
                  <span aria-hidden="true" className="size-1.5 rounded-full bg-success" /> Operational
                </span>
              </div>
              <p className="mt-1 text-sm text-muted">Updated from the latest field records</p>
            </div>
            <button aria-label={`More actions for ${farm.name}`} className="grid size-10 shrink-0 place-items-center rounded-full text-muted transition-colors hover:bg-surface-soft hover:text-foreground" type="button">
              <Icon className="size-5"><circle cx="5" cy="12" r="1" fill="currentColor" /><circle cx="12" cy="12" r="1" fill="currentColor" /><circle cx="19" cy="12" r="1" fill="currentColor" /></Icon>
            </button>
          </div>

          <dl className="mt-5 grid grid-cols-2 gap-x-5 gap-y-4 sm:grid-cols-4">
            <div>
              <dt className="text-xs font-semibold text-muted">Active fields</dt>
              <dd className="mt-1 font-extrabold text-foreground">{farm.fieldCount}</dd>
            </div>
            <div>
              <dt className="text-xs font-semibold text-muted">Active crops</dt>
              <dd className="mt-1 font-extrabold text-foreground">{farm.activeCrops}</dd>
            </div>
            <div>
              <dt className="text-xs font-semibold text-muted">Health score</dt>
              <dd className={`mt-1 font-extrabold tabular-nums ${health.color}`}>{farm.healthScore}%</dd>
            </div>
            <div>
              <dt className="text-xs font-semibold text-muted">Open alerts</dt>
              <dd className={`mt-1 font-extrabold tabular-nums ${farm.alerts ? "text-danger" : "text-success"}`}>{farm.alerts}</dd>
            </div>
          </dl>

          <div className="mt-4 h-1.5 overflow-hidden rounded-full bg-surface-soft" role="img" aria-label={`Farm health: ${health.label}, ${farm.healthScore} percent`}>
            <div className={`h-full rounded-full ${health.bar}`} style={{ width: `${Math.min(100, Math.max(0, farm.healthScore))}%` }} />
          </div>

          <div className="mt-5 flex flex-wrap items-center justify-between gap-4 border-t border-border pt-4">
            <div aria-label="Crops grown" className="flex flex-wrap gap-2">
              {(crops.length ? crops : ["Crop records pending"]).map((crop) => (
                <span className="rounded-lg bg-surface-soft px-2.5 py-1 text-xs font-bold text-brand-dark" key={crop}>{crop}</span>
              ))}
            </div>
            <Link className="inline-flex min-h-11 items-center justify-center gap-2 rounded-xl bg-brand px-5 py-2.5 text-sm font-extrabold text-white shadow-sm transition-colors hover:bg-brand-dark" href={`/farms/${farm.id}`}>
              View farm
              <Icon><path d="m9 18 6-6-6-6" /></Icon>
            </Link>
          </div>
        </div>
      </div>
    </article>
  );
}

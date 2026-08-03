import type { Farm } from "@/features/farms/types";

type FarmStatsProps = {
  farms: Farm[];
};

const numberFormatter = new Intl.NumberFormat("en-PK", {
  maximumFractionDigits: 1,
});

function StatIcon({ name }: { name: "farms" | "area" | "fields" | "alerts" }) {
  const paths = {
    farms: <path d="M4 20V9l8-5 8 5v11M9 20v-6h6v6M3 20h18" />,
    area: <path d="M5 19 19 5M8 5H5v3M16 19h3v-3M14 5h5v5M10 19H5v-5" />,
    fields: <path d="M4 6.5 12 3l8 3.5v11L12 21l-8-3.5v-11ZM12 3v18M4 6.5l8 3.5 8-3.5" />,
    alerts: <path d="M18 8a6 6 0 0 0-12 0c0 7-3 7-3 9h18c0-2-3-2-3-9ZM10 21h4" />,
  } as const;

  return (
    <svg aria-hidden="true" className="size-5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round">
      {paths[name]}
    </svg>
  );
}

export function FarmStats({ farms }: FarmStatsProps) {
  const stats = [
    { label: "Total farms", value: farms.length, icon: "farms" as const, tone: "bg-brand-soft text-brand-dark" },
    { label: "Total area", value: `${numberFormatter.format(farms.reduce((total, farm) => total + farm.sizeAcres, 0))} acres`, icon: "area" as const, tone: "bg-blue-50 text-info" },
    { label: "Active fields", value: farms.reduce((total, farm) => total + farm.fieldCount, 0), icon: "fields" as const, tone: "bg-amber-50 text-warning" },
    { label: "Need attention", value: farms.reduce((total, farm) => total + farm.alerts, 0), icon: "alerts" as const, tone: "bg-red-50 text-danger" },
  ];

  return (
    <dl aria-label="Farm summary" className="grid grid-cols-2 gap-3 lg:grid-cols-4">
      {stats.map((stat) => (
        <div className="card flex min-w-0 items-center gap-3 p-4 sm:p-5" key={stat.label}>
          <span className={`grid size-10 shrink-0 place-items-center rounded-xl ${stat.tone}`}>
            <StatIcon name={stat.icon} />
          </span>
          <div className="min-w-0">
            <dt className="truncate text-xs font-bold uppercase tracking-[0.08em] text-muted">{stat.label}</dt>
            <dd className="mt-1 text-xl font-extrabold tabular-nums text-foreground sm:text-2xl">{stat.value}</dd>
          </div>
        </div>
      ))}
    </dl>
  );
}

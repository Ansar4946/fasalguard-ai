import Link from "next/link";
import { Suspense } from "react";
import { Icon } from "@/components/ui/icon";
import { DashboardTasks } from "./dashboard-tasks";
import { DashboardWeather, DashboardWeatherSkeleton } from "./dashboard-weather";
import { OutbreakRadarMap } from "./outbreak-radar-map";
import type { DashboardAlert, DashboardData, DashboardField, DashboardScan, RiskLevel } from "@/features/dashboard/types";

const riskLabel: Record<RiskLevel, string> = {
  VERY_LOW: "Very low",
  LOW: "Low",
  MODERATE: "Moderate",
  HIGH: "High",
  CRITICAL: "Critical",
};

const riskTone: Record<RiskLevel, string> = {
  VERY_LOW: "text-success",
  LOW: "text-success",
  MODERATE: "text-warning",
  HIGH: "text-danger",
  CRITICAL: "text-danger",
};

const alertHref: Record<DashboardAlert["category"], string> = {
  WEATHER: "/weather",
  SATELLITE: "/satellite",
  OUTBREAK: "/radar",
  DIAGNOSIS: "/scan",
  EXPERT: "/consultations",
};

const scanStatusLabel: Record<string, string> = {
  UPLOADING: "Processing",
  IMAGE_VALIDATION: "Processing",
  ANALYSING: "Processing",
  NEEDS_FOLLOW_UP: "Needs follow-up",
  DIAGNOSED: "Screened",
  EXPERT_REVIEW: "Expert review",
  VERIFIED: "Verified",
  RESOLVED: "Resolved",
};

export function FarmerDashboard({ data }: { data: DashboardData }) {
  const { summary, fields } = data;
  const firstName = data.farmer?.fullName.trim().split(/\s+/)[0];
  const weatherField = fields[0] ? { id: fields[0].id, name: `${fields[0].name} · ${fields[0].farmName}` } : null;
  const topAlert = data.alerts[0];

  return (
    <div className="mx-auto max-w-[1180px] p-4 md:p-6 xl:p-7">
      <header className="mb-5 flex flex-col gap-3 sm:flex-row sm:items-end sm:justify-between">
        <div>
          <h1 className="text-[26px] font-extrabold leading-tight text-brand-dark">
            {firstName ? `Welcome back, ${firstName}` : "Welcome back"}
          </h1>
          <p className="mt-1 text-xs text-muted">Here is the latest health status of your farms.</p>
        </div>
        <div className="flex gap-2">
          <Link href={summary.farmCount ? "/fields" : "/farms/new"} className="inline-flex min-h-10 items-center rounded-xl border border-brand px-4 text-xs font-extrabold text-brand">
            {summary.farmCount ? "Add field" : "Add farm"}
          </Link>
          <Link href="/scan" className="inline-flex min-h-10 items-center rounded-xl bg-brand px-4 text-xs font-extrabold text-white">Scan crop</Link>
        </div>
      </header>

      <section className="grid grid-cols-2 gap-3 md:grid-cols-5">
        <Summary label="Active farms" value={String(summary.farmCount)} />
        <Summary label="Active fields" value={String(summary.fieldCount)} />
        <Summary label="Avg. health" value={summary.averageHealthScore === null ? "–" : `${summary.averageHealthScore}%`} ring />
        <Summary label="Nearby outbreaks" value={String(summary.nearbyOutbreakCount)} danger={summary.nearbyOutbreakCount > 0} />
        <Summary label="Pending tasks" value={String(summary.pendingTaskCount)} />
      </section>

      {summary.farmCount === 0 && <GetStarted />}

      <div className="mt-4 grid gap-4 xl:grid-cols-[minmax(0,2fr)_minmax(245px,.82fr)]">
        <div className="space-y-4">
          <FieldHealthOverview fields={fields} />
          {topAlert && <AlertBanner alert={topAlert} more={summary.unreadAlertCount - 1} />}
          <section className="overflow-hidden rounded-2xl border border-border bg-white shadow-sm">
            <div className="flex items-center justify-between p-4">
              <div>
                <h2 className="text-sm font-extrabold">Farm Outbreak Radar</h2>
                <p className="text-[10px] text-muted">Community-reported outbreaks within {data.outbreakRadiusKm} km of your fields</p>
              </div>
              <div className="flex gap-3 text-[10px]">
                <span className="text-brand">● Your farms</span>
                <span className="text-danger">● Outbreak area</span>
              </div>
            </div>
            {data.farms.length ? (
              <OutbreakRadarMap farms={data.farms} outbreaks={data.nearbyOutbreaks} radiusKm={data.outbreakRadiusKm} />
            ) : (
              <p className="px-4 pb-5 text-xs text-muted">Add a farm boundary to monitor outbreaks around it.</p>
            )}
            {data.nearbyOutbreaks.length > 0 && (
              <ul className="divide-y divide-border border-t border-border">
                {data.nearbyOutbreaks.slice(0, 3).map((outbreak) => (
                  <li key={outbreak.id} className="flex items-center justify-between px-4 py-3 text-xs">
                    <span><strong>{outbreak.conditionFamily}</strong> <span className="text-muted">· {outbreak.crop}</span></span>
                    <span className="text-[10px] font-bold text-muted">{outbreak.distanceKm} km · {titleCase(outbreak.status)}</span>
                  </li>
                ))}
              </ul>
            )}
          </section>
        </div>

        <aside className="space-y-4">
          <DashboardTasks key={data.generatedAt} tasks={data.tasks} pendingCount={summary.pendingTaskCount} />
          <RecentScans scans={data.recentScans} />
          <Suspense fallback={<DashboardWeatherSkeleton />}>
            <DashboardWeather field={weatherField} />
          </Suspense>
        </aside>
      </div>
    </div>
  );
}

function FieldHealthOverview({ fields }: { fields: DashboardField[] }) {
  return (
    <section className="rounded-2xl border border-border bg-white p-5 shadow-sm">
      <div className="flex items-center justify-between">
        <h2 className="text-sm font-extrabold">Field Health Overview</h2>
        <Link href="/fields" className="text-[11px] font-bold text-brand">View all →</Link>
      </div>
      {fields.length === 0 ? (
        <p className="mt-4 text-xs text-muted">No fields yet. Add fields to your farm to start satellite and weather monitoring.</p>
      ) : (
        <>
          <div className="mt-4 hidden grid-cols-[1.2fr_.8fr_.8fr_.8fr_auto] gap-3 border-b border-border pb-2 text-[9px] font-extrabold uppercase tracking-wide text-muted sm:grid">
            <span>Field name</span><span>Crop</span><span>Health score</span><span>Risk</span><span>Action</span>
          </div>
          <div>
            {fields.slice(0, 6).map((field) => (
              <div key={field.id} className="grid grid-cols-[1fr_auto] gap-3 border-b border-border py-3 text-xs last:border-0 sm:grid-cols-[1.2fr_.8fr_.8fr_.8fr_auto]">
                <div>
                  <strong>{field.name}</strong>
                  <p className="text-[10px] text-muted">{field.farmName} · {field.lastScanAt ? `Last scan ${relativeTime(field.lastScanAt)}` : "No scans yet"}</p>
                </div>
                <span className="hidden sm:block">{field.cropName ?? <span className="text-muted">No crop set</span>}</span>
                <HealthScore score={field.healthScore} />
                <span className={`hidden font-bold sm:block ${field.riskLevel ? riskTone[field.riskLevel] : "font-normal text-muted"}`}>
                  {field.riskLevel ? riskLabel[field.riskLevel] : "Not assessed"}
                </span>
                <Link href={`/farms/${field.farmId}/fields`} className="font-bold text-brand">View</Link>
              </div>
            ))}
          </div>
        </>
      )}
    </section>
  );
}

function HealthScore({ score }: { score: number | null }) {
  if (score === null) return <span className="hidden text-muted sm:block">Awaiting satellite</span>;
  const rounded = Math.round(score);
  const color = rounded >= 70 ? "bg-success" : rounded >= 50 ? "bg-warning" : "bg-danger";
  return (
    <div className="hidden items-center gap-2 sm:flex">
      <span className="h-1.5 w-16 rounded bg-border"><span className={`block h-1.5 rounded ${color}`} style={{ width: `${rounded}%` }} /></span>
      <strong>{rounded}%</strong>
    </div>
  );
}

function AlertBanner({ alert, more }: { alert: DashboardAlert; more: number }) {
  return (
    <section className="rounded-2xl bg-[#a96300] p-5 text-white shadow-sm">
      <div className="flex gap-4">
        <div className="grid size-10 shrink-0 place-items-center rounded-full bg-white/15 text-xl">!</div>
        <div>
          <p className="text-[10px] font-bold uppercase tracking-wider text-amber-100">{titleCase(alert.category)} alert · {relativeTime(alert.createdAt)}</p>
          <h2 className="mt-1 text-base font-extrabold">{alert.title}</h2>
          <p className="mt-1 max-w-xl text-xs leading-5 text-white/80">{alert.body}</p>
          <div className="mt-4 flex flex-wrap gap-2">
            <Link href={alertHref[alert.category]} className="rounded-lg bg-white/15 px-3 py-2 text-[11px] font-bold">View details</Link>
            {more > 0 && <Link href="/alerts" className="rounded-lg bg-white/15 px-3 py-2 text-[11px] font-bold">{more} more unread</Link>}
          </div>
        </div>
      </div>
    </section>
  );
}

function RecentScans({ scans }: { scans: DashboardScan[] }) {
  return (
    <section className="rounded-2xl border border-border bg-white p-5 shadow-sm">
      <h2 className="text-sm font-extrabold">Recent AI Scans</h2>
      {scans.length === 0 ? (
        <p className="mt-4 text-xs leading-5 text-muted">No crop scans yet. Photograph a leaf to screen it for disease.</p>
      ) : (
        <ul className="mt-4 space-y-3">
          {scans.map((scan) => (
            <li key={scan.id}>
              <Link href={`/scan/results?id=${scan.id}`} className="flex gap-3 rounded-xl bg-surface-soft p-2 transition hover:bg-brand-soft/60 active:scale-[.99]">
              <span className="grid size-12 shrink-0 place-items-center rounded-lg bg-brand-soft text-brand"><Icon name="scan" /></span>
              <div className="min-w-0 flex-1">
                <div className="flex justify-between gap-2">
                  <strong className="truncate text-xs">{scan.screenedCondition ? titleCase(scan.screenedCondition) : "Awaiting result"}</strong>
                  <span className="shrink-0 rounded bg-brand-soft px-1.5 py-0.5 text-[8px] font-bold text-brand">{scanStatusLabel[scan.status] ?? titleCase(scan.status)}</span>
                </div>
                <p className="mt-1 text-[10px] text-muted">{scan.fieldName ?? "No field"} · {relativeTime(scan.createdAt)}</p>
                <p className="mt-1 text-[9px] text-muted">
                  AI screening{typeof scan.confidence === "number" ? ` · ${Math.round(scan.confidence * 100)}% confidence` : ""} — not a confirmed diagnosis
                </p>
              </div>
              </Link>
            </li>
          ))}
        </ul>
      )}
      <Link href="/scan" className="mt-4 block text-center text-[11px] font-bold text-brand">Start a new scan</Link>
    </section>
  );
}

function GetStarted() {
  return (
    <section className="mt-4 flex flex-col items-start gap-3 rounded-2xl border border-dashed border-brand/30 bg-brand-soft/40 p-5 sm:flex-row sm:items-center sm:justify-between">
      <div>
        <h2 className="text-sm font-extrabold text-brand-dark">Set up your first farm</h2>
        <p className="mt-1 text-xs text-muted">Draw your farm boundary to unlock satellite health, weather and outbreak monitoring.</p>
      </div>
      <Link href="/farms/new" className="inline-flex min-h-10 items-center rounded-xl bg-brand px-4 text-xs font-extrabold text-white">Add farm</Link>
    </section>
  );
}

function Summary({ label, value, ring, danger }: { label: string; value: string; ring?: boolean; danger?: boolean }) {
  return (
    <div className={`rounded-2xl border p-4 shadow-sm ${danger ? "border-red-100 bg-red-50" : "border-border bg-white"}`}>
      <p className="text-[10px] font-bold text-muted">{label}</p>
      {ring ? (
        <div className="mt-2 grid size-14 place-items-center rounded-full border-[6px] border-brand-soft border-t-brand text-sm font-extrabold">{value}</div>
      ) : (
        <p className={`mt-4 text-2xl font-extrabold ${danger ? "text-danger" : "text-brand-dark"}`}>{value}</p>
      )}
    </div>
  );
}

function titleCase(value: string): string {
  const words = value.replace(/[_-]+/g, " ").trim().toLowerCase();
  return words.charAt(0).toUpperCase() + words.slice(1);
}

function relativeTime(iso: string): string {
  const minutes = Math.round((Date.now() - new Date(iso).getTime()) / 60_000);
  if (minutes < 1) return "just now";
  if (minutes < 60) return `${minutes} min ago`;
  const hours = Math.round(minutes / 60);
  if (hours < 24) return `${hours} h ago`;
  const days = Math.round(hours / 24);
  if (days < 30) return `${days} day${days === 1 ? "" : "s"} ago`;
  return new Date(iso).toLocaleDateString(undefined, { day: "numeric", month: "short", year: "numeric" });
}

"use client";

import Link from "next/link";
import { useEffect, useMemo, useRef, useState } from "react";
import { Icon } from "@/components/ui/icon";
import type { GeoJsonPolygon } from "@/lib/geo/polygon";
import { SatelliteMap } from "./satellite-map";
import type { StressZoneMapItem } from "./satellite-map-inner";

interface Farm { id: string; name: string }
interface Field {
  id: string;
  farmId: string;
  name: string;
  boundary: GeoJsonPolygon;
  areaHectares: number;
}
type ProcessingStatus =
  | "QUEUED" | "SEARCHING_SCENE" | "PROCESSING" | "ANALYSING"
  | "COMPLETED" | "NO_VALID_SCENE" | "CLOUD_BLOCKED" | "FAILED";
interface Scan {
  id: string;
  fieldId: string;
  processingStatus: ProcessingStatus;
  acquisitionDate: string | null;
  cloudCoverage: number | null;
  usablePixelPercentage: number | null;
  dataQuality: string;
  createdAt: string;
}
interface LayerItem {
  id: string;
  type: "TRUE_COLOR" | "NDVI" | "NDMI" | "DATA_QUALITY";
  contentType: string;
  access: { url: string; expiresAt: string };
}
interface StatisticEntry {
  index: "NDVI" | "NDMI";
  statistics: { mean: number | null; validPixelPercentage: number; maskedCloudPercentage: number };
}
interface StressZone extends StressZoneMapItem {
  evidence: Record<string, number>;
  createdAt: string;
}
interface Evidence {
  status: string;
  baselineMethod: string;
  observedAt: string | null;
  evidence: {
    diagnosticCapability?: string;
    reason?: string;
    validPixelPercentage?: number;
    minimumValidPixelPercentage?: number;
    observationCount?: number;
  };
}
interface Comparison {
  fieldId: string;
  comparisonBasis: "ROLLING_FIELD_BASELINE" | "PREVIOUS_VALID_OBSERVATION" | "INSUFFICIENT_HISTORY";
  observations: Array<{
    captureId: string;
    acquisitionDate: string;
    healthScore: number | null;
    statistics: { NDVI?: { mean: number | null }; NDMI?: { mean: number | null } };
  }>;
}

const tabs = ["True colour", "Crop health", "Vegetation", "Moisture stress", "Change detection"] as const;
type Tab = (typeof tabs)[number];

const statusLabel: Record<ProcessingStatus, string> = {
  QUEUED: "Queued", SEARCHING_SCENE: "Finding a clear scene", PROCESSING: "Downloading imagery",
  ANALYSING: "Analysing", COMPLETED: "Complete", NO_VALID_SCENE: "No cloud-free scene found",
  CLOUD_BLOCKED: "Too cloudy to analyse", FAILED: "Failed",
};
const terminalStatuses = new Set<ProcessingStatus>(["COMPLETED", "NO_VALID_SCENE", "CLOUD_BLOCKED", "FAILED"]);

async function getJSON<T>(url: string): Promise<T | null> {
  const res = await fetch(url, { cache: "no-store" });
  if (!res.ok) return null;
  return (await res.json()) as T;
}

export function SatelliteWorkspace() {
  const [tab, setTab] = useState<Tab>("Crop health");
  const [farms, setFarms] = useState<Farm[] | null>(null);
  const [pickedFarmId, setPickedFarmId] = useState<string>("");
  const [fieldsByFarm, setFieldsByFarm] = useState<{ farmId: string; fields: Field[] } | null>(null);
  const [pickedFieldId, setPickedFieldId] = useState<string>("");
  const [scansByField, setScansByField] = useState<{ fieldId: string; scans: Scan[] } | null>(null);
  const [pickedScanId, setPickedScanId] = useState<string>("");
  const [detail, setDetail] = useState<{
    scanId: string; layers: LayerItem[]; statistics: StatisticEntry[]; zones: StressZone[]; evidence: Evidence | null;
  } | null>(null);
  const [comparisonByField, setComparisonByField] = useState<{ fieldId: string; comparison: Comparison | null } | null>(null);
  const [pickedZoneId, setPickedZoneId] = useState<string | null>(null);
  const [failedImageUrl, setFailedImageUrl] = useState<string | null>(null);
  const [requesting, setRequesting] = useState(false);
  const pollAttempts = useRef(0);

  const farmId = farms?.some((f) => f.id === pickedFarmId) ? pickedFarmId : (farms?.[0]?.id ?? "");
  const fields = fieldsByFarm?.farmId === farmId ? fieldsByFarm.fields : null;
  const fieldId = fields?.some((f) => f.id === pickedFieldId) ? pickedFieldId : (fields?.[0]?.id ?? "");
  const field = useMemo(() => fields?.find((f) => f.id === fieldId) ?? null, [fields, fieldId]);
  const scans = scansByField?.fieldId === fieldId ? scansByField.scans : null;
  const defaultScan = scans?.length ? (scans.find((s) => s.processingStatus === "COMPLETED") ?? scans[0]) : null;
  const scanId = scans?.some((s) => s.id === pickedScanId) ? pickedScanId : (defaultScan?.id ?? "");
  const scan = useMemo(() => scans?.find((s) => s.id === scanId) ?? null, [scans, scanId]);
  const activeDetail = detail?.scanId === scanId ? detail : null;
  const layers = activeDetail?.layers ?? [];
  const statistics = activeDetail?.statistics ?? [];
  const zones = activeDetail?.zones ?? [];
  const evidence = activeDetail?.evidence ?? null;
  const comparison = comparisonByField?.fieldId === fieldId ? comparisonByField.comparison : null;
  const selectedZoneId = zones.some((z) => z.id === pickedZoneId) ? pickedZoneId : (zones[0]?.id ?? null);
  const trueColor = layers.find((l) => l.type === "TRUE_COLOR");
  const ndvi = statistics.find((s) => s.index === "NDVI");
  const ndmi = statistics.find((s) => s.index === "NDMI");

  useEffect(() => {
    getJSON<Farm[]>("/api/farms").then((result) => setFarms(result ?? []));
  }, []);

  useEffect(() => {
    if (!farmId) return;
    let cancelled = false;
    getJSON<Field[]>(`/api/farms/${farmId}/fields`).then((result) => {
      if (!cancelled) setFieldsByFarm({ farmId, fields: result ?? [] });
    });
    return () => { cancelled = true; };
  }, [farmId]);

  function loadScans(id: string): void {
    getJSON<Scan[]>(`/api/fields/${id}/satellite-scans`).then((result) => {
      setScansByField({ fieldId: id, scans: result ?? [] });
    });
  }

  useEffect(() => {
    if (!fieldId) return;
    let cancelled = false;
    loadScans(fieldId);
    getJSON<Comparison>(`/api/fields/${fieldId}/satellite-comparison`).then((result) => {
      if (!cancelled) setComparisonByField({ fieldId, comparison: result });
    });
    return () => { cancelled = true; };
  }, [fieldId]);

  useEffect(() => {
    if (!scanId || scan?.processingStatus !== "COMPLETED") return;
    let cancelled = false;
    Promise.all([
      getJSON<LayerItem[]>(`/api/satellite-scans/${scanId}/layers`),
      getJSON<StatisticEntry[]>(`/api/satellite-scans/${scanId}/statistics`),
      getJSON<StressZone[]>(`/api/satellite-scans/${scanId}/stress-zones`),
      getJSON<Evidence>(`/api/satellite-scans/${scanId}/evidence`),
    ]).then(([layersResult, statisticsResult, zonesResult, evidenceResult]) => {
      if (cancelled) return;
      setDetail({
        scanId,
        layers: layersResult ?? [],
        statistics: statisticsResult ?? [],
        zones: zonesResult ?? [],
        evidence: evidenceResult,
      });
    });
    return () => { cancelled = true; };
  }, [scanId, scan?.processingStatus]);

  useEffect(() => {
    if (!scan || terminalStatuses.has(scan.processingStatus) || !fieldId) {
      pollAttempts.current = 0;
      return;
    }
    const timer = setTimeout(() => {
      pollAttempts.current += 1;
      if (pollAttempts.current <= 30) loadScans(fieldId);
    }, 4000);
    return () => clearTimeout(timer);
  }, [scan, fieldId]);

  async function requestScan(): Promise<void> {
    if (!fieldId || requesting) return;
    setRequesting(true);
    try {
      const res = await fetch(`/api/fields/${fieldId}/satellite-scans`, {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({}),
      });
      if (res.status === 202) {
        const created = (await res.json()) as Scan;
        setScansByField((prev) => ({
          fieldId,
          scans: [created, ...(prev?.fieldId === fieldId ? prev.scans : [])],
        }));
        setPickedScanId(created.id);
        pollAttempts.current = 0;
      }
    } finally {
      setRequesting(false);
    }
  }

  if (farms === null) return <div className="page-container py-16 text-center text-sm text-muted">Loading your farms…</div>;
  if (farms.length === 0)
    return (
      <div className="page-container space-y-3 py-16 text-center">
        <p className="text-sm text-muted">You don&apos;t have a farm yet.</p>
        <Link href="/farms" className="text-sm font-bold text-brand underline">Add a farm to start monitoring</Link>
      </div>
    );

  return <div className="page-container space-y-5">
    <header className="flex flex-col gap-4 xl:flex-row xl:items-end xl:justify-between">
      <div>
        <p className="flex items-center gap-2 text-xs font-extrabold uppercase tracking-[.16em] text-success"><Icon name="satellite" className="size-4"/>Satellite intelligence</p>
        <h1 className="mt-2 text-3xl font-extrabold text-brand-dark">Farm health monitoring</h1>
        <p className="mt-2 max-w-3xl text-sm text-muted">Track field-level vegetation, moisture and change patterns. Ground inspection is required to determine the exact cause.</p>
      </div>
      <div className="flex flex-wrap gap-2">
        <button type="button" onClick={() => setTab("Change detection")} className="min-h-11 rounded-xl border border-border bg-white px-4 text-xs font-bold">Compare dates</button>
        <button type="button" onClick={requestScan} disabled={!fieldId || requesting} className="min-h-11 rounded-xl bg-brand px-4 text-xs font-extrabold text-white disabled:opacity-50">
          {requesting ? "Requesting…" : "Request latest scan"}
        </button>
      </div>
    </header>

    <section className="card grid gap-3 p-4 sm:grid-cols-2 xl:grid-cols-4">
      <PlainSelect label="Farm" value={farmId} onChange={setPickedFarmId} options={farms.map((f) => ({ value: f.id, label: f.name }))} />
      <PlainSelect label="Field" value={fieldId} onChange={setPickedFieldId} options={(fields ?? []).map((f) => ({ value: f.id, label: f.name }))} placeholder={fields === null ? "Loading…" : fields.length === 0 ? "No fields" : undefined} />
      <PlainSelect
        label="Capture"
        value={scanId}
        onChange={setPickedScanId}
        options={(scans ?? []).map((s) => ({
          value: s.id,
          label: `${s.acquisitionDate ? new Date(s.acquisitionDate).toLocaleDateString() : new Date(s.createdAt).toLocaleDateString()} · ${statusLabel[s.processingStatus]}`,
        }))}
        placeholder={scans === null ? "Loading…" : scans.length === 0 ? "No scans yet" : undefined}
      />
      <div className="text-[10px] font-bold uppercase tracking-wider text-muted">
        Cloud filter
        <div className="mt-2 flex h-11 items-center rounded-xl border border-border bg-surface-soft px-3 text-sm font-semibold normal-case tracking-normal text-foreground">
          Default (&lt;30%)
        </div>
      </div>
    </section>

    {!field ? (
      <section className="card p-8 text-center text-sm text-muted">
        {fields && fields.length === 0 ? (
          <>This farm has no fields yet. <Link href={`/farms/${farmId}`} className="font-bold text-brand underline">Add one</Link> to enable satellite monitoring.</>
        ) : "Select a field to view satellite monitoring."}
      </section>
    ) : !scan ? (
      <section className="card p-8 text-center text-sm text-muted">
        No satellite scans yet for this field. Click <strong>Request latest scan</strong> to run a real Sentinel-2 capture.
      </section>
    ) : (
      <div className="grid gap-5 xl:grid-cols-[minmax(0,1fr)_340px]">
        <section className="overflow-hidden rounded-[20px] border border-brand/10 bg-white shadow-[0_18px_50px_rgba(11,81,55,.09)]">
          <div className="flex gap-2 overflow-x-auto border-b border-border p-3">
            {tabs.map((item) => (
              <button key={item} onClick={() => setTab(item)} className={`min-h-10 whitespace-nowrap rounded-xl px-4 text-xs font-bold ${tab === item ? "bg-brand text-white" : "bg-surface-soft text-muted"}`}>{item}</button>
            ))}
          </div>
          <div className="relative h-[440px] sm:h-[560px]">
            {!terminalStatuses.has(scan.processingStatus) ? (
              <div className="flex h-full flex-col items-center justify-center gap-2 text-sm text-muted">
                <span className="size-3 animate-pulse rounded-full bg-brand" aria-hidden="true" />
                {statusLabel[scan.processingStatus]}…
              </div>
            ) : scan.processingStatus === "FAILED" ? (
              <div className="flex h-full items-center justify-center text-sm text-danger">This scan failed. Try requesting a new one.</div>
            ) : scan.processingStatus === "NO_VALID_SCENE" ? (
              <div className="flex h-full items-center justify-center px-8 text-center text-sm text-muted">No cloud-free Sentinel-2 scene was available for this field and date range.</div>
            ) : scan.processingStatus === "CLOUD_BLOCKED" ? (
              <div className="flex h-full items-center justify-center px-8 text-center text-sm text-muted">This capture was too cloudy to analyse reliably ({scan.usablePixelPercentage?.toFixed(0) ?? 0}% usable pixels).</div>
            ) : tab === "True colour" ? (
              trueColor && failedImageUrl !== trueColor.access.url ? (
                // eslint-disable-next-line @next/next/no-img-element
                <img src={trueColor.access.url} alt="True colour satellite capture" className="size-full object-cover" onError={() => setFailedImageUrl(trueColor.access.url)} />
              ) : (
                <div className="flex h-full items-center justify-center px-8 text-center text-sm text-muted">Satellite imagery storage isn&apos;t configured in this environment yet — the field boundary and analysis below are still real.</div>
              )
            ) : tab === "Change detection" ? (
              <ComparisonPanel comparison={comparison} />
            ) : (
              <SatelliteMap boundary={field.boundary} zones={zones} selectedZoneId={selectedZoneId} onSelectZone={setPickedZoneId} />
            )}
          </div>
          {(tab === "Vegetation" || tab === "Moisture stress") && (
            <div className="flex flex-wrap gap-4 border-t border-border p-3 text-xs">
              {tab === "Vegetation" ? (
                <StatChip label="NDVI mean" value={ndvi?.statistics.mean != null ? ndvi.statistics.mean.toFixed(2) : "—"} />
              ) : (
                <StatChip label="NDMI mean" value={ndmi?.statistics.mean != null ? ndmi.statistics.mean.toFixed(2) : "—"} />
              )}
              <StatChip label="Valid pixels" value={`${(tab === "Vegetation" ? ndvi : ndmi)?.statistics.validPixelPercentage.toFixed(0) ?? 0}%`} />
              <StatChip label="Cloud-masked" value={`${(tab === "Vegetation" ? ndvi : ndmi)?.statistics.maskedCloudPercentage.toFixed(0) ?? 0}%`} />
            </div>
          )}
        </section>

        <aside className="space-y-4">
          <SelectedObservationCard scan={scan} zone={zones.find((z) => z.id === selectedZoneId) ?? null} />
          <AiInterpretationCard evidence={evidence} zoneCount={zones.length} />
          <section className="card p-5">
            <h2 className="font-extrabold">Recommended next steps</h2>
            <div className="mt-4 grid gap-2">
              <Action href="/tasks" label="Create inspection task" />
              <Action href="/scan" label="Upload ground-level photo" />
              <Action href="/assistant" label="Ask AI assistant" />
              <Action href="/consultations" label="Request expert review" />
            </div>
          </section>
        </aside>
      </div>
    )}
  </div>;
}

function PlainSelect({ label, value, onChange, options, placeholder }: { label: string; value: string; onChange: (v: string) => void; options: Array<{ value: string; label: string }>; placeholder?: string }) {
  return (
    <label className="text-[10px] font-bold uppercase tracking-wider text-muted">
      {label}
      <select
        className="mt-2 h-11 w-full rounded-xl border border-border bg-surface-soft px-3 text-sm font-semibold normal-case tracking-normal text-foreground disabled:opacity-60"
        value={value}
        disabled={options.length === 0}
        onChange={(e) => onChange(e.target.value)}
      >
        {options.length === 0 && <option value="">{placeholder ?? "—"}</option>}
        {options.map((o) => <option key={o.value} value={o.value}>{o.label}</option>)}
      </select>
    </label>
  );
}
function StatChip({ label, value }: { label: string; value: string }) {
  return <div className="rounded-lg bg-surface-soft px-3 py-2"><div className="text-[9px] font-bold uppercase tracking-wider text-muted">{label}</div><div className="mt-0.5 font-extrabold text-brand-dark">{value}</div></div>;
}
function Metric({ label, value }: { label: string; value: string }) {
  return <div className="rounded-xl bg-white/10 p-3"><dt className="text-[9px] text-white/60">{label}</dt><dd className="mt-1 text-sm font-extrabold">{value}</dd></div>;
}
function Action({ href, label }: { href: string; label: string }) {
  return <Link href={href} className="flex min-h-11 items-center justify-between rounded-xl bg-surface-soft px-4 text-xs font-bold text-brand-dark"><span>{label}</span><span aria-hidden>→</span></Link>;
}

function SelectedObservationCard({ scan, zone }: { scan: Scan; zone: StressZone | null }) {
  const captureDate = scan.acquisitionDate ? new Date(scan.acquisitionDate).toLocaleDateString() : "—";
  return (
    <section className="rounded-[20px] bg-brand p-5 text-white shadow-lg">
      <p className="text-[10px] font-bold uppercase tracking-wider text-white/65">{zone ? "Selected zone" : "Selected capture"}</p>
      <h2 className="mt-2 text-xl font-extrabold">{zone ? zone.label.replace(/_/g, " ") : `Capture · ${captureDate}`}</h2>
      <p className="mt-2 text-sm leading-6 text-white/80">
        {zone ? "Satellite data flagged this zone relative to the field's own history — ground inspection is needed to confirm the cause." : "No stress zones were flagged in this capture."}
      </p>
      <dl className="mt-5 grid grid-cols-2 gap-3">
        {zone ? (
          <>
            <Metric label="Area" value={`${zone.areaHectares.toFixed(2)} ha`} />
            <Metric label="Score" value={zone.score.toFixed(0)} />
          </>
        ) : (
          <>
            <Metric label="Data quality" value={scan.dataQuality} />
            <Metric label="Valid pixels" value={scan.usablePixelPercentage != null ? `${scan.usablePixelPercentage.toFixed(0)}%` : "—"} />
          </>
        )}
        <Metric label="Capture" value={captureDate} />
        <Metric label="Cloud" value={scan.cloudCoverage != null ? `${scan.cloudCoverage.toFixed(0)}%` : "—"} />
      </dl>
    </section>
  );
}

function AiInterpretationCard({ evidence, zoneCount }: { evidence: Evidence | null; zoneCount: number }) {
  if (!evidence)
    return <section className="card p-5"><h2 className="font-extrabold">AI interpretation</h2><p className="mt-3 text-sm text-muted">No AI interpretation available for this capture yet.</p></section>;
  const ev = evidence.evidence;
  const isBlocked = evidence.status === "QUALITY_BLOCKED";
  const isInsufficient = evidence.status === "INSUFFICIENT_HISTORY";
  return (
    <section className="card p-5">
      <div className="flex items-center justify-between">
        <h2 className="font-extrabold">AI interpretation</h2>
        {!isBlocked && <span className="rounded-full bg-brand-soft px-2.5 py-1 text-[9px] font-bold text-brand">{zoneCount} zone{zoneCount === 1 ? "" : "s"} flagged</span>}
      </div>
      <p className="mt-3 text-sm leading-6 text-muted">
        {isBlocked
          ? `Not enough clear pixels to analyse this capture (${ev.validPixelPercentage?.toFixed(0) ?? 0}% valid, ${ev.minimumValidPixelPercentage ?? 20}% required).`
          : isInsufficient
            ? `Not enough capture history yet for this field to establish a baseline (${ev.observationCount ?? 0} prior observation${ev.observationCount === 1 ? "" : "s"}). Zones shown use absolute thresholds only.`
            : zoneCount > 0
              ? `Satellite data flagged ${zoneCount} zone${zoneCount === 1 ? "" : "s"} relative to this field's rolling history.`
              : "No unusual vegetation or moisture patterns were flagged against this field's history."}
      </p>
      <div className="mt-4 rounded-xl border border-amber-200 bg-amber-50 p-3 text-xs leading-5 text-amber-900">
        <strong>Important limitation:</strong> this may reflect water, nutrient, pest or crop-health stress. Satellite imagery does not confirm a disease.
      </div>
    </section>
  );
}

function ComparisonPanel({ comparison }: { comparison: Comparison | null }) {
  if (!comparison || comparison.observations.length === 0)
    return <div className="flex h-full items-center justify-center px-8 text-center text-sm text-muted">No completed captures yet to compare.</div>;
  if (comparison.comparisonBasis === "INSUFFICIENT_HISTORY")
    return <div className="flex h-full items-center justify-center px-8 text-center text-sm text-muted">Only {comparison.observations.length} completed capture{comparison.observations.length === 1 ? "" : "s"} so far — need at least 2 for a comparison.</div>;
  return (
    <div className="h-full overflow-y-auto p-4">
      <p className="mb-3 text-[10px] font-bold uppercase tracking-wider text-muted">{comparison.comparisonBasis.replace(/_/g, " ")}</p>
      <ul className="space-y-2">
        {comparison.observations.map((obs) => (
          <li key={obs.captureId} className="flex items-center justify-between rounded-xl bg-surface-soft px-4 py-3 text-sm">
            <span className="font-semibold">{new Date(obs.acquisitionDate).toLocaleDateString()}</span>
            <span className="flex gap-4 text-xs text-muted">
              <span>NDVI {obs.statistics.NDVI?.mean != null ? obs.statistics.NDVI.mean.toFixed(2) : "—"}</span>
              <span>Health {obs.healthScore != null ? obs.healthScore.toFixed(0) : "—"}</span>
            </span>
          </li>
        ))}
      </ul>
    </div>
  );
}

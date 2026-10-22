"use client";

import Link from "next/link";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { Icon } from "@/components/ui/icon";
import type { GeoJsonPolygon } from "@/lib/geo/polygon";
import { SatelliteMap } from "./satellite-map";
import { selectDisplaySource } from "@/features/satellite/display-source";
import { buildSamplePreview, type SampleSatelliteData, type SatelliteData } from "@/features/satellite/sample-preview";
import type { Comparison, Evidence, LayerItem, ProcessingStatus, Scan, StatisticEntry, StressZone } from "@/features/satellite/types";

interface Farm { id: string; name: string }
interface Field {
  id: string;
  farmId: string;
  name: string;
  boundary: GeoJsonPolygon;
  areaHectares: number;
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
  const res = await fetch(url, { cache: "no-store", signal: AbortSignal.timeout(12000) });
  if (!res.ok) throw new Error("Satellite data could not be loaded. Sign in again or retry shortly.");
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
  const [loadError, setLoadError] = useState<string | null>(null);
  const [selectedIndex, setSelectedIndex] = useState<"NDVI" | "EVI" | "NDWI" | "NDMI">("NDVI");
  const [requestedFrom, setRequestedFrom] = useState(() => new Date(Date.now() - 30 * 86400000).toISOString().slice(0, 10));
  const [requestedTo, setRequestedTo] = useState(() => new Date().toISOString().slice(0, 10));
  const [maxCloudCoverage, setMaxCloudCoverage] = useState(30);
  const readJSON = useCallback(<T,>(url: string): Promise<T | null> => getJSON<T>(url).catch(() => {
    setLoadError("Satellite data could not be loaded. Check your connection and retry.");
    return null;
  }), []);

  const farmId = farms?.some((f) => f.id === pickedFarmId) ? pickedFarmId : (farms?.[0]?.id ?? "");
  const fields = fieldsByFarm?.farmId === farmId ? fieldsByFarm.fields : null;
  const fieldId = fields?.some((f) => f.id === pickedFieldId) ? pickedFieldId : (fields?.[0]?.id ?? "");
  const field = useMemo(() => fields?.find((f) => f.id === fieldId) ?? null, [fields, fieldId]);
  const scans = scansByField?.fieldId === fieldId ? scansByField.scans : null;
  // Display source order: in-progress real scan > latest COMPLETED real capture > labelled SAMPLE preview.
  const selection = useMemo(
    () => (scans ? selectDisplaySource({ scans, pickedScanId, loadFailed: loadError !== null }) : null),
    [scans, pickedScanId, loadError],
  );
  const scan = selection?.scan ?? null;
  const scanId = scan?.id ?? "";
  const sample: SampleSatelliteData | null = useMemo(
    () => (selection?.kind === "SAMPLE" && field ? buildSamplePreview({ fieldId: field.id, boundary: field.boundary, reason: selection.reason }) : null),
    [selection, field],
  );
  const display: SatelliteData | null = sample;
  const activeDetail = !sample && detail?.scanId === scanId ? detail : null;
  const layers = activeDetail?.layers ?? [];
  const statistics = sample?.statistics ?? activeDetail?.statistics ?? [];
  const zones: StressZone[] = sample?.zones ?? activeDetail?.zones ?? [];
  const evidence = activeDetail?.evidence ?? null;
  const comparison = sample?.comparison ?? (comparisonByField?.fieldId === fieldId ? comparisonByField.comparison : null);
  const staleDays = selection?.kind === "REAL" && selection.stale ? selection.ageDays : null;
  const selectedZoneId = zones.some((z) => z.id === pickedZoneId) ? pickedZoneId : (zones[0]?.id ?? null);
  const trueColor = layers.find((l) => l.type === "TRUE_COLOR");
  const ndvi = statistics.find((s) => s.index === "NDVI");
  const ndmi = statistics.find((s) => s.index === "NDMI");
  const evi = statistics.find((s) => s.index === "EVI");
  const ndwi = statistics.find((s) => s.index === "NDWI");
  const indexPreview = layers.find((l) => l.type === `${selectedIndex}_PREVIEW`);

  useEffect(() => {
    readJSON<Farm[]>("/api/farms").then((result) => setFarms(result ?? []));
  }, [readJSON]);

  useEffect(() => {
    if (!farmId) return;
    let cancelled = false;
    readJSON<Field[]>(`/api/farms/${farmId}/fields`).then((result) => {
      if (!cancelled) setFieldsByFarm({ farmId, fields: result ?? [] });
    });
    return () => { cancelled = true; };
  }, [farmId, readJSON]);

  const loadScans = useCallback((id: string): void => {
    readJSON<Scan[]>(`/api/fields/${id}/satellite-scans`).then((result) => {
      setScansByField({ fieldId: id, scans: result ?? [] });
    });
  }, [readJSON]);

  useEffect(() => {
    if (!fieldId) return;
    let cancelled = false;
    loadScans(fieldId);
    readJSON<Comparison>(`/api/fields/${fieldId}/satellite-comparison`).then((result) => {
      if (!cancelled) setComparisonByField({ fieldId, comparison: result });
    });
    return () => { cancelled = true; };
  }, [fieldId, loadScans, readJSON]);

  useEffect(() => {
    if (!scanId || scan?.processingStatus !== "COMPLETED") return;
    let cancelled = false;
    Promise.all([
      readJSON<LayerItem[]>(`/api/satellite-scans/${scanId}/layers`),
      readJSON<StatisticEntry[]>(`/api/satellite-scans/${scanId}/statistics`),
      readJSON<StressZone[]>(`/api/satellite-scans/${scanId}/stress-zones`),
      readJSON<Evidence>(`/api/satellite-scans/${scanId}/evidence`),
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
  }, [scanId, scan?.processingStatus, readJSON]);

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
  }, [scan, fieldId, loadScans]);

  async function requestScan(): Promise<void> {
    if (!fieldId || requesting) return;
    setRequesting(true);
    setLoadError(null);
    try {
      const res = await fetch(`/api/fields/${fieldId}/satellite-scans`, {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({
          from: `${requestedFrom}T00:00:00Z`,
          to: new Date(Math.min(Date.parse(`${requestedTo}T23:59:59Z`), Date.now())).toISOString(),
          maxCloudCoverage,
        }),
      });
      if (res.status !== 202) throw new Error("The satellite request failed. Please retry.");
      if (res.status === 202) {
        const created = (await res.json()) as Scan;
        setScansByField((prev) => ({
          fieldId,
          scans: [created, ...(prev?.fieldId === fieldId ? prev.scans : [])],
        }));
        setPickedScanId(created.id);
        pollAttempts.current = 0;
      }
    } catch {
      setLoadError("The satellite request failed. Check your connection and retry.");
    } finally {
      setRequesting(false);
    }
  }

  if (loadError && !farms?.length) return <div role="alert" className="page-container py-16 text-center text-danger">{loadError}<button type="button" className="ml-3 underline" onClick={() => window.location.reload()}>Retry</button></div>;
  if (farms === null) return <div className="page-container py-16 text-center text-sm text-muted">Loading your farms…</div>;
  if (farms.length === 0)
    return (
      <div className="page-container space-y-3 py-16 text-center">
        <p className="text-sm text-muted">You don&apos;t have a farm yet.</p>
        <Link href="/farms" className="text-sm font-bold text-brand underline">Add a farm to start monitoring</Link>
      </div>
    );

  return <div className="page-container space-y-5">
    {loadError && <div role="alert" className="rounded-xl border border-danger p-3 text-sm text-danger">{loadError}<button type="button" className="ml-3 underline" onClick={() => window.location.reload()}>Retry</button></div>}
    <header className="flex flex-col gap-4 xl:flex-row xl:items-end xl:justify-between">
      <div>
        <p className="flex items-center gap-2 text-xs font-extrabold uppercase tracking-[.16em] text-success"><Icon name="satellite" className="size-4"/>Satellite intelligence</p>
        <h1 className="mt-2 text-3xl font-extrabold text-brand-dark">Farm health monitoring</h1>
        <p className="mt-2 max-w-3xl text-sm text-muted">Track field-level vegetation, moisture and change patterns. Ground inspection is required to determine the exact cause.</p>
      </div>
      <div className="flex flex-wrap gap-2">
        <button type="button" onClick={() => setTab("Change detection")} className="min-h-11 rounded-xl border border-border bg-white px-4 text-xs font-bold">Compare dates</button>
        <button type="button" onClick={requestScan} disabled={!fieldId || requesting} className="min-h-11 rounded-xl bg-brand px-4 text-xs font-extrabold text-white disabled:opacity-50">
          {requesting ? "Requesting…" : "Request satellite scan"}
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
      <label className="text-[10px] font-bold uppercase tracking-wider text-muted">
        Cloud filter
        <input aria-label="Maximum scene cloud percentage" type="number" min={0} max={100} value={maxCloudCoverage} onChange={(event) => setMaxCloudCoverage(Number(event.target.value))} className="mt-2 h-11 w-full rounded-xl border border-border bg-surface-soft px-3 text-sm" />
      </label>
    </section>
    <section className="card flex flex-wrap gap-4 p-4 text-xs">
      <label>From <input aria-label="Satellite date from" type="date" value={requestedFrom} onChange={(event) => setRequestedFrom(event.target.value)} className="ml-2 rounded border p-2" /></label>
      <label>To <input aria-label="Satellite date to" type="date" value={requestedTo} max={new Date().toISOString().slice(0, 10)} onChange={(event) => setRequestedTo(event.target.value)} className="ml-2 rounded border p-2" /></label>
      <p className="self-center text-muted">Choose up to 90 days. Pixel-level cloud masking is applied after scene selection. NDWI shows surface-water contrast; NDMI measures vegetation moisture contrast.</p>
    </section>

    {!field ? (
      <section className="card p-8 text-center text-sm text-muted">
        {fields && fields.length === 0 ? (
          <>This farm has no fields yet. <Link href={`/farms/${farmId}`} className="font-bold text-brand underline">Add one</Link> to enable satellite monitoring.</>
        ) : "Select a field to view satellite monitoring."}
      </section>
    ) : scans === null ? (
      <section className="card p-8 text-center text-sm text-muted">Loading satellite captures…</section>
    ) : (
      <div className="space-y-4">
      {sample && <SampleBanner reasonText={sample.reasonText} onRequest={requestScan} busy={requesting} />}
      {staleDays !== null && scan && (
        <div role="status" className="rounded-xl border-2 border-amber-500 bg-amber-50 p-3 text-sm text-amber-900">
          <strong>Older real capture.</strong> Showing the latest completed capture from {new Date(scan.acquisitionDate ?? scan.createdAt).toLocaleDateString()}, which is {staleDays} days old. It may not reflect your field today.
        </div>
      )}
      <div className="grid gap-5 xl:grid-cols-[minmax(0,1fr)_340px]">
        <section className="overflow-hidden rounded-[20px] border border-brand/10 bg-white shadow-[0_18px_50px_rgba(11,81,55,.09)]">
          <div className="flex gap-2 overflow-x-auto border-b border-border p-3">
            {tabs.map((item) => (
              <button key={item} onClick={() => setTab(item)} className={`min-h-10 whitespace-nowrap rounded-xl px-4 text-xs font-bold ${tab === item ? "bg-brand text-white" : "bg-surface-soft text-muted"}`}>{item}</button>
            ))}
          </div>
          <div className="relative h-[440px] sm:h-[560px]">
            {sample && <SampleWatermark />}
            {sample ? (
              tab === "True colour" ? (
                <div className="flex h-full items-center justify-center px-8 text-center text-sm text-muted">No satellite image is shown in sample mode. Real imagery is unavailable right now.</div>
              ) : tab === "Change detection" ? (
                <ComparisonPanel comparison={comparison} sample />
              ) : (
                <SatelliteMap boundary={field.boundary} zones={zones} selectedZoneId={selectedZoneId} onSelectZone={setPickedZoneId} />
              )
            ) : !scan ? null : !terminalStatuses.has(scan.processingStatus) ? (
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
            ) : (tab === "Vegetation" || tab === "Moisture stress") && indexPreview && failedImageUrl !== indexPreview.access.url ? (
              // eslint-disable-next-line @next/next/no-img-element
              <img src={indexPreview.access.url} alt={`${selectedIndex} field index; transparent pixels are masked`} className="size-full object-contain" onError={() => setFailedImageUrl(indexPreview.access.url)} />
            ) : tab === "Change detection" ? (
              <ComparisonPanel comparison={comparison} />
            ) : (
              <SatelliteMap boundary={field.boundary} zones={zones} selectedZoneId={selectedZoneId} onSelectZone={setPickedZoneId} />
            )}
          </div>
          {(tab === "Vegetation" || tab === "Moisture stress") && (
            <div className="flex flex-wrap gap-4 border-t border-border p-3 text-xs">
              {!sample && <label className="text-xs">Index <select aria-label="Satellite index" value={selectedIndex} onChange={(event) => setSelectedIndex(event.target.value as typeof selectedIndex)} className="ml-2 rounded border p-2">{["NDVI", "EVI", "NDWI", "NDMI"].map(index => <option key={index}>{index}</option>)}</select></label>}
              <StatChip sample={!!sample} label="EVI mean" value={evi?.statistics.mean != null ? evi.statistics.mean.toFixed(2) : "—"} />
              <StatChip sample={!!sample} label="NDWI mean" value={ndwi?.statistics.mean != null ? ndwi.statistics.mean.toFixed(2) : "—"} />
              {tab === "Vegetation" ? (
                <StatChip sample={!!sample} label="NDVI mean" value={ndvi?.statistics.mean != null ? ndvi.statistics.mean.toFixed(2) : "—"} />
              ) : (
                <StatChip sample={!!sample} label="NDMI mean" value={ndmi?.statistics.mean != null ? ndmi.statistics.mean.toFixed(2) : "—"} />
              )}
              <StatChip sample={!!sample} label="Valid pixels" value={`${(tab === "Vegetation" ? ndvi : ndmi)?.statistics.validPixelPercentage.toFixed(0) ?? 0}%`} />
              <StatChip sample={!!sample} label="Masked pixels" value={`${(tab === "Vegetation" ? ndvi : ndmi)?.statistics.maskedPixelPercentage?.toFixed(0) ?? 0}%`} />
            </div>
          )}
        </section>

        <aside className="space-y-4">
          <SelectedObservationCard scan={scan} sample={sample} zone={zones.find((z) => z.id === selectedZoneId) ?? null} />
          {display?.source === "SAMPLE" ? (
            <SampleDisabledCard title="AI interpretation" />
          ) : (
            <AiInterpretationCard evidence={evidence} zoneCount={zones.length} />
          )}
          {display?.source === "SAMPLE" ? (
            <SampleDisabledCard title="Recommended next steps" actions={["Create inspection task", "Upload ground-level photo", "Ask AI assistant", "Request expert review"]} />
          ) : (
          <section className="card p-5">
            <h2 className="font-extrabold">Recommended next steps</h2>
            <div className="mt-4 grid gap-2">
              <Action href="/tasks" label="Create inspection task" />
              <Action href="/scan" label="Upload ground-level photo" />
              <Action href="/assistant" label="Ask AI assistant" />
              <Action href="/consultations" label="Request expert review" />
            </div>
          </section>
          )}
        </aside>
      </div>
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
function SampleBadge({ className = "" }: { className?: string }) {
  return <span className={`inline-block rounded bg-amber-300 px-1.5 py-0.5 text-[9px] font-black uppercase tracking-wider text-black ring-1 ring-black ${className}`}>Sample</span>;
}
function StatChip({ label, value, sample = false }: { label: string; value: string; sample?: boolean }) {
  return <div className="rounded-lg bg-surface-soft px-3 py-2"><div className="text-[9px] font-bold uppercase tracking-wider text-muted">{label}{sample ? " (sample)" : ""}</div><div className="mt-0.5 flex items-center gap-1.5 font-extrabold text-brand-dark">{value}{sample && <SampleBadge />}</div></div>;
}
function Metric({ label, value, sample = false }: { label: string; value: string; sample?: boolean }) {
  return <div className="rounded-xl bg-white/10 p-3"><dt className="text-[9px] text-white/60">{label}{sample ? " (sample)" : ""}</dt><dd className="mt-1 flex items-center gap-1.5 text-sm font-extrabold">{value}{sample && <SampleBadge />}</dd></div>;
}
function SampleBanner({ reasonText, onRequest, busy }: { reasonText: string; onRequest: () => void; busy: boolean }) {
  return (
    <div role="status" className="rounded-xl border-4 border-black bg-amber-300 p-4 text-black shadow-lg">
      <p className="text-sm font-extrabold leading-6 sm:text-base">
        <span aria-hidden="true">&#9888; </span>SAMPLE DATA - illustrative only. These are not measurements of your field. Real satellite data is unavailable right now: {reasonText}.
      </p>
      <button type="button" onClick={onRequest} disabled={busy} className="mt-3 min-h-11 w-full rounded-xl bg-black px-4 text-sm font-extrabold text-white disabled:opacity-60 sm:w-auto">
        {busy ? "Requesting…" : "Request a new real scan"}
      </button>
    </div>
  );
}
function SampleWatermark() {
  return (
    <>
      <div aria-hidden="true" className="pointer-events-none absolute inset-0 z-[1100] flex items-center justify-center overflow-hidden">
        <span className="-rotate-[28deg] select-none text-6xl font-black uppercase tracking-[.3em] text-black/20 sm:text-8xl">Sample</span>
      </div>
      <div className="pointer-events-none absolute right-2 top-2 z-[1101] rounded-md border-2 border-black bg-amber-300 px-2 py-1 text-xs font-black uppercase tracking-wider text-black">Sample - not real</div>
    </>
  );
}
function SampleDisabledCard({ title, actions }: { title: string; actions?: string[] }) {
  return (
    <section className="card p-5" aria-label={`${title} (not available for sample data)`}>
      <h2 className="font-extrabold">{title}</h2>
      <p className="mt-3 text-sm font-semibold text-muted">Not available for sample data</p>
      {actions && (
        <div className="mt-4 grid gap-2">
          {actions.map((label) => (
            <span key={label} role="link" aria-disabled="true" className="flex min-h-11 cursor-not-allowed items-center justify-between rounded-xl bg-surface-soft px-4 text-xs font-bold text-muted opacity-60"><span>{label}</span><span aria-hidden>-</span></span>
          ))}
        </div>
      )}
    </section>
  );
}
function Action({ href, label }: { href: string; label: string }) {
  return <Link href={href} className="flex min-h-11 items-center justify-between rounded-xl bg-surface-soft px-4 text-xs font-bold text-brand-dark"><span>{label}</span><span aria-hidden>→</span></Link>;
}

function SelectedObservationCard({ scan, sample, zone }: { scan: Scan | null; sample: SampleSatelliteData | null; zone: StressZone | null }) {
  const isSample = sample !== null;
  const captureDate = isSample ? "Sample" : scan?.acquisitionDate ? new Date(scan.acquisitionDate).toLocaleDateString() : "—";
  const dataQuality = isSample ? "SAMPLE" : (scan?.dataQuality ?? "—");
  const usable = isSample ? sample.usablePixelPercentage : scan?.usablePixelPercentage;
  const cloud = isSample ? sample.cloudCoverage : scan?.cloudCoverage;
  return (
    <section className="rounded-[20px] bg-brand p-5 text-white shadow-lg">
      <p className="text-[10px] font-bold uppercase tracking-wider text-white/65">{isSample ? (zone ? "Selected sample zone" : "Sample capture") : zone ? "Selected zone" : "Selected capture"}</p>
      <h2 className="mt-2 text-xl font-extrabold">{zone ? zone.label.replace(/_/g, " ") : isSample ? "Sample capture" : `Capture · ${captureDate}`}</h2>
      <p className="mt-2 text-sm leading-6 text-white/80">
        {isSample ? "Illustrative placeholder values only. They do not describe your field." : zone ? "Satellite data flagged this zone relative to the field's own history — ground inspection is needed to confirm the cause." : "Satellite indices are observations; this capture does not establish whether crop stress is present."}
      </p>
      <dl className="mt-5 grid grid-cols-2 gap-3">
        {zone ? (
          <>
            <Metric sample={isSample} label="Area" value={`${zone.areaHectares.toFixed(2)} ha`} />
            <Metric sample={isSample} label="Score" value={zone.score.toFixed(0)} />
          </>
        ) : (
          <>
            <Metric sample={isSample} label="Data quality" value={dataQuality} />
            <Metric sample={isSample} label="Valid pixels" value={usable != null ? `${usable.toFixed(0)}%` : "—"} />
          </>
        )}
        <Metric sample={isSample} label="Capture" value={captureDate} />
        <Metric sample={isSample} label="Cloud" value={cloud != null ? `${cloud.toFixed(0)}%` : "—"} />
      </dl>
    </section>
  );
}

function AiInterpretationCard({ evidence, zoneCount }: { evidence: Evidence | null; zoneCount: number }) {
  if (!evidence?.status || !evidence.evidence)
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

function ComparisonPanel({ comparison, sample = false }: { comparison: Comparison | null; sample?: boolean }) {
  if (!comparison || comparison.observations.length === 0)
    return <div className="flex h-full items-center justify-center px-8 text-center text-sm text-muted">No completed captures yet to compare.</div>;
  if (comparison.comparisonBasis === "INSUFFICIENT_HISTORY")
    return <div className="flex h-full items-center justify-center px-8 text-center text-sm text-muted">Only {comparison.observations.length} completed capture{comparison.observations.length === 1 ? "" : "s"} so far — need at least 2 for a comparison.</div>;
  return (
    <div className="h-full overflow-y-auto p-4">
      <p className="mb-3 text-[10px] font-bold uppercase tracking-wider text-muted">{comparison.comparisonBasis.replace(/_/g, " ")}</p>
      <ul className="space-y-2">
        {comparison.observations.map((obs, idx) => (
          <li key={obs.captureId} className="flex items-center justify-between rounded-xl bg-surface-soft px-4 py-3 text-sm">
            <span className="font-semibold">{sample ? `Sample point ${idx + 1}` : new Date(obs.acquisitionDate).toLocaleDateString()}</span>
            <span className="flex gap-4 text-xs text-muted">
              <span>{sample ? "NDVI (sample)" : "NDVI"} {obs.statistics.NDVI?.mean != null ? obs.statistics.NDVI.mean.toFixed(2) : "—"}</span>
              <span>{sample ? "EVI (sample)" : "EVI"} {obs.statistics.EVI?.mean != null ? obs.statistics.EVI.mean.toFixed(2) : "—"}</span><span>{sample ? "NDWI (sample)" : "NDWI"} {obs.statistics.NDWI?.mean != null ? obs.statistics.NDWI.mean.toFixed(2) : "—"}</span>
              <span>{sample ? "Health (sample)" : "Health"} {obs.healthScore != null ? obs.healthScore.toFixed(0) : "—"}</span>
            </span>
          </li>
        ))}
      </ul>
    </div>
  );
}

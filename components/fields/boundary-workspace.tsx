"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { BoundaryPicker } from "@/components/farms/boundary-picker";
import { fromGeoJsonPolygon, polygonRings, toGeoJsonPolygon, type GeoJsonPolygon } from "@/lib/geo/polygon";
import { describeGeolocationError } from "@/lib/geo/geolocation";
import type { FieldSummary } from "./types";

type Feature = { id: string; geometry: GeoJsonPolygon; properties: { name: string; version: number; areaHectares: number; areaAcres: number } };
type Sample = { longitude: number; latitude: number; accuracyMeters: number; capturedAt: string };
type Metrics = { areaAcres: number; areaHectares: number; areaSquareMeters: number };

async function read<T>(response: Response): Promise<T> {
  const value = await response.json().catch(() => ({}));
  if (!response.ok) throw new Error(value.error?.message ?? "Boundary service unavailable. Retry shortly.");
  return value as T;
}

export function BoundaryWorkspace({ farmId, onFieldsChanged }: { farmId: string; onFieldsChanged: (fields: FieldSummary[]) => void }) {
  const [features, setFeatures] = useState<Feature[]>([]);
  const [loaded, setLoaded] = useState(false);
  const [selected, setSelected] = useState<Feature | null>(null);
  const [points, setPoints] = useState<[number, number][]>([]);
  const [holes, setHoles] = useState<[number, number][][]>([]);
  const [source, setSource] = useState<"MAP_DRAWN" | "GPS_CAPTURE">("MAP_DRAWN");
  const [samples, setSamples] = useState<Sample[]>([]);
  const [pendingGps, setPendingGps] = useState<Sample | null>(null);
  const [gpsConfirmed, setGpsConfirmed] = useState(false);
  const [locating, setLocating] = useState(false);
  const [upload, setUpload] = useState<{ data: object; name: string; key: string } | null>(null);
  const [error, setError] = useState("");
  const [notice, setNotice] = useState("");
  const [busy, setBusy] = useState(false);
  const [metrics, setMetrics] = useState<Metrics | null>(null);
  const fileSequence = useRef(0);
  const gpsSequence = useRef(0);

  const reload = useCallback(async () => {
    const value = await fetch(`/api/geometry/farms/${farmId}/fields/geojson`, { cache: "no-store" }).then(read<{ features: Feature[] }>);
    setFeatures(value.features);
    setLoaded(true);
    return value.features;
  }, [farmId]);
  useEffect(() => {
    let active = true;
    void fetch(`/api/geometry/farms/${farmId}/fields/geojson`, { cache: "no-store" })
      .then(read<{ features: Feature[] }>).then((value) => {
        if (active) { setFeatures(value.features); setLoaded(true); }
      }).catch((e: Error) => { if (active) setError(e.message); });
    return () => { active = false; gpsSequence.current++; };
  }, [farmId]);

  function select(feature: Feature | null) {
    gpsSequence.current++; setLocating(false);
    setSelected(feature); setPoints(feature ? fromGeoJsonPolygon(feature.geometry) : []);
    setHoles(feature ? polygonRings(feature.geometry).slice(1) : []);
    setSamples([]); setPendingGps(null); setGpsConfirmed(false); setSource("MAP_DRAWN"); setMetrics(null);
  }

  async function operation(action: () => Promise<void>) {
    setBusy(true); setError(""); setNotice("");
    try { await action(); } catch (e) { setError(e instanceof Error ? e.message : "Boundary service unavailable."); }
    finally { setBusy(false); }
  }

  async function importFile() {
    if (!upload) return;
    await operation(async () => {
      const result = await fetch(`/api/geometry/farms/${farmId}/fields/import`, {
        method: "POST", headers: { "content-type": "application/json" },
        body: JSON.stringify({ geojson: upload.data, idempotencyKey: upload.key }),
      }).then(read<{ imported: number; fields: FieldSummary[] }>);
      onFieldsChanged(result.fields);
      const list = await reload(); select(list.find((f) => f.id === result.fields[0]?.id) ?? null);
      setUpload(null);
      setNotice(`${result.imported} field(s) imported. Area calculated by PostGIS.`);
    });
  }

  function captureGps() {
    if (!navigator.geolocation) { setError("GPS is unavailable. Draw the boundary manually."); return; }
    setLocating(true); setError("");
    const sequence = ++gpsSequence.current;
    navigator.geolocation.getCurrentPosition((position) => {
      if (sequence !== gpsSequence.current) return;
      setPendingGps({ longitude: position.coords.longitude, latitude: position.coords.latitude,
        accuracyMeters: position.coords.accuracy, capturedAt: new Date(position.timestamp).toISOString() });
      setLocating(false);
    }, (failure) => { if (sequence !== gpsSequence.current) return; setLocating(false); setError(describeGeolocationError(failure)); },
    { enableHighAccuracy: true, timeout: 10000, maximumAge: 0 });
  }

  const geometry = toGeoJsonPolygon(points, holes);
  return (
    <section className="mt-5 space-y-4 rounded-3xl border border-brand/10 bg-white p-5">
      <h2 className="text-base font-extrabold">Maps and boundaries</h2>
      <p className="text-xs text-muted">Import WGS84 GeoJSON, edit a field or capture GPS corners. Calculated area and device GPS are not a cadastral survey.</p>
      {error && <p role="alert" className="rounded-xl bg-danger/5 p-3 text-xs text-danger">{error}</p>}
      {notice && <p role="status" className="rounded-xl bg-green-50 p-3 text-xs text-green-950">{notice}</p>}
      <div className="flex flex-wrap items-end gap-3 text-xs">
        <label>GeoJSON file (up to 256 KiB, 25 fields)
          <input aria-label="Import GeoJSON file" type="file" accept=".geojson,.json,application/geo+json,application/json" disabled={busy}
            onChange={async (event) => {
              const sequence = ++fileSequence.current;
              const file = event.target.files?.[0]; setUpload(null); setError("");
              if (!file) return;
              if (file.size > 250000) { setError("Choose a GeoJSON file smaller than 250000 bytes; the request limit includes its envelope."); return; }
              if (!crypto.randomUUID) { setError("Open this application over HTTPS or localhost to import boundaries securely."); return; }
              try { const data = JSON.parse(await file.text()); if (sequence === fileSequence.current) setUpload({ data, name: file.name, key: crypto.randomUUID() }); }
              catch { setError("The file does not contain valid JSON."); }
            }} className="mt-2 block" />
        </label>
        <button type="button" disabled={!upload || busy} onClick={() => void importFile()} className="rounded-lg bg-brand px-4 py-2 font-bold text-white disabled:opacity-40">Import fields</button>
        <button type="button" disabled={busy} onClick={() => void operation(async () => { await reload(); setNotice("Boundaries reloaded. Select a field to discard unsaved edits and load its current version."); })} className="rounded-lg border px-4 py-2">Reload boundaries</button>
        <button type="button" disabled={!loaded || busy} onClick={() => void operation(async () => {
          const data = await fetch(`/api/geometry/farms/${farmId}/fields/geojson`, { cache: "no-store" }).then(read<object>);
          const url = URL.createObjectURL(new Blob([JSON.stringify(data, null, 2)], { type: "application/geo+json" }));
          const link = document.createElement("a"); link.href = url; link.download = `farm-${farmId}-fields.geojson`; link.click();
          setTimeout(() => URL.revokeObjectURL(url), 1000);
        })} className="rounded-lg border px-4 py-2">Download GeoJSON</button>
      </div>
      {loaded && features.length === 0 && <p className="text-xs text-muted">No saved fields. Import a polygon or use Add New Field.</p>}
      {features.length > 0 && <label className="block text-xs font-bold">Field boundary
        <select aria-label="Field boundary" value={selected?.id ?? ""} disabled={busy} onChange={(e) => select(features.find((f) => f.id === e.target.value) ?? null)} className="ml-3 rounded-lg border p-2">
          <option value="">Select a saved field</option>{features.map((f) => <option key={f.id} value={f.id}>{f.properties.name}</option>)}
        </select></label>}
      {selected && <div className="space-y-3">
        <p className="text-xs">Saved version {selected.properties.version} · {selected.properties.areaAcres.toFixed(4)} acres · {selected.properties.areaHectares.toFixed(4)} hectares</p>
        <BoundaryPicker key={selected.id} points={points} holes={holes} center={points[0]} onChange={(vertices) => {
          if (busy) return;
          gpsSequence.current++; setLocating(false);
          setPoints(vertices); setSamples([]); setSource("MAP_DRAWN"); setPendingGps(null); setGpsConfirmed(false); setMetrics(null);
        }} />
        <div className="flex flex-wrap gap-3 text-xs">
          <button type="button" disabled={busy || locating} onClick={() => { setPoints([]); setHoles([]); setSamples([]); setPendingGps(null); setSource("GPS_CAPTURE"); setGpsConfirmed(false); setMetrics(null); }} className="rounded-lg border px-3 py-2">Start new GPS boundary</button>
          <button type="button" disabled={source !== "GPS_CAPTURE" || locating || busy} onClick={captureGps} className="rounded-lg border px-3 py-2">{locating ? "Capturing GPS..." : "Capture GPS vertex"}</button>
          {samples.length > 0 && <span>{samples.length} GPS corners. Worst reported accuracy: {Math.max(...samples.map((s) => s.accuracyMeters)).toFixed(1)} m</span>}
        </div>
        {pendingGps && <div className="rounded-xl border p-3 text-xs">
          <p>GPS estimate: {pendingGps.latitude.toFixed(6)}, {pendingGps.longitude.toFixed(6)}. Reported accuracy ±{pendingGps.accuracyMeters.toFixed(1)} m. Confirm this is the intended corner.</p>
          <button type="button" disabled={busy} onClick={() => { setSamples((s) => [...s, pendingGps]); setPoints((p) => [...p, [pendingGps.latitude, pendingGps.longitude]]); setPendingGps(null); setGpsConfirmed(false); setMetrics(null); }} className="mt-2 rounded border p-2">Add this GPS vertex</button>
        </div>}
        {source === "GPS_CAPTURE" && <label className="block text-xs"><input type="checkbox" checked={gpsConfirmed} onChange={(e) => setGpsConfirmed(e.target.checked)} /> I reviewed GPS accuracy and confirm these corners; this is not a surveyed boundary.</label>}
        <div className="flex gap-3 text-xs">
          <button type="button" disabled={points.length < 3 || busy} onClick={() => void operation(async () => {
            setMetrics(await fetch("/api/geometry/validate", { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ geometry, farmId }) }).then(read<Metrics>));
          })} className="rounded-lg border px-4 py-2">Validate boundary and area</button>
          <button type="button" disabled={points.length < 3 || busy || (source === "GPS_CAPTURE" && !gpsConfirmed)} onClick={() => void operation(async () => {
            const result = await fetch(`/api/geometry/fields/${selected.id}/boundary`, { method: "PATCH", headers: { "content-type": "application/json" },
              body: JSON.stringify({ geometry, farmId, expectedVersion: selected.properties.version, source, gpsSamples: samples, confirmedGpsAccuracy: gpsConfirmed }),
            }).then(read<FieldSummary & { metrics: Metrics }>);
            onFieldsChanged([result]); const list = await reload(); select(list.find((f) => f.id === result.id) ?? null);
            setMetrics(result.metrics); setNotice("Boundary saved. Reloading the page will retain this geometry and area.");
          })} className="rounded-lg bg-brand px-4 py-2 font-bold text-white disabled:opacity-40">Save field boundary</button>
        </div>
        {metrics && <p role="status" className="text-xs">Validated area: {metrics.areaAcres.toFixed(4)} acres ({metrics.areaHectares.toFixed(4)} ha, {metrics.areaSquareMeters.toFixed(2)} m²). WGS84 spheroid; not survey-certified.</p>}
      </div>}
    </section>
  );
}

"use client";

import { useCallback, useEffect, useRef, useState } from "react";

type Farm = { id: string; name: string };
type Field = { id: string; name: string };
type Context = { cropCycleId: string | null; sowingDate: string | null; crop: string | null; area: number; waterProductivityEnabled: boolean };
type Profile = { version: number; inputs: { parameters: Record<string, number>; source: string; efficiency: number; wettedFraction: number; initialCondition: string } };
type Run = { id: string; kind: string; status: string; failureCode: string | null; result: {
  method?: string; initialCondition?: string; parameterVerification?: string; profileVersion?: number;
  advisory?: { asOf: string; netDepthMm: number; grossDepthMm: number; volumeM3: number };
  daily?: Array<{ date: string; ETref: number; ETc: number; ETa: number; Dr: number; TAW: number; RAW: number; Rain: number; Runoff: number; DP: number }>;
  biomassWaterProductivityKgM3?: number; actualEtMm?: number; biomassKgDmHa?: number; validCoveragePercent?: number; artifact?: string;
} | null };

const parameters = [
  ["Kcmini", "Initial single crop coefficient"], ["Kcmmid", "Mid-season single crop coefficient"], ["Kcmend", "End single crop coefficient"],
  ["Kcbini", "Initial basal crop coefficient"], ["Kcbmid", "Mid-season basal crop coefficient"], ["Kcbend", "End basal crop coefficient"],
  ["Lini", "Initial stage (days)"], ["Ldev", "Development stage (days)"], ["Lmid", "Mid-season stage (days)"], ["Lend", "Late stage (days)"],
  ["hini", "Initial crop height (m)"], ["hmax", "Maximum crop height (m)"], ["thetaFC", "Field capacity (m³/m³)"],
  ["thetaWP", "Wilting point (m³/m³)"], ["theta0", "Initial soil water (m³/m³)"], ["Zrini", "Initial root depth (m)"], ["Zrmax", "Maximum root depth (m)"],
  ["pbase", "Allowable depletion fraction"], ["Ze", "Evaporation layer depth (m)"], ["REW", "Readily evaporable water (mm)"], ["CN2", "Runoff curve number"],
];
const control = "mt-1 w-full rounded-xl border border-border bg-white p-3 text-sm";
const localDate = (value = new Date()) => new Intl.DateTimeFormat("en-CA", { timeZone: "Asia/Karachi", year: "numeric", month: "2-digit", day: "2-digit" }).format(value);

async function api<T>(path: string, method = "GET", body?: unknown): Promise<T> {
  const response = await fetch(path, { method, body: body === undefined ? undefined : JSON.stringify(body),
    headers: { "content-type": "application/json" }, cache: "no-store", signal: AbortSignal.timeout(15000) });
  const data = await response.json();
  if (!response.ok) throw new Error(data.error?.message ?? "Request failed. Retry shortly.");
  return data as T;
}

export function IrrigationWorkspace() {
  const [farms, setFarms] = useState<Farm[]>([]);
  const [farm, setFarm] = useState("");
  const [fields, setFields] = useState<Field[]>([]);
  const [field, setField] = useState("");
  const [error, setError] = useState("");
  useEffect(() => { api<Farm[]>("/api/farms").then(setFarms).catch(error => setError(error.message)); }, []);
  const farmId = farm || farms[0]?.id || "";
  useEffect(() => {
    if (!farmId) return;
    let cancelled = false;
    api<Field[]>(`/api/farms/${farmId}/fields`).then(items => { if (!cancelled) { setFields(items); setField(items[0]?.id || ""); } }).catch(error => { if (!cancelled) setError(error.message); });
    return () => { cancelled = true; };
  }, [farmId]);
  return <div className="page-container space-y-6">
    <header><p className="eyebrow">Water intelligence</p><h1 className="mt-2 text-3xl font-extrabold">Irrigation & water productivity</h1>
      <p className="mt-3 text-muted">Daily crop water balance from sourced inputs. Advisory results do not operate irrigation equipment.</p></header>
    {error && <p role="alert" className="rounded-xl bg-amber-50 p-4">{error}</p>}
    <div className="card grid gap-4 p-5 md:grid-cols-2">
      <label>Farm<select aria-label="Farm" className={control} value={farmId} onChange={event => setFarm(event.target.value)}>{farms.map(f => <option key={f.id} value={f.id}>{f.name}</option>)}</select></label>
      <label>Field<select aria-label="Field" className={control} value={field} onChange={event => setField(event.target.value)}>{fields.map(f => <option key={f.id} value={f.id}>{f.name}</option>)}</select></label>
    </div>
    {!field ? <p className="card p-6">Select or create an owned farm and field to start.</p> : <FieldWorkspace key={field} fieldId={field} />}
  </div>;
}

function FieldWorkspace({ fieldId }: { fieldId: string }) {
  const [context, setContext] = useState<Context | null>(null);
  const [profile, setProfile] = useState<Profile | null>(null);
  const [values, setValues] = useState<Record<string, string>>({});
  const [source, setSource] = useState("");
  const [efficiency, setEfficiency] = useState("");
  const [wetted, setWetted] = useState("");
  const [condition, setCondition] = useState("SCENARIO");
  const [supported, setSupported] = useState(false);
  const [confirmed, setConfirmed] = useState(false);
  const [endDate, setEndDate] = useState(() => localDate(new Date(Date.now() - 6 * 86400000)));
  const [eventDate, setEventDate] = useState("");
  const [depth, setDepth] = useState("");
  const [eventSource, setEventSource] = useState("");
  const [eventCount, setEventCount] = useState(0);
  const [runs, setRuns] = useState<Run[]>([]);
  const [error, setError] = useState("");
  const [notice, setNotice] = useState("");
  const [busy, setBusy] = useState(false);
  const [carbon, setCarbon] = useState("");
  const [carbonSource, setCarbonSource] = useState("");
  const [satelliteStart, setSatelliteStart] = useState("");
  const [satelliteEnd, setSatelliteEnd] = useState("");
  const retryKeys = useRef<Record<string, { fingerprint: string; key: string }>>({});
  const base = `/api/irrigation/fields/${fieldId}`;
  const reload = useCallback(() => api<Run[]>(`${base}/irrigation-runs`).then(setRuns).catch(error => setError(error.message)), [base]);
  useEffect(() => {
    let cancelled = false;
    api<Context>(`${base}/irrigation/context`).then(async ctx => {
      if (cancelled) return;
      setContext(ctx);
      if (!ctx.cropCycleId) return;
      const [saved, events] = await Promise.all([api<Profile | null>(`${base}/irrigation/profile?cropCycleId=${ctx.cropCycleId}`), api<unknown[]>(`${base}/irrigation/events?cropCycleId=${ctx.cropCycleId}`)]);
      if (cancelled) return;
      setEventCount(events.length);
      if (saved) {
        setProfile(saved); setValues(Object.fromEntries(Object.entries(saved.inputs.parameters).map(([key, value]) => [key, String(value)])));
        setSource(saved.inputs.source); setEfficiency(String(saved.inputs.efficiency)); setWetted(String(saved.inputs.wettedFraction)); setCondition(saved.inputs.initialCondition);
      }
    }).catch(error => { if (!cancelled) setError(error.message); });
    reload();
    return () => { cancelled = true; };
  }, [base, reload]);
  const pending = runs.some(run => run.status === "QUEUED" || run.status === "PROCESSING");
  useEffect(() => { if (!pending) return; const timer = setInterval(reload, 4000); return () => clearInterval(timer); }, [pending, reload]);
  async function action(work: () => Promise<void>) {
    setBusy(true); setError(""); setNotice("");
    try { await work(); } catch (error) { setError(error instanceof Error ? error.message : "Request failed."); } finally { setBusy(false); }
  }
  async function submit<T>(url: string, body: Record<string, unknown>): Promise<T> {
    const fingerprint = JSON.stringify(body);
    if (retryKeys.current[url]?.fingerprint !== fingerprint)
      retryKeys.current[url] = { fingerprint, key: crypto.randomUUID() };
    const result = await api<T>(url, "POST", { ...body, idempotencyKey: retryKeys.current[url].key });
    delete retryKeys.current[url];
    return result;
  }
  if (!context) return <div className="card p-6">{error ? <p role="alert">{error}</p> : "Loading field and season…"}<button className="ml-4 underline" onClick={() => window.location.reload()}>Retry</button></div>;
  if (!context.cropCycleId || !context.sowingDate) return <p className="card p-6">Record a crop season and sowing date on this field before calculating irrigation.</p>;
  return <>
    {error && <div role="alert" className="rounded-xl bg-amber-50 p-4">{error}<button className="ml-4 underline" onClick={reload}>Refresh results</button></div>}
    {notice && <p role="status" className="rounded-xl bg-brand-soft p-4">{notice}</p>}
    <p className="text-sm text-muted">Crop: {context.crop} · Sowing: {context.sowingDate} · One homogeneous upland soil profile. Rice, ponding and groundwater-fed systems are unsupported.</p>
    <details className="card p-5" open={!profile}><summary className="cursor-pointer font-bold">Crop and soil profile {profile ? `· version ${profile.version}` : "· required"}</summary>
      <form className="mt-5 space-y-5" onSubmit={event => { event.preventDefault(); action(async () => {
        const saved = await api<Profile>(`${base}/irrigation/profile`, "PUT", { cropCycleId: context.cropCycleId, initialDate: context.sowingDate, initialCondition: condition,
          source, efficiency: Number(efficiency), wettedFraction: Number(wetted), uplandNoGroundwater: supported, expectedVersion: profile?.version || 0,
          parameters: Object.fromEntries(parameters.map(([key]) => [key, Number(values[key])])) });
        setProfile(saved); setNotice("Profile saved. Farmer-supplied parameters have not been locally calibrated.");
      }); }}>
        <p className="text-sm text-muted">Enter measured or documented values. No default crop or soil measurements are supplied. Ask an agronomist if these parameters are unknown.</p>
        <div className="grid gap-4 md:grid-cols-3">{parameters.map(([key, label]) => <label key={key} className="text-xs font-semibold">{label}<input aria-label={label} required type="number" step="any" className={control} value={values[key] ?? ""} onChange={e => setValues({ ...values, [key]: e.target.value })} /></label>)}</div>
        <div className="grid gap-4 md:grid-cols-3">
          <label>Application efficiency (0–1)<input aria-label="Application efficiency" required type="number" step="any" min="0.01" max="1" className={control} value={efficiency} onChange={e => setEfficiency(e.target.value)} /></label>
          <label>Wetted surface fraction (0–1)<input aria-label="Wetted fraction" required type="number" step="any" min="0.01" max="1" className={control} value={wetted} onChange={e => setWetted(e.target.value)} /></label>
          <label>Initial soil condition<select aria-label="Initial soil condition" className={control} value={condition} onChange={e => setCondition(e.target.value)}><option value="SCENARIO">Assumed scenario · not measured</option><option value="MEASURED">Measured at sowing</option></select></label>
        </div>
        <label className="block">Parameter source and initial measurement date<input aria-label="Parameter source" required minLength={10} maxLength={500} className={control} value={source} onChange={e => setSource(e.target.value)} /></label>
        <label className="block"><input required type="checkbox" checked={supported} onChange={e => setSupported(e.target.checked)} /> I confirm an upland system with no material groundwater contribution, ponding or salinity.</label>
        <button disabled={busy} className="rounded-xl bg-brand px-5 py-3 font-bold text-white">Save water profile</button>
      </form>
    </details>
    <section className="card p-5"><h2 className="font-bold">Actual irrigation events · {eventCount} recorded</h2>
      <p className="mt-2 text-sm text-muted">Record the daily gross field-average total, not a recommendation. One confirmed total per day is supported. Efficiency is applied once.</p>
      <form className="mt-4 grid gap-4 md:grid-cols-4" onSubmit={event => { event.preventDefault(); action(async () => {
        await submit(`${base}/irrigation/events`, { cropCycleId: context.cropCycleId, date: eventDate, grossDepthMm: Number(depth), efficiency: Number(efficiency), wettedFraction: Number(wetted), source: eventSource });
        setEventCount(eventCount + 1); setNotice("Actual irrigation event recorded. Existing run snapshots remain unchanged.");
      }); }}>
        <label>Date<input aria-label="Irrigation date" required type="date" min={context.sowingDate} max={localDate()} className={control} value={eventDate} onChange={e => setEventDate(e.target.value)} /></label>
        <label>Gross depth (mm)<input aria-label="Gross depth mm" required type="number" step="any" min="0.01" max="300" className={control} value={depth} onChange={e => setDepth(e.target.value)} /></label>
        <label>Record source<input aria-label="Event source" required minLength={5} className={control} value={eventSource} onChange={e => setEventSource(e.target.value)} /></label>
        <button disabled={busy || !profile} className="self-end rounded-xl border p-3 font-bold">Record irrigation</button>
      </form>
    </section>
    <section className="card space-y-4 p-5"><h2 className="font-bold">Calculate daily water balance</h2>
      <p className="text-sm text-muted">Run from sowing to a historical end date using Open-Meteo reanalysis, not field measurements. Recent archive data may be delayed. Missing days stop the calculation.</p>
      <label className="block">End date<input aria-label="Balance end date" type="date" min={context.sowingDate} max={localDate()} className={control} value={endDate} onChange={e => setEndDate(e.target.value)} /></label>
      <label className="block"><input type="checkbox" checked={confirmed} onChange={e => setConfirmed(e.target.checked)} /> I confirm no other irrigation occurred in this period beyond the recorded events.</label>
      <button disabled={busy || !profile || !confirmed} className="rounded-xl bg-brand px-5 py-3 font-bold text-white" onClick={() => action(async () => {
        const run = await submit<Run>(`${base}/irrigation-runs`, { cropCycleId: context.cropCycleId, endDate, weatherSource: "OPEN_METEO_ARCHIVE", source: "Open-Meteo archive reanalysis requested by field owner", confirmedNoOtherIrrigation: confirmed });
        setRuns(previous => [run, ...previous]); setNotice("Calculation queued. Results appear only after successful processing.");
      })}>Calculate water balance</button>
    </section>
    <section className="card space-y-4 p-5"><h2 className="font-bold">Satellite biomass water productivity</h2>
      <p className="text-sm text-muted">Requires a configured pyWaPOR worker and supported imagery. Produces modelled dry biomass per water consumed, not crop yield. No estimated output is substituted when providers are unavailable.</p>
      {!context.waterProductivityEnabled && <p className="text-amber-800">Satellite processing is not configured. A request records an explicit unavailable result.</p>}
      <div className="grid gap-4 md:grid-cols-2">
        <label>Satellite start date<input aria-label="Satellite start date" type="date" min={context.sowingDate} max={localDate()} className={control} value={satelliteStart} onChange={e => setSatelliteStart(e.target.value)} /></label>
        <label>Satellite end date<input aria-label="Satellite end date" type="date" min={satelliteStart || context.sowingDate} max={localDate()} className={control} value={satelliteEnd} onChange={e => setSatelliteEnd(e.target.value)} /></label>
      </div>
      <p className="text-sm text-muted">Choose up to31 days within the season; this period is independent of the irrigation balance start.</p>
      <label className="block">Dry-matter carbon fraction (0.3–0.6)<input aria-label="Dry matter carbon fraction" type="number" min="0.3" max="0.6" step="any" className={control} value={carbon} onChange={e => setCarbon(e.target.value)} /></label>
      <label className="block">Carbon-fraction source<input aria-label="Carbon fraction source" className={control} value={carbonSource} onChange={e => setCarbonSource(e.target.value)} /></label>
      <button disabled={busy || !carbon || carbonSource.length < 10 || !satelliteStart || !satelliteEnd} className="rounded-xl border px-5 py-3 font-bold" onClick={() => action(async () => {
        const run = await submit<Run>(`${base}/water-productivity-runs`, { cropCycleId: context.cropCycleId, startDate: satelliteStart, endDate: satelliteEnd, dryMatterCarbonFraction: Number(carbon), carbonFractionSource: carbonSource });
        setRuns(previous => [run, ...previous]);
      })}>Request water productivity</button>
    </section>
    <section className="space-y-4"><h2 className="text-xl font-bold">Calculation history</h2>
      {!runs.length && <p className="card p-5">No calculations yet. Save a profile and confirm the weather/event inputs.</p>}
      {runs.map(run => <article key={run.id} className="card space-y-4 p-5"><div className="flex justify-between"><h3 className="font-bold">{run.kind === "IRRIGATION" ? "Water balance" : "Satellite productivity"}</h3><span role="status">{run.status}</span></div>
        {run.failureCode && <p role="alert">Unavailable: {run.failureCode.replaceAll("_", " ")}. Check the input or provider configuration before submitting a new run.</p>}
        {run.result?.advisory && <><p>As of {run.result.advisory.asOf}: net {run.result.advisory.netDepthMm.toFixed(2)} mm · gross {run.result.advisory.grossDepthMm.toFixed(2)} mm · {run.result.advisory.volumeM3.toFixed(2)} m³</p>
          <p className="text-sm text-muted">{run.result.initialCondition === "SCENARIO" ? "Scenario initial water condition. " : "Farmer-declared measured initial condition. "}Profile version {run.result.profileVersion}; farmer-supplied parameters are not locally calibrated. Homogeneous upland soil; no groundwater, ponding or salinity. Inspect current soil moisture before applying a historical advisory.</p>
          <div className="overflow-x-auto"><table className="w-full text-left text-sm"><thead><tr>{["Date", "Reference ET mm", "Crop ET mm", "Actual ET mm", "Depletion mm", "Rain mm", "Runoff mm", "Drainage mm"].map(label => <th className="p-2" key={label}>{label}</th>)}</tr></thead><tbody>{run.result.daily?.map(day => <tr key={day.date}>{[day.date, day.ETref, day.ETc, day.ETa, day.Dr, day.Rain, day.Runoff, day.DP].map((value, i) => <td className="border-t p-2" key={i}>{typeof value === "number" ? value.toFixed(2) : value}</td>)}</tr>)}</tbody></table></div></>}
        {run.result?.biomassWaterProductivityKgM3 !== undefined && <p>Biomass productivity {run.result.biomassWaterProductivityKgM3.toFixed(3)} kgDM/m³ · actual ET {run.result.actualEtMm?.toFixed(2)} mm · valid model-output coverage {run.result.validCoveragePercent?.toFixed(0)}% {run.result.artifact && <a className="underline" href={`/api/irrigation${run.result.artifact.slice(4)}`}>Download private NetCDF</a>}</p>}
      </article>)}
      <button className="rounded-xl border px-4 py-2" onClick={reload}>Refresh results</button>
    </section>
  </>;
}

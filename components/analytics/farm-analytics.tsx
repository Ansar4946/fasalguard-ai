"use client";

import { useState } from "react";
import Link from "next/link";

const ranges = ["7 days", "30 days", "Season"] as const;
const trend = [58, 62, 66, 64, 70, 73, 72, 76, 78, 75, 80, 82];

export function FarmAnalytics() {
  const [range, setRange] = useState<(typeof ranges)[number]>("30 days");
  const [field, setField] = useState("All fields");

  return (
    <div className="min-h-[calc(100dvh-4rem)] bg-[#f8f5ec]">
      <div className="mx-auto max-w-6xl px-4 py-5 sm:px-6 lg:px-7">
        <header className="flex flex-col gap-4 sm:flex-row sm:items-end sm:justify-between">
          <div><p className="text-[10px] font-extrabold uppercase tracking-[.16em] text-success">Farm intelligence</p><h1 className="mt-1 text-2xl font-extrabold tracking-tight text-brand-dark">Analytics overview</h1><p className="mt-1 text-xs leading-5 text-muted">Monitor crop health, field risk and AI scan outcomes across your farm.</p></div>
          <div className="flex flex-wrap gap-2"><select value={field} onChange={(event) => setField(event.target.value)} className="h-10 rounded-xl border border-brand/10 bg-white px-3 text-xs font-bold"><option>All fields</option><option>North Field</option><option>Canal Field</option><option>South Field</option></select><div className="flex rounded-xl border border-brand/10 bg-white p-1">{ranges.map((item) => <button key={item} onClick={() => setRange(item)} className={`min-h-8 rounded-lg px-3 text-[10px] font-bold ${range === item ? "bg-brand text-white" : "text-muted"}`}>{item}</button>)}</div></div>
        </header>

        <section className="mt-5 grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
          <Stat label="Average health" value="78%" change="+6% this month" tone="green" />
          <Stat label="Fields monitored" value="3" change="18.5 total acres" tone="blue" />
          <Stat label="AI scans" value="24" change="8 reviewed by experts" tone="blue" />
          <Stat label="High-risk alerts" value="2" change="Needs attention" tone="red" />
        </section>

        <section className="mt-4 grid gap-4 xl:grid-cols-[minmax(0,1.6fr)_minmax(280px,.8fr)]">
          <article className="rounded-2xl border border-brand/10 bg-white p-5 shadow-[0_8px_28px_rgba(15,45,32,.06)]">
            <div className="flex items-start justify-between"><div><p className="text-[10px] font-extrabold uppercase tracking-[.14em] text-success">Crop health</p><h2 className="mt-1 text-base font-extrabold text-brand-dark">Health score trend</h2></div><span className="rounded-full bg-brand-soft px-3 py-1 text-[9px] font-bold text-brand">{range}</span></div>
            <div className="mt-6 flex h-52 items-end gap-2 border-b border-l border-border px-3 pt-3">{trend.map((value, index) => <div key={`${value}-${index}`} className="group relative flex h-full flex-1 items-end"><div className="w-full rounded-t-md bg-gradient-to-t from-brand to-[#7dbc63] transition hover:brightness-110" style={{ height: `${value}%` }}><span className="absolute -top-6 left-1/2 hidden -translate-x-1/2 rounded bg-brand px-2 py-1 text-[8px] text-white group-hover:block">{value}%</span></div></div>)}</div>
            <div className="mt-3 flex justify-between text-[9px] text-muted"><span>Start</span><span>Today</span></div>
          </article>

          <article className="rounded-2xl border border-brand/10 bg-brand-dark p-5 text-white shadow-[0_14px_36px_rgba(0,50,31,.16)]">
            <p className="text-[10px] font-extrabold uppercase tracking-[.14em] text-brand-soft">AI insight</p><h2 className="mt-2 text-lg font-extrabold leading-6">North Field health is improving</h2><p className="mt-3 text-xs leading-5 text-white/70">Health increased by 9% after irrigation correction. Whitefly activity remains the main risk for the next seven days.</p>
            <div className="mt-5 rounded-xl bg-white/10 p-4"><div className="flex justify-between text-[10px]"><span>Prediction confidence</span><strong>86%</strong></div><div className="mt-2 h-1.5 rounded-full bg-white/15"><div className="h-full w-[86%] rounded-full bg-brand-soft" /></div></div>
            <Link href="/fields" className="mt-5 flex min-h-10 items-center justify-center rounded-xl bg-brand-soft text-[11px] font-extrabold text-brand-dark">Review field details</Link>
          </article>
        </section>

        <section className="mt-4 grid gap-4 lg:grid-cols-3">
          <article className="rounded-2xl border border-brand/10 bg-white p-5 shadow-sm lg:col-span-2"><div className="flex items-center justify-between"><h2 className="text-base font-extrabold text-brand-dark">Field performance</h2><Link href="/fields" className="text-[10px] font-extrabold text-brand">View all fields →</Link></div><div className="mt-4 overflow-x-auto"><table className="w-full min-w-[560px] text-left text-xs"><thead className="text-[9px] uppercase tracking-wide text-muted"><tr><th className="pb-3">Field</th><th className="pb-3">Crop</th><th className="pb-3">Health</th><th className="pb-3">Risk</th><th className="pb-3">Trend</th></tr></thead><tbody className="divide-y divide-border"><FieldRow name="North Field" crop="Cotton" health={82} risk="Low" trend="+8%" /><FieldRow name="Canal Field" crop="Wheat" health={91} risk="Low" trend="+3%" /><FieldRow name="South Field" crop="Cotton" health={63} risk="High" trend="-7%" /></tbody></table></div></article>

          <article className="rounded-2xl border border-brand/10 bg-white p-5 shadow-sm"><h2 className="text-base font-extrabold text-brand-dark">Scan outcomes</h2><div className="mx-auto mt-5 grid size-40 place-items-center rounded-full bg-[conic-gradient(#075f3d_0_62%,#d39b23_62%_83%,#c5352e_83%_100%)]"><div className="grid size-28 place-items-center rounded-full bg-white text-center"><div><strong className="block text-2xl text-brand-dark">24</strong><span className="text-[9px] text-muted">total scans</span></div></div></div><div className="mt-5 grid grid-cols-3 gap-2 text-center"><Legend color="bg-brand" label="Healthy" value="15" /><Legend color="bg-amber-500" label="Monitor" value="5" /><Legend color="bg-danger" label="High risk" value="4" /></div></article>
        </section>

        <section className="mt-4 grid gap-4 md:grid-cols-2">
          <article className="rounded-2xl border border-amber-200 bg-[#fff7dd] p-5"><p className="text-[10px] font-extrabold uppercase tracking-[.14em] text-amber-800">Risk distribution</p><h2 className="mt-1 text-base font-extrabold text-amber-950">Most detected conditions</h2><div className="mt-4 space-y-3"><Risk label="Cotton leaf curl" value={42} /><Risk label="Nutrient stress" value={27} /><Risk label="Leaf rust" value={18} /></div></article>
          <article className="rounded-2xl border border-brand/10 bg-white p-5"><p className="text-[10px] font-extrabold uppercase tracking-[.14em] text-success">Recommended focus</p><h2 className="mt-1 text-base font-extrabold text-brand-dark">Actions for this week</h2><div className="mt-4 space-y-2">{["Inspect South Field for spreading symptoms", "Complete the North Field whitefly count", "Review two pending AI scan reports"].map((item, index) => <div key={item} className="flex items-center gap-3 rounded-xl bg-[#edf6e9] p-3"><span className="grid size-7 shrink-0 place-items-center rounded-lg bg-white text-[9px] font-extrabold text-brand">0{index + 1}</span><p className="text-xs font-semibold text-brand-dark">{item}</p></div>)}</div></article>
        </section>
      </div>
    </div>
  );
}

function Stat({ label, value, change, tone }: { label: string; value: string; change: string; tone: "green" | "blue" | "red" }) { const styles = tone === "red" ? "bg-red-50 text-danger" : tone === "blue" ? "bg-[#eef4ff] text-[#205f91]" : "bg-[#edf6e9] text-brand"; return <article className={`rounded-2xl border border-white p-4 shadow-sm ${styles}`}><p className="text-[9px] font-bold uppercase tracking-wide opacity-70">{label}</p><strong className="mt-2 block text-2xl">{value}</strong><p className="mt-1 text-[10px] font-semibold opacity-75">{change}</p></article>; }
function FieldRow({ name, crop, health, risk, trend }: { name: string; crop: string; health: number; risk: string; trend: string }) { return <tr><td className="py-3 font-extrabold text-brand-dark">{name}</td><td className="py-3 text-muted">{crop}</td><td className="py-3"><div className="flex items-center gap-2"><div className="h-1.5 w-20 rounded-full bg-border"><div className="h-full rounded-full bg-brand" style={{ width: `${health}%` }} /></div><strong>{health}%</strong></div></td><td className="py-3"><span className={`rounded-full px-2 py-1 text-[9px] font-bold ${risk === "High" ? "bg-red-50 text-danger" : "bg-brand-soft text-brand"}`}>{risk}</span></td><td className={`py-3 font-bold ${trend.startsWith("+") ? "text-success" : "text-danger"}`}>{trend}</td></tr>; }
function Legend({ color, label, value }: { color: string; label: string; value: string }) { return <div><span className={`mx-auto block size-2 rounded-full ${color}`} /><strong className="mt-1 block text-sm">{value}</strong><span className="text-[8px] text-muted">{label}</span></div>; }
function Risk({ label, value }: { label: string; value: number }) { return <div><div className="flex justify-between text-[10px] font-bold text-amber-950"><span>{label}</span><span>{value}%</span></div><div className="mt-1.5 h-2 rounded-full bg-white"><div className="h-full rounded-full bg-amber-600" style={{ width: `${value}%` }} /></div></div>; }

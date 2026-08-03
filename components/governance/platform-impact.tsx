"use client";

import { useState } from "react";
import { districtSummaries, impactMetrics } from "@/features/governance/data";

const cropConditions = [
  { crop: "Cotton", value: 82, color: "bg-danger" },
  { crop: "Wheat", value: 61, color: "bg-amber-600" },
  { crop: "Rice", value: 38, color: "bg-success" },
  { crop: "Maize", value: 29, color: "bg-info" },
];

export function PlatformImpact() {
  const [period, setPeriod] = useState("Last 30 days");

  return (
    <div className="min-h-[calc(100dvh-4rem)] bg-[#f6f8fc]">
      <div className="mx-auto max-w-7xl px-4 py-5 sm:px-6 lg:px-7">
        <header className="flex flex-col gap-4 md:flex-row md:items-end md:justify-between">
          <div><p className="text-[10px] font-extrabold uppercase tracking-[.16em] text-success">Transparent programme measurement</p><h1 className="mt-1 text-2xl font-bold text-brand-dark">Platform Impact</h1><p className="mt-1 max-w-2xl text-xs leading-5 text-muted">Aggregated reach, response, model performance and early-warning indicators.</p></div>
          <div className="flex gap-2"><select value={period} onChange={(event) => setPeriod(event.target.value)} aria-label="Impact reporting period" className="h-10 rounded-xl border border-brand/10 bg-white px-3 text-xs font-semibold"><option>Last 30 days</option><option>Current season</option><option>Last 12 months</option></select><button onClick={() => window.print()} className="min-h-10 rounded-xl bg-brand px-4 text-xs font-bold text-white">Export report</button></div>
        </header>

        <section className="mt-5 grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
          {impactMetrics.map((item) => <article key={item.label} className="rounded-2xl border border-brand/10 bg-white p-4 shadow-sm"><div className="flex justify-between gap-2"><p className="text-[9px] font-bold uppercase tracking-wide text-muted">{item.label}</p><span className={`text-[9px] font-bold ${item.change.startsWith("-") ? "text-info" : "text-success"}`}>{item.change}</span></div><p className="mt-2 text-xl font-extrabold text-brand-dark">{item.value}</p><p className="mt-1 text-[9px] text-muted">{item.context}</p></article>)}
        </section>

        <section className="mt-4 grid gap-4 xl:grid-cols-[minmax(0,1.55fr)_minmax(280px,.75fr)]">
          <ChartCard title="Crop scans over time" subtitle="Scans compared with detected conditions">
            <div className="mt-5 flex h-48 items-end gap-3 border-b border-border px-2">{[38, 51, 44, 72, 63, 84, 76, 91].map((value, index) => <div key={`${value}-${index}`} className="flex h-full flex-1 items-end justify-center gap-1"><div className="w-[42%] rounded-t bg-brand" style={{ height: `${value}%` }} /><div className="w-[42%] rounded-t bg-amber-400/70" style={{ height: `${Math.max(18, value - 25)}%` }} /><span className="sr-only">Period {index + 1}: {value} scans</span></div>)}</div><div className="mt-3 flex gap-5 text-[9px] font-semibold text-muted"><Legend color="bg-brand" text="Crop scans" /><Legend color="bg-amber-400" text="Detected conditions" /></div>
          </ChartCard>
          <ChartCard title="Detected conditions by crop" subtitle={period}>
            <div className="mt-5 space-y-4">{cropConditions.map((item) => <div key={item.crop}><div className="flex justify-between text-[10px] font-bold"><span>{item.crop}</span><span>{item.value}%</span></div><div className="mt-2 h-2 rounded-full bg-border"><div className={`h-full rounded-full ${item.color}`} style={{ width: `${item.value}%` }} /></div></div>)}</div>
          </ChartCard>
        </section>

        <section className="mt-4 grid gap-4 lg:grid-cols-2 xl:grid-cols-3">
          <ChartCard title="Severity distribution" subtitle="Reviewed crop-health cases"><div className="mx-auto mt-5 grid size-36 place-items-center rounded-full bg-[conic-gradient(#68a354_0_34%,#d59a25_34%_72%,#c5352e_72%_100%)]"><div className="grid size-24 place-items-center rounded-full bg-white text-center"><div><strong className="block text-xl text-brand-dark">28%</strong><span className="text-[8px] text-muted">High or critical</span></div></div></div><div className="mt-4 flex justify-center gap-3 text-[9px] text-muted"><Legend color="bg-success" text="Low 34%"/><Legend color="bg-amber-500" text="Moderate 38%"/><Legend color="bg-danger" text="High 28%"/></div></ChartCard>
          <ChartCard title="AI and expert transparency" subtitle="Only expert-reviewed cases"><dl className="mt-5 space-y-4"><Transparency label="Overall agreement" value={82} /><Transparency label="High-confidence agreement" value={91} /><Transparency label="Cases corrected" value={12} /><Transparency label="Escalated" value={6} /></dl><p className="mt-4 rounded-xl bg-[#eef4ff] p-3 text-[9px] leading-4 text-muted">Agreement is measured only on expert-reviewed cases and is not population-wide diagnostic accuracy.</p></ChartCard>
          <article className="rounded-2xl bg-brand-dark p-5 text-white shadow-[0_16px_40px_rgba(0,50,31,.18)]"><p className="text-[9px] font-bold uppercase tracking-[.15em] text-brand-soft">Critical response impact</p><h2 className="mt-3 text-xl font-bold">2,812 farmers warned</h2><p className="mt-3 text-xs leading-5 text-white/70">Crop-relevant alerts were delivered around high-risk or confirmed clusters during this period.</p><div className="mt-5 rounded-xl bg-white/10 p-4"><p className="text-[9px] font-bold uppercase text-white/60">Median warning lead time</p><p className="mt-1 text-2xl font-extrabold">18 hours</p><p className="mt-1 text-[9px] text-white/60">Before cluster escalation</p></div><div className="mt-5 flex items-center gap-2 text-[9px] text-brand-soft"><span className="grid size-5 place-items-center rounded-full bg-brand-soft text-brand-dark">✓</span>Delivery threshold achieved</div></article>
        </section>

        <section className="mt-4 grid gap-4 lg:grid-cols-2">
          <ChartCard title="District risk heatmap" subtitle="Current operational classification"><div className="mt-4 grid grid-cols-2 gap-3 sm:grid-cols-4">{districtSummaries.map((item) => <div key={item.district} className={`rounded-xl border p-4 ${item.risk === "critical" ? "border-red-200 bg-red-50 text-red-950" : item.risk === "high" ? "border-orange-200 bg-orange-50 text-orange-950" : item.risk === "moderate" ? "border-amber-200 bg-amber-50 text-amber-950" : "border-green-200 bg-green-50 text-green-950"}`}><div className="flex items-center justify-between"><span className="size-2 rounded-full bg-current"/><span className="text-[8px] font-bold uppercase">{item.risk}</span></div><p className="mt-4 text-xs font-extrabold">{item.district}</p><p className="mt-1 text-[9px] opacity-70">{item.reports} reports</p></div>)}</div></ChartCard>
          <ChartCard title="Outbreak detection timeline" subtitle="Suspected clusters reaching expert review"><div className="relative mt-6 h-44"><svg className="size-full" viewBox="0 0 600 170" preserveAspectRatio="none" aria-label="Outbreak detection timeline"><defs><linearGradient id="impact-area" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stopColor="#075f3d" stopOpacity=".22"/><stop offset="1" stopColor="#075f3d" stopOpacity="0"/></linearGradient></defs><path d="M0 145 L80 125 L145 132 L220 96 L300 35 L375 78 L460 28 L530 66 L600 40 L600 170 L0 170 Z" fill="url(#impact-area)"/><polyline points="0,145 80,125 145,132 220,96 300,35 375,78 460,28 530,66 600,40" fill="none" stroke="#075f3d" strokeWidth="4" strokeLinejoin="round"/></svg></div><p className="mt-3 text-[9px] leading-4 text-muted">Illustrative trend. Connect validated warehouse data before external reporting.</p></ChartCard>
        </section>
      </div>
    </div>
  );
}

function ChartCard({ title, subtitle, children }: { title: string; subtitle?: string; children: React.ReactNode }) { return <article className="rounded-2xl border border-brand/10 bg-white p-5 shadow-[0_8px_28px_rgba(15,45,32,.06)]"><div className="flex items-start justify-between gap-3"><h2 className="text-base font-bold text-brand-dark">{title}</h2>{subtitle && <span className="text-[9px] font-semibold text-muted">{subtitle}</span>}</div>{children}</article>; }
function Transparency({ label, value }: { label: string; value: number }) { return <div className="flex items-center gap-3"><dt className="w-36 text-[10px] text-muted">{label}</dt><div className="h-2 flex-1 rounded-full bg-border"><div className="h-full rounded-full bg-brand" style={{ width: `${value}%` }} /></div><dd className="w-8 text-right text-[10px] font-extrabold">{value}%</dd></div>; }
function Legend({ color, text }: { color: string; text: string }) { return <span className="flex items-center gap-1.5"><i className={`size-2 rounded-sm ${color}`} />{text}</span>; }

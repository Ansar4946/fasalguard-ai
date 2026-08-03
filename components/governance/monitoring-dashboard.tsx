"use client";

import Link from "next/link";
import { useState } from "react";
import { districtSummaries } from "@/features/governance/data";
import type { DistrictRisk } from "@/features/governance/types";

export function MonitoringDashboard() {
  const [range, setRange] = useState("Last 30 days");
  const [region, setRegion] = useState("Punjab");

  return (
    <div className="min-h-[calc(100dvh-4rem)] bg-[#f6f8fc]">
      <div className="mx-auto max-w-7xl px-4 py-5 sm:px-6 lg:px-7">
        <header className="flex flex-col gap-4 lg:flex-row lg:items-end lg:justify-between">
          <div><p className="text-[10px] font-extrabold uppercase tracking-[.16em] text-success">Anonymised regional intelligence</p><h1 className="mt-1 text-2xl font-extrabold tracking-tight text-brand-dark">Monitoring Dashboard</h1><p className="mt-1 text-xs leading-5 text-muted">Aggregated crop-health and outbreak indicators across monitored districts.</p></div>
          <div className="flex flex-wrap gap-2"><select value={region} onChange={(event) => setRegion(event.target.value)} aria-label="Region" className="h-10 rounded-xl border border-brand/10 bg-white px-3 text-xs font-bold"><option>Punjab</option><option>All regions</option></select><select value={range} onChange={(event) => setRange(event.target.value)} aria-label="Reporting period" className="h-10 rounded-xl border border-brand/10 bg-white px-3 text-xs font-bold"><option>Last 30 days</option><option>Last 90 days</option><option>This season</option></select><button onClick={() => window.print()} className="min-h-10 rounded-xl border border-brand/15 bg-white px-4 text-xs font-extrabold text-brand">Export data</button><button className="min-h-10 rounded-xl bg-brand px-4 text-xs font-extrabold text-white shadow-lg shadow-green-900/15">Share dashboard</button></div>
        </header>

        <section className="mt-5 grid gap-3 sm:grid-cols-2 lg:grid-cols-3 2xl:grid-cols-6">
          <Metric label="Farmers registered" value="12,450" note="Active accounts" />
          <Metric label="Fields monitored" value="21,870" note="Current season" />
          <Metric label="Districts active" value="24" note="Reporting data" />
          <Metric label="Critical outbreaks" value="7" note="Needs coordination" tone="red" />
          <Metric label="Farmers alerted" value="8,930" note="Crop-relevant alerts" tone="green" />
          <Metric label="Reports reviewed" value="73,500" note="Scan and community" />
        </section>

        <section className="mt-4 grid items-start gap-4 xl:grid-cols-[minmax(0,1fr)_300px]">
          <article className="overflow-hidden rounded-2xl border border-brand/10 bg-white shadow-[0_10px_32px_rgba(15,45,32,.07)]">
            <div className="flex flex-wrap items-center justify-between gap-3 border-b border-border px-5 py-4"><div><h2 className="text-base font-extrabold text-brand-dark">Regional risk map</h2><p className="mt-1 text-[10px] text-muted">Approximate district indicators · exact farms and identities hidden</p></div><div className="flex gap-2">{["Crop", "Disease", "Risk"].map((item, index) => <button key={item} className={`rounded-full px-3 py-1.5 text-[9px] font-bold ${index === 2 ? "bg-brand text-white" : "bg-[#eef4ff] text-muted"}`}>{item}</button>)}</div></div>
            <RegionalMap />
          </article>

          <aside className="rounded-2xl border border-brand/10 bg-white p-4 shadow-[0_10px_32px_rgba(15,45,32,.07)]">
            <div className="flex items-center justify-between"><div><p className="text-[9px] font-extrabold uppercase tracking-[.14em] text-success">Action queue</p><h2 className="mt-1 text-base font-extrabold">Recommendations</h2></div><span className="grid size-8 place-items-center rounded-full bg-brand-soft text-xs font-extrabold text-brand">3</span></div>
            <div className="mt-4 space-y-3"><Recommendation level="Critical" title="Coordinate cotton scouting" text="Prioritise Multan extension teams based on confirmed reports." /><Recommendation level="Expert" title="Review alert coverage" text="Check whether high-risk farmers opened prevention alerts." /><Recommendation level="Monitor" title="Validate wheat reports" text="Request expert sampling before escalating Sahiwal." /></div>
            <Link href="/government/advisories" className="mt-4 flex min-h-10 items-center justify-center rounded-xl border border-brand/20 text-[10px] font-extrabold text-brand">View all tasks</Link>
          </aside>
        </section>

        <section className="mt-4 overflow-hidden rounded-2xl border border-brand/10 bg-white shadow-sm">
          <div className="flex items-center justify-between border-b border-border px-5 py-4"><div><h2 className="text-base font-extrabold text-brand-dark">District monitoring status</h2><p className="mt-1 text-[10px] text-muted">Aggregated operational indicators—not individual farmer records</p></div><span className="hidden text-[9px] font-bold text-muted sm:block">{region} · {range}</span></div>
          <div className="overflow-x-auto"><table className="w-full min-w-[760px] text-left text-xs"><thead className="bg-[#f4f7f3] text-[9px] uppercase tracking-wide text-muted"><tr><th className="px-5 py-3">District</th><th className="px-4 py-3">Crop</th><th className="px-4 py-3">Risk</th><th className="px-4 py-3">Reports</th><th className="px-4 py-3">Confirmed</th><th className="px-4 py-3">Farmers warned</th><th className="px-4 py-3">Response</th><th className="px-4 py-3">Action</th></tr></thead><tbody>{districtSummaries.map((item) => <tr key={item.district} className="border-t border-border transition hover:bg-[#f8faf7]"><td className="px-5 py-3 font-extrabold text-brand-dark">{item.district}</td><td className="px-4 py-3 text-muted">{item.crop}</td><td className="px-4 py-3"><RiskPill risk={item.risk} /></td><td className="px-4 py-3 font-bold">{item.reports}</td><td className="px-4 py-3">{item.confirmed}</td><td className="px-4 py-3">{item.farmersWarned.toLocaleString()}</td><td className="px-4 py-3">{item.responseHours}h</td><td className="px-4 py-3"><Link href="/government/districts" className="font-extrabold text-brand">View →</Link></td></tr>)}</tbody></table></div>
        </section>

        <section className="mt-4 grid gap-4 md:grid-cols-2 xl:grid-cols-4">
          <MiniChart title="Reports over time" values={[25, 36, 42, 65, 84, 62, 48]} />
          <Donut />
          <SummaryCard label="Expert response time" value="4.2 hours" note="Median across monitored cases" positive />
          <SummaryCard label="Most reported condition" value="Leaf curl (72%)" note="Cotton reports in this period" />
        </section>

        <footer className="mt-5 flex flex-wrap justify-between gap-2 border-t border-brand/10 py-4 text-[9px] text-muted"><span>© 2026 FasalGuard AI · Aggregated demo data</span><span>Data privacy policy · Threshold controls · NGO partnership portal</span></footer>
      </div>
    </div>
  );
}

function RegionalMap() {
  const positions = [{ left: "48%", top: "43%" }, { left: "61%", top: "36%" }, { left: "70%", top: "62%" }, { left: "36%", top: "68%" }];
  return <div className="relative h-[420px] overflow-hidden bg-[#e8ecea]"><svg aria-hidden="true" className="absolute inset-0 size-full opacity-70" viewBox="0 0 900 460" preserveAspectRatio="none"><rect width="900" height="460" fill="#e9edeb"/><g fill="none" stroke="#c6cfca" strokeWidth="2"><path d="M-20 90C150 35 280 160 450 98S740 40 940 108"/><path d="M-20 280c180-80 300 60 490-15s290-45 470 15"/><path d="M120-20c20 150-15 280 40 500M380-20c-40 130 40 280 0 500M700-20c30 150-55 290-20 500"/></g><g fill="#cbd4cf" fontSize="18" fontFamily="sans-serif"><text x="170" y="115">Khanewal</text><text x="420" y="210">Multan</text><text x="610" y="110">Sahiwal</text><text x="620" y="350">Bahawalpur</text><text x="120" y="350">Lodhran</text></g></svg><div className="absolute inset-0 bg-[radial-gradient(circle_at_center,transparent,rgba(224,230,226,.35))]" />{districtSummaries.map((item, index) => <button key={item.district} style={positions[index]} className={`absolute z-10 grid size-10 -translate-x-1/2 -translate-y-1/2 place-items-center rounded-full border-4 border-white text-[9px] font-extrabold text-white shadow-lg ${item.risk === "critical" ? "bg-danger ring-8 ring-red-400/15" : item.risk === "high" ? "bg-amber-600 ring-8 ring-amber-400/15" : item.risk === "moderate" ? "bg-info" : "bg-success"}`} aria-label={`${item.district}: ${item.risk} risk, ${item.reports} reports`}>{item.confirmed}</button>)}<div className="absolute bottom-4 left-4 z-10 rounded-xl border border-white/60 bg-white/90 p-3 text-[9px] shadow-lg backdrop-blur"><strong className="text-brand-dark">Cluster status</strong><div className="mt-2 flex flex-wrap gap-3"><LegendDot color="bg-danger" label="Critical"/><LegendDot color="bg-amber-600" label="High"/><LegendDot color="bg-info" label="Moderate"/><LegendDot color="bg-success" label="Low"/></div></div><div className="absolute right-4 top-4 z-10 flex flex-col gap-2"><button className="grid size-9 place-items-center rounded-lg bg-white text-sm font-bold shadow">+</button><button className="grid size-9 place-items-center rounded-lg bg-white text-sm font-bold shadow">−</button></div></div>;
}

function Metric({ label, value, note, tone }: { label: string; value: string; note: string; tone?: "red" | "green" }) { return <article className={`rounded-2xl border bg-white p-4 shadow-sm ${tone === "red" ? "border-red-200" : tone === "green" ? "border-brand/25" : "border-brand/10"}`}><p className="text-[8px] font-extrabold uppercase tracking-wide text-muted">{label}</p><p className={`mt-2 text-xl font-extrabold ${tone === "red" ? "text-danger" : "text-brand-dark"}`}>{value}</p><p className="mt-1 text-[9px] text-muted">{note}</p></article>; }
function Recommendation({ level, title, text }: { level: "Critical" | "Expert" | "Monitor"; title: string; text: string }) { const critical = level === "Critical"; return <article className={`rounded-xl border p-3 ${critical ? "border-red-100 bg-red-50" : "border-brand/5 bg-[#f4f7f3]"}`}><span className={`text-[8px] font-extrabold uppercase ${critical ? "text-danger" : "text-success"}`}>{level}</span><h3 className="mt-1 text-xs font-extrabold text-brand-dark">{title}</h3><p className="mt-1 text-[10px] leading-4 text-muted">{text}</p></article>; }
function RiskPill({ risk }: { risk: DistrictRisk }) { const styles = risk === "critical" ? "bg-red-50 text-danger" : risk === "high" ? "bg-amber-100 text-amber-800" : risk === "moderate" ? "bg-blue-50 text-info" : "bg-brand-soft text-brand"; return <span className={`rounded-full px-2.5 py-1 text-[9px] font-bold capitalize ${styles}`}>{risk}</span>; }
function LegendDot({ color, label }: { color: string; label: string }) { return <span className="flex items-center gap-1 text-muted"><i className={`size-2 rounded-full ${color}`}/>{label}</span>; }
function MiniChart({ title, values }: { title: string; values: number[] }) { return <article className="rounded-2xl border border-brand/10 bg-white p-4 shadow-sm"><p className="text-xs font-extrabold text-brand-dark">{title}</p><div className="mt-4 flex h-24 items-end gap-2">{values.map((value, index) => <div key={`${value}-${index}`} className="flex-1 rounded-t bg-brand/15" style={{ height: `${value}%` }}><span className="sr-only">Period {index + 1}: {value}</span></div>)}</div><p className="mt-3 text-[9px] text-success">+18% compared with previous period</p></article>; }
function Donut() { return <article className="rounded-2xl border border-brand/10 bg-white p-4 shadow-sm"><p className="text-xs font-extrabold text-brand-dark">Crop distribution</p><div className="mx-auto mt-3 grid size-28 place-items-center rounded-full bg-[conic-gradient(#075f3d_0_73.5%,#dbe9ff_73.5%_89%,#dfe8dc_89%)]"><div className="grid size-20 place-items-center rounded-full bg-white text-center"><strong className="text-lg text-brand">73.5%</strong></div></div><p className="mt-2 text-center text-[9px] text-muted">Cotton-related reports</p></article>; }
function SummaryCard({ label, value, note, positive }: { label: string; value: string; note: string; positive?: boolean }) { return <article className="rounded-2xl border border-brand/10 bg-white p-4 shadow-sm"><p className="text-xs font-extrabold text-muted">{label}</p><p className={`mt-6 text-xl font-extrabold ${positive ? "text-success" : "text-danger"}`}>{value}</p><p className="mt-2 text-[9px] leading-4 text-muted">{note}</p></article>; }

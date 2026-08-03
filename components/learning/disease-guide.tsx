"use client";

import Image from "next/image";
import Link from "next/link";
import { useState } from "react";

const readText = "Cotton leaf curl is a viral disease complex transmitted mainly by whiteflies. Look for leaf curling, thickened veins, reduced leaf size and stunted growth. Similar symptoms can have other causes, so request expert review when symptoms spread quickly.";

export function DiseaseGuide() {
  const [saved, setSaved] = useState(false);
  const [speaking, setSpeaking] = useState(false);
  const [checks, setChecks] = useState([false, false, false]);

  function readAloud() {
    if (!("speechSynthesis" in window)) return;
    if (speaking) {
      window.speechSynthesis.cancel();
      setSpeaking(false);
      return;
    }
    const utterance = new SpeechSynthesisUtterance(readText);
    utterance.onend = () => setSpeaking(false);
    setSpeaking(true);
    window.speechSynthesis.speak(utterance);
  }

  async function share() {
    if (navigator.share) await navigator.share({ title: "Cotton Leaf Curl Guide", url: window.location.href });
    else await navigator.clipboard?.writeText(window.location.href);
  }

  return (
    <div className="min-h-[calc(100dvh-4rem)] bg-[#f8f5ec]">
      <div className="mx-auto max-w-6xl px-4 py-5 sm:px-6 lg:px-7">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <nav aria-label="Breadcrumb" className="text-[10px] font-semibold text-muted">
            <Link href="/learning" className="font-extrabold text-brand">Knowledge Centre</Link> <span aria-hidden="true">/</span> Diseases <span aria-hidden="true">/</span> Cotton leaf curl
          </nav>
          <div className="flex gap-2"><button onClick={() => setSaved(!saved)} className={`min-h-9 rounded-lg border px-3 text-[10px] font-bold ${saved ? "border-brand bg-brand-soft text-brand" : "border-border bg-white"}`}>{saved ? "Saved" : "Save"}</button><button onClick={() => void share()} className="min-h-9 rounded-lg border border-border bg-white px-3 text-[10px] font-bold">Share</button></div>
        </div>

        <section className="mt-4 overflow-hidden rounded-2xl bg-brand-dark text-white shadow-[0_16px_44px_rgba(0,50,31,.18)]">
          <div className="relative p-6 sm:p-7">
            <div className="absolute -right-12 -top-16 size-52 rounded-full border-[28px] border-white/5" />
            <div className="relative max-w-3xl">
              <div className="flex flex-wrap gap-2"><span className="rounded-full bg-brand-soft px-3 py-1 text-[9px] font-extrabold uppercase tracking-wide text-brand-dark">Disease</span><span className="rounded-full bg-white/10 px-3 py-1 text-[9px] font-bold">Expert reviewed</span></div>
              <h1 className="mt-4 text-2xl font-extrabold tracking-tight sm:text-3xl">Cotton Leaf Curl Virus (CLCuV)</h1>
              <p className="mt-3 max-w-2xl text-xs leading-5 text-white/75">A complex of begomoviruses transmitted mainly by whiteflies. Early recognition and vector monitoring can reduce the risk of field-wide spread.</p>
              <button onClick={readAloud} className="mt-5 inline-flex min-h-10 items-center gap-3 rounded-full bg-white px-4 text-[11px] font-extrabold text-brand-dark"><span className="grid size-6 place-items-center rounded-full bg-brand-soft">{speaking ? "■" : "▶"}</span>{speaking ? "Stop reading" : "Listen to guide"}</button>
            </div>
          </div>
        </section>

        <div className="mt-5 grid items-start gap-5 xl:grid-cols-[minmax(0,1fr)_280px]">
          <main className="space-y-5">
            <section className="grid gap-4 md:grid-cols-2">
              <ArticleCard title="Overview">
                <p>Cotton leaf curl can cause curling, vein thickening, reduced plant growth and lower yield. Visual symptoms alone cannot provide laboratory confirmation because nutrient, heat and pest stress may overlap.</p>
              </ArticleCard>
              <article className="rounded-2xl border border-amber-200 bg-[#fff7dd] p-5 shadow-sm">
                <h2 className="text-sm font-extrabold text-amber-950">Visual symptoms</h2>
                <ul className="mt-3 space-y-2">{["Upward or downward leaf curling", "Yellowed or thickened veins", "Small leaf-like growth beneath veins", "Reduced leaf size and stunted plants"].map((item) => <li key={item} className="flex gap-2 text-xs leading-5 text-amber-950/75"><span className="text-amber-600">●</span>{item}</li>)}</ul>
              </article>
            </section>

            <section className="rounded-2xl border border-brand/10 bg-white p-5 shadow-[0_8px_26px_rgba(15,45,32,.06)]">
              <div className="flex items-end justify-between gap-3"><div><p className="text-[9px] font-extrabold uppercase tracking-[.15em] text-success">Compare carefully</p><h2 className="mt-1 text-base font-extrabold text-brand-dark">Visual diagnostics</h2></div><Link href="/scan" className="text-[10px] font-extrabold text-brand">Scan your crop →</Link></div>
              <div className="mt-4 grid gap-4 sm:grid-cols-2">
                <Diagnostic image="/expert-case-leaf-healthy.png" title="Healthy cotton leaf" text="Even green colour, open leaf shape and no visible vein thickening." badge="Healthy reference" />
                <Diagnostic image="/expert-case-leaf-evidence.png" title="Possible cotton leaf curl" text="Curling edges, yellow veins and irregular texture require closer inspection." badge="Symptoms present" warning />
              </div>
              <p className="mt-4 rounded-xl bg-[#eef4ff] p-3 text-[10px] leading-4 text-muted"><strong className="text-brand">Important:</strong> Image comparisons are educational references, not a diagnosis. Use Crop Scan and expert review for your field.</p>
            </section>

            <ArticleCard title="Causes and transmission">
              <p>The virus complex is transmitted mainly by whiteflies moving between infected host plants and healthy cotton. Infected plant material and unmanaged alternate hosts can contribute to local persistence.</p>
              <div className="mt-4 grid gap-3 sm:grid-cols-3"><Info icon="01" label="Main vector" value="Whitefly" /><Info icon="02" label="Common spread" value="Plant-to-plant" /><Info icon="03" label="Higher risk" value="Warm conditions" /></div>
            </ArticleCard>

            <section className="rounded-2xl border border-brand/10 bg-white p-5 shadow-[0_8px_26px_rgba(15,45,32,.06)]">
              <div className="flex items-center justify-between"><h2 className="text-base font-extrabold text-brand-dark">Monitoring checklist</h2><span className="rounded-full bg-brand-soft px-3 py-1 text-[9px] font-bold text-brand">{checks.filter(Boolean).length}/{checks.length} complete</span></div>
              <div className="mt-4 space-y-2">{["Inspect leaf undersides for whiteflies", "Compare affected plants with nearby healthy plants", "Estimate the affected field percentage"].map((item, index) => <label key={item} className={`flex cursor-pointer items-start gap-3 rounded-xl border p-3 text-xs font-semibold transition ${checks[index] ? "border-brand/20 bg-[#edf6e9] text-muted line-through" : "border-border bg-white"}`}><input type="checkbox" checked={checks[index]} onChange={() => setChecks((current) => current.map((value, itemIndex) => itemIndex === index ? !value : value))} className="mt-0.5 size-4 accent-brand" />{item}</label>)}</div>
            </section>
          </main>

          <aside className="space-y-4 xl:sticky xl:top-20">
            <section className="rounded-2xl border border-brand/10 bg-white p-4 shadow-[0_8px_26px_rgba(15,45,32,.06)]">
              <h2 className="text-sm font-extrabold">Article controls</h2>
              <div className="mt-3 grid grid-cols-2 gap-2"><button onClick={() => setSaved(!saved)} className="min-h-10 rounded-xl border border-brand/15 text-[10px] font-bold text-brand">{saved ? "Saved" : "Save offline"}</button><button onClick={() => void share()} className="min-h-10 rounded-xl border border-brand/15 text-[10px] font-bold text-brand">Share</button></div>
              <button onClick={readAloud} className="mt-2 min-h-10 w-full rounded-xl bg-[#edf6e9] text-[10px] font-bold text-brand">{speaking ? "Stop audio" : "Listen to article"}</button>
            </section>
            <section className="rounded-2xl border border-red-200 bg-red-50 p-4">
              <p className="text-[9px] font-extrabold uppercase tracking-[.14em] text-danger">Escalation guidance</p><h2 className="mt-2 text-sm font-extrabold text-red-950">When to contact an expert</h2><p className="mt-2 text-xs leading-5 text-red-950/75">Escalate when symptoms spread quickly, affect young plants or appear with heavy whitefly activity.</p><Link href="/consultations" className="mt-4 flex min-h-10 items-center justify-center rounded-xl bg-danger px-4 text-[11px] font-extrabold text-white">Ask an expert</Link>
            </section>
            <SideList title="Prevention tips" items={["Monitor vectors and field borders", "Use locally recommended tolerant varieties", "Remove alternative host weeds responsibly"]} />
            <section className="rounded-2xl border border-brand/10 bg-white p-4 shadow-sm"><h2 className="text-sm font-extrabold">Related guides</h2><div className="mt-3 space-y-3"><Link href="/learning/whitefly-monitoring" className="block text-xs font-bold text-brand">Advanced Whitefly Monitoring →</Link><Link href="/learning/healthy-cotton-leaf" className="block text-xs font-bold text-brand">Healthy Cotton Leaf Guide →</Link></div></section>
          </aside>
        </div>
        <footer className="mt-6 border-t border-brand/10 py-4 text-center text-[10px] text-muted">Educational content · Last reviewed 1 August 2026 · Local expert validation required before publication</footer>
      </div>
    </div>
  );
}

function ArticleCard({ title, children }: { title: string; children: React.ReactNode }) {
  return <article className="rounded-2xl border border-brand/10 bg-white p-5 text-xs leading-5 text-muted shadow-[0_8px_26px_rgba(15,45,32,.06)]"><h2 className="mb-3 text-base font-extrabold text-brand-dark">{title}</h2>{children}</article>;
}

function Diagnostic({ image, title, text, badge, warning }: { image: string; title: string; text: string; badge: string; warning?: boolean }) {
  return <article><div className="relative h-48 overflow-hidden rounded-xl bg-[#dce8d7]"><Image src={image} alt={title} fill unoptimized sizes="(max-width: 640px) 100vw, 40vw" className="object-cover" /><span className={`absolute left-3 top-3 rounded-full px-2.5 py-1 text-[8px] font-extrabold uppercase shadow ${warning ? "bg-red-50 text-danger" : "bg-white text-brand"}`}>{badge}</span></div><h3 className="mt-3 text-sm font-extrabold text-brand-dark">{title}</h3><p className="mt-1 text-xs leading-5 text-muted">{text}</p></article>;
}

function Info({ icon, label, value }: { icon: string; label: string; value: string }) {
  return <div className="rounded-xl bg-[#edf6e9] p-4"><span className="grid size-7 place-items-center rounded-lg bg-white text-[9px] font-extrabold text-brand">{icon}</span><p className="mt-3 text-[9px] font-bold uppercase text-muted">{label}</p><p className="mt-1 text-xs font-extrabold text-brand-dark">{value}</p></div>;
}

function SideList({ title, items }: { title: string; items: string[] }) {
  return <section className="rounded-2xl border border-brand/10 bg-white p-4 shadow-sm"><h2 className="text-sm font-extrabold">{title}</h2><ul className="mt-3 space-y-3">{items.map((item) => <li key={item} className="flex gap-2 text-[11px] leading-4 text-muted"><span className="mt-0.5 grid size-4 shrink-0 place-items-center rounded-full bg-brand-soft text-[8px] font-bold text-brand">✓</span>{item}</li>)}</ul></section>;
}

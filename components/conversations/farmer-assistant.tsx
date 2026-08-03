"use client";

import Link from "next/link";
import { useState } from "react";
import { assistantContext } from "@/features/conversations/data";
import type { ChatMessage } from "@/features/conversations/types";

const starters = [
  "Why are my cotton leaves curling?",
  "Show my latest crop report",
  "Are there nearby outbreaks?",
];

export function FarmerAssistant() {
  const [messages, setMessages] = useState<ChatMessage[]>([]);
  const [draft, setDraft] = useState("");
  const [listening, setListening] = useState(false);

  function answer(question: string) {
    const lower = question.toLowerCase();
    if (lower.includes("outbreak")) return "There are two active community alerts in your wider district. Neither is expert-confirmed near North Field yet. Continue monitoring and report any spreading symptoms.";
    if (lower.includes("report") || lower.includes("scan")) return "Your latest crop-health report shows a 72% health score and a high leaf-curl risk. The result is preliminary, so request expert verification before treatment.";
    if (lower.includes("spray") || lower.includes("rain")) return "Avoid spraying before rainfall or during strong wind. Check the product label and local forecast, then confirm the treatment with an agriculture expert.";
    return "Leaf curling can be linked to whiteflies, heat stress or uneven moisture. Inspect ten nearby plants, photograph the underside of affected leaves and record whether symptoms are spreading.";
  }

  function send(text = draft) {
    const clean = text.trim();
    if (!clean) return;
    const now = new Date().toISOString();
    setMessages((current) => [
      ...current,
      { id: crypto.randomUUID(), author: "farmer", text: clean, createdAt: now, status: "sent" },
      { id: crypto.randomUUID(), author: "assistant", text: answer(clean), createdAt: now, status: "sent" },
    ]);
    setDraft("");
  }

  return (
    <div className="h-[calc(100dvh-4rem)] min-h-0 overflow-hidden bg-[#f6f8fc]">
      <div className="grid h-full min-h-0 xl:grid-cols-[minmax(0,1fr)_300px]">
        <main className="flex min-h-0 min-w-0 flex-col">
          <header className="flex min-h-16 shrink-0 items-center gap-3 border-b border-[#dbe5ef] bg-white px-5 sm:px-7">
            <div className="grid size-9 place-items-center rounded-xl bg-brand text-xs font-extrabold text-white">AI</div>
            <div>
              <h1 className="text-base font-extrabold text-brand-dark">FasalGuard Assistant</h1>
              <p className="text-[11px] text-muted">Ask about crops, fields and risks</p>
            </div>
            <div className="ml-auto flex items-center gap-2">
              <span className="hidden rounded-full bg-brand-soft px-3 py-1.5 text-[10px] font-bold text-brand sm:inline">Field-aware</span>
              <button aria-label="Assistant information" className="grid size-9 place-items-center rounded-lg border border-border text-xs font-bold text-muted">i</button>
            </div>
          </header>

          <div className="min-h-0 flex-1 overflow-y-auto overscroll-contain px-4 py-5 sm:px-7">
            <div className="mx-auto max-w-3xl space-y-5">
              <DirectAnswer />

              {messages.length > 0 && (
                <section className="space-y-3 border-t border-border pt-5" aria-live="polite">
                  {messages.map((message) => <AssistantMessage key={message.id} message={message} />)}
                </section>
              )}

              <section className="rounded-2xl border border-brand/10 bg-white p-4 shadow-[0_10px_30px_rgba(15,45,32,.06)]">
                <div className="flex items-center justify-between gap-3">
                  <div>
                    <p className="text-[10px] font-extrabold uppercase tracking-[.14em] text-brand">Recommended next action</p>
                    <p className="mt-2 text-xs leading-5 text-foreground/75">Apply a localized spray of micronutrients only after expert review, then schedule an irrigation-cycle check within 24 hours.</p>
                  </div>
                  <button className="shrink-0 rounded-xl bg-[#3c6929] px-4 py-3 text-xs font-extrabold text-white shadow-lg shadow-green-900/15">Create task</button>
                </div>
                <div className="mt-4 flex flex-wrap items-center gap-3 border-t border-border pt-3 text-[10px] font-semibold">
                  <Link href="/crop-health/FG-98441" className="text-brand hover:underline">Full crop report</Link>
                  <span className="text-border">•</span>
                  <Link href="/consultations" className="text-brand hover:underline">Expert guide</Link>
                  <span className="ml-auto rounded-full bg-amber-100 px-3 py-1 text-amber-800">Expert review recommended</span>
                </div>
              </section>

              <div className="rounded-xl border border-brand/10 bg-white px-4 py-3 text-[10px] leading-4 text-muted">
                <strong className="text-brand">AI safety:</strong> Guidance is based on available farm data and cannot confirm a diagnosis or replace pesticide labels and expert advice.
              </div>
            </div>
          </div>

          <div className="shrink-0 border-t border-[#dbe5ef] bg-white/95 px-4 py-3 shadow-[0_-8px_24px_rgba(15,45,32,.05)] backdrop-blur sm:px-7">
            <div className="mx-auto max-w-3xl">
              <p className="mb-2 text-xs font-extrabold text-brand-dark">Are there any nearby outbreaks reported by other farmers today?</p>
              <div className="mb-2 flex gap-2 overflow-x-auto pb-1">{starters.map((item) => <button key={item} onClick={() => send(item)} className="shrink-0 rounded-full border border-brand/15 bg-white px-3 py-2 text-[10px] font-bold text-brand transition hover:bg-brand-soft">{item}</button>)}</div>
              <form onSubmit={(event) => { event.preventDefault(); send(); }} className="flex items-center gap-2">
                <button type="button" onClick={() => setListening(!listening)} aria-pressed={listening} aria-label={listening ? "Stop voice input" : "Start voice input"} className={`grid size-11 shrink-0 place-items-center rounded-xl border text-xs font-bold ${listening ? "border-danger bg-red-50 text-danger" : "border-border text-brand"}`}>Mic</button>
                <label className="flex-1"><span className="sr-only">Ask FasalGuard Assistant</span><input value={draft} onChange={(event) => setDraft(event.target.value)} placeholder="Ask in English, Urdu or Punjabi..." className="h-11 w-full rounded-xl border border-[#dbe5ef] bg-[#f5f8fc] px-4 text-xs focus:border-brand focus:bg-white" /></label>
                <button disabled={!draft.trim()} className="min-h-11 rounded-xl bg-brand px-5 text-xs font-extrabold text-white shadow-lg shadow-green-900/15 disabled:opacity-40">Send</button>
              </form>
              {listening && <p role="status" className="mt-2 text-[10px] font-bold text-danger">Voice input is active. Speak now.</p>}
            </div>
          </div>
        </main>

        <FieldContext />
      </div>
    </div>
  );
}

function DirectAnswer() {
  return (
    <section className="rounded-2xl border border-brand/10 bg-white p-5 shadow-[0_14px_40px_rgba(15,45,32,.07)]">
      <div className="flex items-start gap-3">
        <div className="grid size-9 shrink-0 place-items-center rounded-xl bg-brand text-[10px] font-extrabold text-white">AI</div>
        <div>
          <p className="text-[10px] font-extrabold uppercase tracking-[.14em] text-brand">Direct answer</p>
          <h2 className="mt-2 text-base font-extrabold leading-6 text-brand-dark">Your cotton leaf curling is likely an early warning sign—not yet a confirmed disease.</h2>
          <p className="mt-2 text-xs leading-5 text-foreground/70">Recent field photos and moisture data suggest early-stage jassid pressure or heat stress. Avoid broad spraying until the cause is verified.</p>
        </div>
      </div>
      <div className="mt-5 grid gap-3 sm:grid-cols-2">
        <AnswerCard tone="green" title="Evidence" items={["Yellowing margins in North Field", "32°C temperature stress", "Visual confidence: 88%"]} />
        <AnswerCard tone="amber" title="Confidence and limitations" items={["High confidence; no lab sample", "May overlap with nutrient stress", "Field inspection still required"]} />
      </div>
    </section>
  );
}

function AnswerCard({ title, items, tone }: { title: string; items: string[]; tone: "green" | "amber" }) {
  return <div className={`rounded-2xl p-4 ${tone === "green" ? "bg-[#edf6e9]" : "bg-[#fff7dd]"}`}><p className={`text-[10px] font-extrabold uppercase tracking-[.12em] ${tone === "green" ? "text-brand" : "text-amber-800"}`}>{title}</p><ul className="mt-3 space-y-2">{items.map((item) => <li key={item} className="flex gap-2 text-[11px] leading-4 text-foreground/70"><span className={tone === "green" ? "text-success" : "text-amber-600"}>●</span>{item}</li>)}</ul></div>;
}

function FieldContext() {
  return (
    <aside className="hidden min-h-0 overflow-y-auto border-l border-[#dbe5ef] bg-white p-5 xl:block">
      <div className="flex items-center justify-between"><p className="text-[10px] font-extrabold uppercase tracking-[.16em] text-muted">Field context</p><span className="grid size-6 place-items-center rounded-full border border-border text-[9px] text-muted">i</span></div>
      <section className="mt-4 rounded-2xl border border-amber-200 bg-[#fff7dd] p-4"><p className="text-[9px] font-bold uppercase text-amber-800">Current field</p><h2 className="mt-2 text-sm font-extrabold text-brand-dark">{assistantContext.farmName}</h2><p className="mt-1 text-[10px] text-muted">{assistantContext.fieldName} · {assistantContext.crop}</p><span className="mt-3 inline-flex rounded-full bg-amber-100 px-2.5 py-1 text-[9px] font-bold text-amber-800">{assistantContext.growthStage} stage</span></section>
      <div className="mt-3 space-y-2">
        <Metric label="Health score" value={`${assistantContext.healthScore}%`} tone="green" progress={assistantContext.healthScore} />
        <Metric label="Current risk" value="High" tone="red" />
        <Metric label="Nearby alerts" value={`${assistantContext.activeAlerts} active`} tone="blue" />
        <Metric label="Weather" value="32°C" detail="Partly cloudy · Humidity 45%" tone="blue" />
      </div>
      <div className="mt-4 overflow-hidden rounded-2xl border border-brand/10 bg-[#dcebd4] shadow-sm">
        <div className="h-32 bg-[linear-gradient(135deg,rgba(0,69,45,.08),rgba(60,105,41,.30)),url('/expert-case-leaf-healthy.png')] bg-cover bg-center" />
        <Link href="/farms" className="flex min-h-11 items-center justify-between bg-brand px-4 text-[10px] font-extrabold text-white">View detailed map <span>→</span></Link>
      </div>
      <Link href="/alerts" className="mt-4 flex min-h-11 items-center justify-center rounded-xl bg-danger px-4 text-xs font-extrabold text-white shadow-lg shadow-red-900/10">Emergency advice</Link>
    </aside>
  );
}

function Metric({ label, value, detail, tone, progress }: { label: string; value: string; detail?: string; tone: "green" | "red" | "blue"; progress?: number }) {
  const styles = tone === "red" ? "bg-red-50 text-danger" : tone === "green" ? "bg-[#edf6e9] text-brand" : "bg-[#eaf2ff] text-[#205f91]";
  return <div className={`rounded-2xl p-4 ${styles}`}><p className="text-[9px] font-bold uppercase opacity-70">{label}</p><div className="mt-1 flex items-end justify-between"><strong className="text-sm capitalize">{value}</strong>{tone === "red" && <span className="text-xs">▲</span>}</div>{progress !== undefined && <div className="mt-3 h-1.5 rounded-full bg-white"><div className="h-full rounded-full bg-brand" style={{ width: `${progress}%` }} /></div>}{detail && <p className="mt-1 text-[9px] opacity-70">{detail}</p>}</div>;
}

function AssistantMessage({ message }: { message: ChatMessage }) {
  const farmer = message.author === "farmer";
  return <div className={`flex ${farmer ? "justify-end" : "justify-start"}`}><div className={`max-w-[82%] rounded-2xl px-4 py-3 text-xs leading-5 shadow-sm ${farmer ? "rounded-tr-sm bg-brand text-white" : "rounded-tl-sm border border-brand/10 bg-white"}`}>{message.text}</div></div>;
}

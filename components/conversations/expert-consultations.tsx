"use client";

import Link from "next/link";
import { useMemo, useState } from "react";
import { Icon } from "@/components/ui/icon";
import { consultationThreads } from "@/features/conversations/data";
import type { ChatMessage, ConsultationThread } from "@/features/conversations/types";

type Filter = "All" | "Urgent" | "Assigned" | "Waiting";

const fieldNames = ["North Field", "East Plot", "Main Field"];

export function ExpertConsultations() {
  const [selectedId, setSelectedId] = useState(consultationThreads[0].id);
  const [search, setSearch] = useState("");
  const [filter, setFilter] = useState<Filter>("All");
  const [draft, setDraft] = useState("");
  const [messages, setMessages] = useState<Record<string, ChatMessage[]>>(() =>
    Object.fromEntries(consultationThreads.map((thread) => [thread.id, thread.messages])),
  );
  const [caseStatus, setCaseStatus] = useState("In Progress");
  const [checks, setChecks] = useState([true, false, false]);
  const [playing, setPlaying] = useState(false);

  const selected = consultationThreads.find((thread) => thread.id === selectedId) ?? consultationThreads[0];
  const threads = useMemo(() => {
    const query = search.trim().toLowerCase();
    return consultationThreads.filter((thread) => {
      const matchesSearch = !query || `${thread.farmerName} ${thread.caseId} ${thread.crop}`.toLowerCase().includes(query);
      const matchesFilter = filter === "All" ||
        (filter === "Urgent" && thread.priority === "urgent") ||
        (filter === "Assigned" && thread.unread === 0) ||
        (filter === "Waiting" && thread.unread > 0);
      return matchesSearch && matchesFilter;
    });
  }, [filter, search]);

  function sendMessage(event: React.FormEvent) {
    event.preventDefault();
    const text = draft.trim();
    if (!text) return;
    const message: ChatMessage = {
      id: crypto.randomUUID(),
      author: "expert",
      text,
      createdAt: new Date().toISOString(),
      status: "sent",
    };
    setMessages((current) => ({ ...current, [selected.id]: [...(current[selected.id] ?? []), message] }));
    setDraft("");
  }

  return (
    <div className="h-[calc(100dvh-4rem)] min-h-0 overflow-hidden bg-[#f4f7f3]">
      <div className="grid h-full min-h-0 md:grid-cols-[250px_minmax(0,1fr)] 2xl:grid-cols-[270px_minmax(520px,1fr)_300px]">
        <ConsultationInbox
          filter={filter}
          messages={messages}
          search={search}
          selectedId={selected.id}
          threads={threads}
          onFilter={setFilter}
          onSearch={setSearch}
          onSelect={setSelectedId}
        />

        <main className="flex min-h-0 min-w-0 flex-col bg-[#f5f7fc]">
          <ConversationHeader thread={selected} />
          <div className="min-h-0 flex-1 overflow-y-auto overscroll-contain px-4 py-5 sm:px-6" aria-live="polite">
            <div className="mx-auto max-w-3xl space-y-5">
              <section className="rounded-2xl border border-amber-200/80 border-l-4 border-l-amber-600 bg-[#fff9e8] p-4 shadow-[0_8px_24px_rgba(90,65,20,.06)]">
                <div className="flex items-center gap-2 text-xs font-extrabold text-amber-900">
                  <span className="grid size-6 place-items-center rounded-lg bg-amber-100">AI</span>
                  AI Quick Summary
                </div>
                <p className="mt-2 text-xs leading-5 text-amber-950/75">
                  Symptoms are affecting {selected.crop.toLowerCase()} in {selected.district}. AI screening is
                  <strong> {Math.round(selected.confidence * 100)}% confident</strong> of {selected.disease}. Verify the
                  evidence before recommending any treatment.
                </p>
              </section>
              <Conversation
                items={messages[selected.id] ?? []}
                selectedId={selected.id}
                playing={playing}
                setPlaying={setPlaying}
              />
            </div>
          </div>
          <Composer draft={draft} setDraft={setDraft} onSubmit={sendMessage} />
        </main>

        <CaseContext
          checks={checks}
          caseStatus={caseStatus}
          selected={selected}
          setCaseStatus={setCaseStatus}
          setChecks={setChecks}
        />
      </div>
    </div>
  );
}

function ConsultationInbox(props: {
  filter: Filter;
  messages: Record<string, ChatMessage[]>;
  search: string;
  selectedId: string;
  threads: ConsultationThread[];
  onFilter: (value: Filter) => void;
  onSearch: (value: string) => void;
  onSelect: (value: string) => void;
}) {
  return (
    <aside className="hidden min-h-0 flex-col border-r border-[#dbe5ef] bg-[#eef4ff] md:flex">
      <div className="border-b border-[#dbe5ef] bg-white p-4">
        <label className="relative block">
          <span className="sr-only">Search consultations</span>
          <Icon name="search" className="absolute left-3 top-1/2 size-4 -translate-y-1/2 text-muted" />
          <input
            value={props.search}
            onChange={(event) => props.onSearch(event.target.value)}
            type="search"
            placeholder="Search cases..."
            className="h-10 w-full rounded-xl border border-transparent bg-[#eef4ff] pl-10 pr-3 text-xs transition focus:border-brand/30 focus:bg-white"
          />
        </label>
        <div className="mt-3 grid grid-cols-4 gap-1 rounded-xl bg-[#eef4ff] p-1">
          {(["All", "Urgent", "Assigned", "Waiting"] as Filter[]).map((item) => (
            <button
              key={item}
              onClick={() => props.onFilter(item)}
              className={`min-h-8 rounded-lg px-2 text-[10px] font-bold transition ${props.filter === item ? "bg-brand text-white shadow-sm" : "text-muted hover:bg-white"}`}
            >
              {item}
            </button>
          ))}
        </div>
      </div>
      <div className="min-h-0 flex-1 space-y-2 overflow-y-auto p-3">
        {props.threads.map((thread) => {
          const originalIndex = consultationThreads.findIndex((item) => item.id === thread.id);
          const active = props.selectedId === thread.id;
          return (
            <button
              key={thread.id}
              onClick={() => props.onSelect(thread.id)}
              className={`w-full rounded-2xl border p-4 text-left transition duration-200 ${active ? "border-brand/30 bg-[#b6eb9e] shadow-[0_8px_20px_rgba(7,95,61,.10)]" : "border-white bg-white hover:border-brand/15 hover:shadow-md"}`}
            >
              <div className="flex items-start justify-between gap-2">
                <strong className="text-sm text-brand-dark">{thread.farmerName}</strong>
                <PriorityPill priority={thread.priority} />
              </div>
              <p className="mt-1 text-[10px] font-medium text-muted">{thread.crop} · {fieldNames[originalIndex]}</p>
              <p className="mt-3 line-clamp-2 text-xs leading-5 text-foreground/80">{(props.messages[thread.id] ?? []).at(-1)?.text}</p>
              <div className="mt-3 flex justify-between text-[10px] font-semibold text-muted">
                <span>{thread.unread ? "● In progress" : "Assigned"}</span>
                <span>{originalIndex === 0 ? "2m" : originalIndex === 1 ? "14m" : "1h"} ago</span>
              </div>
            </button>
          );
        })}
        {!props.threads.length && <p className="p-6 text-center text-xs text-muted">No matching consultations.</p>}
      </div>
      <button className="m-3 min-h-11 rounded-xl bg-danger text-xs font-extrabold text-white shadow-lg shadow-red-900/10">
        Emergency alert
      </button>
    </aside>
  );
}

function ConversationHeader({ thread }: { thread: ConsultationThread }) {
  return (
    <header className="flex min-h-16 shrink-0 items-center gap-3 border-b border-[#dbe5ef] bg-white px-5 shadow-[0_2px_8px_rgba(15,45,32,.05)]">
      <div className="grid size-9 place-items-center rounded-full bg-brand-soft text-xs font-extrabold text-brand">{initials(thread.farmerName)}</div>
      <div className="min-w-0">
        <h1 className="truncate text-sm font-extrabold text-brand-dark">{thread.farmerName}</h1>
        <p className="truncate text-[10px] text-muted"><span className="text-success">●</span> Online · {thread.crop} Expert Panel</p>
      </div>
      <div className="ml-auto flex gap-1">
        <HeaderAction label="Start audio call">Call</HeaderAction>
        <HeaderAction label="Start video call">Video</HeaderAction>
        <HeaderAction label="More consultation options">•••</HeaderAction>
      </div>
    </header>
  );
}

function Conversation({ items, selectedId, playing, setPlaying }: {
  items: ChatMessage[];
  selectedId: string;
  playing: boolean;
  setPlaying: (value: boolean) => void;
}) {
  return (
    <div className="space-y-4 pb-2">
      {items.map((message) => message.author === "system" ? (
        <div key={message.id} className="mx-auto max-w-lg rounded-2xl border border-[#dbe5ef] bg-white/90 p-4 text-center text-[11px] leading-5 text-muted shadow-sm">
          {message.text}<strong className="mt-1 block text-brand">{message.attachmentLabel}</strong>
        </div>
      ) : <Message key={message.id} message={message} />)}
      {selectedId === "consult-1" && (
        <div className="max-w-md">
          <div className="overflow-hidden rounded-2xl border border-white bg-white shadow-[0_12px_32px_rgba(15,45,32,.14)]">
            <div className="h-52 bg-cover bg-center" style={{ backgroundImage: "url('/expert-case-leaf-evidence.png')" }} role="img" aria-label="Cotton leaf evidence uploaded by farmer" />
            <div className="flex items-center justify-between px-4 py-3">
              <div><p className="text-xs font-bold">Crop evidence</p><p className="text-[10px] text-muted">leaf-scan-01.jpg · 2.4 MB</p></div>
              <Link href="/expert/cases/FG-8821" className="rounded-lg bg-brand-soft px-3 py-2 text-[10px] font-bold text-brand">Inspect image</Link>
            </div>
          </div>
          <div className="mt-3 max-w-xs rounded-2xl rounded-tl-sm bg-[#dbe9ff] p-3 shadow-sm">
            <div className="flex items-center gap-3">
              <button onClick={() => setPlaying(!playing)} className="grid size-9 place-items-center rounded-full bg-brand text-[10px] font-bold text-white">{playing ? "Pause" : "Play"}</button>
              <div className="flex-1"><div className="h-1.5 rounded-full bg-white"><div className={`h-full rounded-full bg-brand transition-all ${playing ? "w-2/3" : "w-1/3"}`} /></div><div className="mt-1.5 flex justify-between text-[9px] text-muted"><span>0:12</span><span>Voice note</span></div></div>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

function Message({ message }: { message: ChatMessage }) {
  const expert = message.author === "expert";
  return (
    <div className={`flex ${expert ? "justify-end" : "justify-start"}`}>
      <div className={`max-w-[78%] rounded-2xl px-4 py-3 text-xs leading-5 shadow-sm ${expert ? "rounded-tr-sm bg-brand text-white" : "rounded-tl-sm bg-[#dbe9ff] text-foreground"}`}>
        <p>{message.text}</p>
        <time className={`mt-1.5 block text-[9px] ${expert ? "text-white/65" : "text-muted"}`}>{expert ? "Read" : "Received"} · recent</time>
      </div>
    </div>
  );
}

function Composer({ draft, setDraft, onSubmit }: { draft: string; setDraft: (value: string) => void; onSubmit: (event: React.FormEvent) => void }) {
  return (
    <form onSubmit={onSubmit} className="shrink-0 border-t border-[#dbe5ef] bg-white/95 p-3 shadow-[0_-8px_24px_rgba(15,45,32,.05)] backdrop-blur">
      <div className="mx-auto flex max-w-3xl items-end gap-2">
        <button type="button" aria-label="Attach image or document" className="grid size-10 shrink-0 place-items-center rounded-xl text-lg text-brand hover:bg-brand-soft">+</button>
        <label className="relative flex-1"><span className="sr-only">Type expert advice</span><textarea value={draft} onChange={(event) => setDraft(event.target.value)} onKeyDown={(event) => { if (event.key === "Enter" && !event.shiftKey) { event.preventDefault(); event.currentTarget.form?.requestSubmit(); } }} rows={1} placeholder="Type your expert advice..." className="min-h-11 w-full resize-none rounded-xl border border-[#dbe5ef] bg-[#f5f8fc] px-4 py-3 pr-16 text-xs focus:border-brand focus:bg-white" /><span className="absolute right-3 top-3 text-[9px] font-bold text-brand">اردو</span></label>
        <button disabled={!draft.trim()} className="min-h-11 shrink-0 rounded-xl bg-brand px-5 text-xs font-extrabold text-white shadow-lg shadow-green-900/15 transition hover:-translate-y-0.5 disabled:opacity-40">Send</button>
      </div>
    </form>
  );
}

function CaseContext({ selected, checks, setChecks, caseStatus, setCaseStatus }: {
  selected: ConsultationThread;
  checks: boolean[];
  setChecks: React.Dispatch<React.SetStateAction<boolean[]>>;
  caseStatus: string;
  setCaseStatus: (value: string) => void;
}) {
  return (
    <aside className="hidden min-h-0 flex-col border-l border-[#dbe5ef] bg-white 2xl:flex">
      <div className="min-h-0 flex-1 overflow-y-auto overscroll-contain">
        <section className="border-b border-[#e6ece7] p-5">
          <p className="text-[10px] font-extrabold uppercase tracking-[.16em] text-muted">Farmer profile</p>
          <div className="mt-4 flex items-center gap-3"><div className="grid size-14 place-items-center rounded-2xl bg-[linear-gradient(145deg,#b7efd0,#8dd8b2)] text-lg font-extrabold text-brand">{initials(selected.farmerName)}</div><div><h2 className="text-base font-extrabold">{selected.farmerName}</h2><p className="text-[10px] text-muted">{selected.district}, Punjab</p></div></div>
          <dl className="mt-4 grid grid-cols-2 gap-2"><Info label="Farm size" value="12 acres" /><Info label="Member since" value="Mar 2023" /></dl>
        </section>
        <section className="border-b border-[#e6ece7] p-5">
          <div className="flex items-center justify-between"><p className="text-[10px] font-extrabold uppercase tracking-[.16em] text-muted">Active case</p><PriorityPill priority={selected.priority} /></div>
          <div className="mt-4 rounded-2xl border border-brand/15 bg-[#edf6e9] p-4"><p className="text-[9px] font-bold uppercase text-brand/65">Diagnosis</p><h3 className="mt-1 text-base font-extrabold text-brand">{selected.disease}</h3><div className="mt-3 h-1.5 rounded-full bg-white"><div className="h-full rounded-full bg-brand" style={{ width: `${selected.confidence * 100}%` }} /></div><p className="mt-2 text-[10px] font-bold text-brand">AI confidence {Math.round(selected.confidence * 100)}%</p></div>
          <div className="mt-3 grid grid-cols-2 gap-2"><Info label="Temperature" value="34°C" /><Info label="Humidity" value="75%" /></div>
          <Link href={`/expert/cases/${selected.caseId}`} className="mt-3 grid min-h-10 place-items-center rounded-xl border border-brand/20 text-[10px] font-extrabold text-brand transition hover:bg-brand-soft">Open full case</Link>
        </section>
        <section className="p-5">
          <p className="text-[10px] font-extrabold uppercase tracking-[.16em] text-muted">Action checklist</p>
          <div className="mt-4 space-y-3">{["Initial symptoms verified", "Request whitefly count image", "Prepare safe next-step advice"].map((item, index) => <label key={item} className="flex cursor-pointer gap-2 text-[11px] leading-4"><input type="checkbox" checked={checks[index]} onChange={() => setChecks((values) => values.map((value, itemIndex) => itemIndex === index ? !value : value))} className="mt-0.5 size-4 accent-brand" /><span className={checks[index] ? "text-muted line-through" : ""}>{item}</span></label>)}</div>
          <label className="mt-5 block text-[10px] font-extrabold uppercase tracking-[.14em] text-muted">Case status<select value={caseStatus} onChange={(event) => setCaseStatus(event.target.value)} className="mt-2 h-11 w-full rounded-xl border border-[#dbe5ef] bg-[#eef4ff] px-3 text-xs font-bold normal-case"><option>In Progress</option><option>Waiting for Farmer</option><option>Scheduled Inspection</option><option>Resolved</option></select></label>
        </section>
      </div>
      <div className="shrink-0 border-t border-[#dbe5ef] bg-white p-4 shadow-[0_-8px_24px_rgba(15,45,32,.06)]">
        <div className="grid grid-cols-2 gap-2"><ContextAction>Request image</ContextAction><ContextAction>Schedule visit</ContextAction></div>
        <button className="mt-2 min-h-11 w-full rounded-xl bg-brand text-xs font-extrabold text-white shadow-lg shadow-green-900/15">Resolve case</button>
      </div>
    </aside>
  );
}

function PriorityPill({ priority }: { priority: ConsultationThread["priority"] }) {
  return <span className={`rounded-full px-2.5 py-1 text-[8px] font-extrabold uppercase ${priority === "urgent" ? "bg-red-100 text-danger" : priority === "high" ? "bg-amber-100 text-amber-800" : "bg-slate-100 text-slate-600"}`}>{priority}</span>;
}

function HeaderAction({ label, children }: { label: string; children: React.ReactNode }) {
  return <button aria-label={label} title={label} className="grid min-h-9 place-items-center rounded-lg px-3 text-[10px] font-bold text-muted transition hover:bg-surface-soft hover:text-brand">{children}</button>;
}

function Info({ label, value }: { label: string; value: string }) {
  return <div className="rounded-xl bg-[#eef4ff] p-3"><dt className="text-[8px] font-bold uppercase text-muted">{label}</dt><dd className="mt-1 text-xs font-extrabold text-brand">{value}</dd></div>;
}

function ContextAction({ children }: { children: React.ReactNode }) {
  return <button className="min-h-11 rounded-xl border border-brand/15 bg-[#edf6e9] px-2 text-[10px] font-extrabold text-brand transition hover:border-brand/30 hover:bg-brand-soft">{children}</button>;
}

function initials(value: string) {
  return value.split(" ").map((part) => part[0]).join("").slice(0, 2).toUpperCase();
}

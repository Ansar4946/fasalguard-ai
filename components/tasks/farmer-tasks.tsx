"use client";

import { useMemo, useState } from "react";
import Link from "next/link";
import { Icon } from "@/components/ui/icon";

type Filter = "all" | "today" | "upcoming" | "completed";
type Task = { id: number; title: string; detail: string; source: string; due: string; group: Exclude<Filter,"all">; priority: "High"|"Medium"|"Low" };
const initial: Task[] = [
  {id:1,title:"Inspect young cotton leaves",detail:"Check North Field for curling, yellow veins and visible whiteflies.",source:"Weather intelligence",due:"Today · 5:00 PM",group:"today",priority:"High"},
  {id:2,title:"Upload follow-up field image",detail:"Capture one close leaf image and one whole-plant image for expert review.",source:"AI action plan",due:"Today · 6:30 PM",group:"today",priority:"High"},
  {id:3,title:"Review irrigation schedule",detail:"High humidity is forecast. Confirm irrigation only after checking soil moisture.",source:"Weather intelligence",due:"Tomorrow · 7:00 AM",group:"upcoming",priority:"Medium"},
  {id:4,title:"Weekly crop-health walk",detail:"Record affected area percentage and whether symptoms are spreading.",source:"Manual reminder",due:"Friday · 8:00 AM",group:"upcoming",priority:"Low"},
  {id:5,title:"Check Canal Field moisture",detail:"Field observation completed and added to the crop-health timeline.",source:"Satellite monitoring",due:"Completed yesterday",group:"completed",priority:"Medium"},
];

export function FarmerTasks(){
  const [filter,setFilter]=useState<Filter>("all");
  const [tasks,setTasks]=useState(initial);
  const visible=useMemo(()=>filter==="all"?tasks:tasks.filter(task=>task.group===filter),[filter,tasks]);
  const pending=tasks.filter(task=>task.group!=="completed").length;
  const complete=(id:number)=>setTasks(current=>current.map(task=>task.id===id?{...task,group:"completed",due:"Completed just now"}:task));
  return <div className="page-container space-y-6 py-6 md:py-8">
    <header className="flex flex-col gap-4 sm:flex-row sm:items-end sm:justify-between">
      <div><p className="text-[11px] font-extrabold uppercase tracking-[.18em] text-success">Plan · Act · Protect</p><h1 className="mt-1 text-3xl font-extrabold text-brand-dark md:text-4xl">Farmer tasks</h1><p className="mt-2 max-w-2xl text-sm text-muted">Turn crop scans, weather risks and expert advice into clear field actions.</p></div>
      <Link href="/assistant" className="inline-flex min-h-11 items-center justify-center gap-2 rounded-xl bg-brand px-5 text-sm font-extrabold text-white shadow-[0_10px_24px_rgba(7,95,61,.2)]"><Icon name="plus" className="size-4"/>Create with assistant</Link>
    </header>
    <section className="grid grid-cols-2 gap-3 lg:grid-cols-4">
      <Metric label="Pending" value={String(pending)} tone="brand"/><Metric label="Due today" value={String(tasks.filter(x=>x.group==="today").length)} tone="amber"/><Metric label="High priority" value={String(tasks.filter(x=>x.group!=="completed"&&x.priority==="High").length)} tone="red"/><Metric label="Completed" value={String(tasks.filter(x=>x.group==="completed").length)} tone="green"/>
    </section>
    <section className="overflow-hidden rounded-[22px] border border-brand/10 bg-white shadow-[0_14px_42px_rgba(15,45,32,.07)]">
      <div className="flex gap-2 overflow-x-auto border-b border-border p-3 md:p-4">{(["all","today","upcoming","completed"] as Filter[]).map(item=><button key={item} type="button" onClick={()=>setFilter(item)} aria-pressed={filter===item} className={`min-h-10 shrink-0 rounded-xl px-4 text-xs font-extrabold capitalize transition ${filter===item?"bg-brand text-white shadow-sm":"bg-surface-soft text-muted hover:text-brand-dark"}`}>{item}</button>)}</div>
      <div className="divide-y divide-border">{visible.length?visible.map(task=><article key={task.id} className="grid gap-4 p-4 transition hover:bg-[#fbfdf9] md:grid-cols-[auto_1fr_auto] md:items-center md:p-5">
        <button type="button" disabled={task.group==="completed"} onClick={()=>complete(task.id)} aria-label={`Mark ${task.title} complete`} className={`grid size-11 place-items-center rounded-xl border transition ${task.group==="completed"?"border-success/20 bg-brand-soft text-brand":"border-brand/15 bg-white text-muted hover:border-brand hover:text-brand"}`}><Icon name={task.group==="completed"?"task":"field"} className="size-5"/></button>
        <div className="min-w-0"><div className="flex flex-wrap items-center gap-2"><h2 className={`font-extrabold ${task.group==="completed"?"text-muted line-through":"text-brand-dark"}`}>{task.title}</h2><span className={`rounded-full px-2.5 py-1 text-[9px] font-extrabold uppercase ${task.priority==="High"?"bg-red-50 text-danger":task.priority==="Medium"?"bg-amber-50 text-warning":"bg-brand-soft text-success"}`}>{task.priority}</span></div><p className="mt-1 text-sm leading-6 text-muted">{task.detail}</p><p className="mt-2 text-[10px] font-bold uppercase tracking-wider text-success">{task.source}</p></div>
        <div className="flex items-center justify-between gap-3 md:min-w-40 md:flex-col md:items-end"><span className="text-xs font-bold text-muted">{task.due}</span>{task.group!=="completed"&&<button type="button" onClick={()=>complete(task.id)} className="min-h-9 rounded-lg border border-brand/20 px-3 text-xs font-extrabold text-brand hover:bg-brand-soft">Mark complete</button>}</div>
      </article>):<div className="grid min-h-72 place-items-center p-8 text-center"><div><span className="mx-auto grid size-14 place-items-center rounded-2xl bg-brand-soft text-brand"><Icon name="task"/></span><h2 className="mt-4 font-extrabold text-brand-dark">No tasks in this view</h2><p className="mt-1 text-sm text-muted">Your field plan is up to date.</p></div></div>}</div>
    </section>
  </div>;
}

function Metric({label,value,tone}:{label:string;value:string;tone:"brand"|"amber"|"red"|"green"}){const colors={brand:"bg-[#eef7f0] text-brand",amber:"bg-amber-50 text-warning",red:"bg-red-50 text-danger",green:"bg-[#edf8e9] text-success"};return <article className="rounded-2xl border border-brand/10 bg-white p-4 shadow-[0_8px_24px_rgba(15,45,32,.05)]"><p className="text-[10px] font-extrabold uppercase tracking-wider text-muted">{label}</p><div className={`mt-3 inline-flex min-w-12 justify-center rounded-xl px-3 py-2 text-2xl font-extrabold ${colors[tone]}`}>{value}</div></article>}

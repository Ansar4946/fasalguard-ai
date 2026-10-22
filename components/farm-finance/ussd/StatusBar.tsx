"use client";

import { useEffect, useState } from "react";

export function StatusBar() {
  const [time, setTime] = useState("");
  useEffect(() => {
    const tick = () => setTime(new Date().toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" }));
    tick();
    const id = setInterval(tick, 30_000);
    return () => clearInterval(id);
  }, []);
  return (
    <div className="relative z-10 flex h-11 shrink-0 items-center justify-between px-6 pt-1 text-xs font-semibold text-white/90 lg:pt-3">
      <span className="min-w-12 tabular-nums" aria-hidden="true">{time}</span>
      <span className="rounded-full border border-amber-300/50 bg-amber-300/15 px-2.5 py-0.5 text-[10px] font-extrabold uppercase tracking-[0.16em] text-amber-200">Simulation</span>
      <span className="min-w-12 text-right text-[11px] text-white/70">Fasal Guard</span>
    </div>
  );
}

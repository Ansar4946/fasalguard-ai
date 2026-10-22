import type { ReactNode } from "react";

/** Full-bleed app screen on phones; a glass/dark-bezel phone mockup with a notch from lg up. */
export function PhoneFrame({ children }: { children: ReactNode }) {
  return (
    <div className="fg-phone relative mx-auto w-full max-w-[26rem] lg:max-w-[23.75rem] lg:rounded-[3.1rem] lg:bg-gradient-to-b lg:from-slate-700 lg:to-slate-950 lg:p-[10px] lg:shadow-[0_40px_90px_-25px_rgb(3_69_44/.65),0_0_0_1px_rgb(255_255_255/.14)_inset]">
      <span aria-hidden="true" className="pointer-events-none absolute left-1/2 top-[10px] z-40 hidden h-6 w-28 -translate-x-1/2 rounded-b-2xl bg-slate-950 lg:block" />
      <span aria-hidden="true" className="pointer-events-none absolute -right-[3px] top-28 hidden h-14 w-[3px] rounded-r bg-slate-700 lg:block" />
      <div className="relative flex min-h-[38rem] flex-col overflow-hidden bg-gradient-to-b from-[#07553a] via-[#03452c] to-[#021b12] text-white sm:rounded-[2rem] lg:h-[44rem] lg:rounded-[2.4rem]">
        <span aria-hidden="true" className="pointer-events-none absolute -left-20 -top-24 size-64 rounded-full bg-emerald-400/20 blur-3xl" />
        <span aria-hidden="true" className="pointer-events-none absolute -bottom-24 -right-16 size-64 rounded-full bg-lime-300/10 blur-3xl" />
        {children}
      </div>
    </div>
  );
}

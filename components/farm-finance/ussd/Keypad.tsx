"use client";

import { DIAL_KEYS } from "@/features/farm-finance/ussd-formatters";
import { haptic } from "./haptics";

const keyLabel = (key: string) => (key === "*" ? "star" : key === "#" ? "hash" : key);

export function Keypad({ onKey, disabled = false }: { onKey: (key: string) => void; disabled?: boolean }) {
  return (
    <div role="group" aria-label="Keypad" className="grid grid-cols-3 justify-items-center gap-x-4 gap-y-2.5">
      {DIAL_KEYS.map(({ key, letters }) => (
        <button
          key={key}
          type="button"
          disabled={disabled}
          aria-label={letters ? `${keyLabel(key)}, ${letters.split("").join(" ")}` : keyLabel(key)}
          onClick={() => {
            haptic(10);
            onKey(key);
          }}
          className="fg-key flex size-[3.75rem] min-h-11 min-w-11 flex-col items-center justify-center rounded-full bg-white/10 text-white shadow-[inset_0_1px_0_rgb(255_255_255/.14)] ring-1 ring-white/10 hover:bg-white/15 sm:size-16"
        >
          <span className="text-[1.65rem] font-medium leading-none" aria-hidden="true">{key}</span>
          <span className="mt-0.5 h-3 text-[9px] font-semibold uppercase leading-3 tracking-[0.18em] text-emerald-100/80" aria-hidden="true">{letters}</span>
        </button>
      ))}
    </div>
  );
}

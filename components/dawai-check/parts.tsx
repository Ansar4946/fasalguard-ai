"use client";

import { useSyncExternalStore, type CSSProperties, type ReactNode } from "react";
import type { Tone } from "@/features/dawai-check/presentation";

export type T = (key: string) => string;

function svgProps() {
  return {
    viewBox: "0 0 24 24",
    fill: "none",
    stroke: "currentColor",
    strokeWidth: 2,
    strokeLinecap: "round" as const,
    strokeLinejoin: "round" as const,
    "aria-hidden": true,
  };
}

export type IconKind =
  | "shield-check"
  | "alert"
  | "shield-x"
  | "help"
  | "camera"
  | "speaker"
  | "check"
  | "x"
  | "minus"
  | "refresh"
  | "history"
  | "pill"
  | "flask"
  | "leaf"
  | "sun"
  | "frame"
  | "glare"
  | "image"
  | "search"
  | "chevron"
  | "copy"
  | "edit"
  | "info"
  | "receipt"
  | "phone"
  | "expert"
  | "ban"
  | "type"
  | "scan";

export function GlyphIcon({ kind, className = "size-5" }: { kind: IconKind; className?: string }) {
  const paths: Record<IconKind, ReactNode> = {
    "shield-check": (
      <>
        <path d="M12 3 4 6v6c0 4.5 3.2 8 8 9 4.8-1 8-4.5 8-9V6l-8-3Z" />
        <path d="m8.5 12 2.5 2.5 4.5-5" />
      </>
    ),
    "shield-x": (
      <>
        <path d="M12 3 4 6v6c0 4.5 3.2 8 8 9 4.8-1 8-4.5 8-9V6l-8-3Z" />
        <path d="m9.5 9.5 5 5m0-5-5 5" />
      </>
    ),
    alert: (
      <>
        <path d="M12 3 2.5 20h19L12 3Z" />
        <path d="M12 10v4.5M12 17.5h.01" />
      </>
    ),
    help: (
      <>
        <circle cx="12" cy="12" r="9" />
        <path d="M9.5 9.5a2.5 2.5 0 1 1 3.5 2.3c-.7.4-1 .9-1 1.7M12 17h.01" />
      </>
    ),
    camera: (
      <>
        <path d="M4 8h3l1.5-2h7L17 8h3a1 1 0 0 1 1 1v10a1 1 0 0 1-1 1H4a1 1 0 0 1-1-1V9a1 1 0 0 1 1-1Z" />
        <circle cx="12" cy="13" r="3.5" />
      </>
    ),
    speaker: (
      <>
        <path d="M4 9.5v5h3.5L12 18.5v-13L7.5 9.5H4Z" />
        <path d="M15.5 9a4 4 0 0 1 0 6M18 6.5a8 8 0 0 1 0 11" />
      </>
    ),
    check: <path d="m5 12.5 4.5 4.5L19 7.5" />,
    x: <path d="m6 6 12 12M18 6 6 18" />,
    minus: <path d="M6 12h12" />,
    refresh: (
      <>
        <path d="M20 11a8 8 0 0 0-14.5-4M4 4v4h4" />
        <path d="M4 13a8 8 0 0 0 14.5 4M20 20v-4h-4" />
      </>
    ),
    history: (
      <>
        <path d="M3.5 12a8.5 8.5 0 1 0 2.6-6.1L3.5 8.5M3.5 4v4.5H8" />
        <path d="M12 8v4.5l3 1.5" />
      </>
    ),
    pill: (
      <>
        <rect x="3" y="8" width="18" height="8" rx="4" transform="rotate(-35 12 12)" />
        <path d="m9.5 9.5 5 5" />
      </>
    ),
    flask: (
      <>
        <path d="M9 3h6M10 3v6l-5.2 8.8A2 2 0 0 0 6.5 21h11a2 2 0 0 0 1.7-3.2L14 9V3" />
        <path d="M7.5 15h9" />
      </>
    ),
    leaf: (
      <>
        <path d="M5 19c0-9 5-14 15-14 0 10-5 15-14 15" />
        <path d="M5 19c3-5 6-8 10-10" />
      </>
    ),
    sun: (
      <>
        <circle cx="12" cy="12" r="3.8" />
        <path d="M12 2.5v2.2M12 19.3v2.2M2.5 12h2.2M19.3 12h2.2M5.3 5.3l1.6 1.6M17.1 17.1l1.6 1.6M18.7 5.3l-1.6 1.6M6.9 17.1l-1.6 1.6" />
      </>
    ),
    frame: (
      <>
        <path d="M4 9V5a1 1 0 0 1 1-1h4M15 4h4a1 1 0 0 1 1 1v4M20 15v4a1 1 0 0 1-1 1h-4M9 20H5a1 1 0 0 1-1-1v-4" />
        <path d="M8.5 12h7" />
      </>
    ),
    glare: (
      <>
        <path d="M12 3.5 14 9l5.5 2-5.5 2-2 5.5L10 13l-5.5-2L10 9l2-5.5Z" />
        <path d="m4 4 16 16" />
      </>
    ),
    image: (
      <>
        <rect x="3.5" y="4.5" width="17" height="15" rx="2" />
        <circle cx="9" cy="10" r="1.6" />
        <path d="m4 17 5-4.5 3.5 3 2.5-2L20 17" />
      </>
    ),
    search: (
      <>
        <circle cx="11" cy="11" r="6.5" />
        <path d="m16 16 4.5 4.5" />
      </>
    ),
    chevron: <path d="m6 9 6 6 6-6" />,
    copy: (
      <>
        <rect x="8.5" y="8.5" width="11" height="12" rx="2" />
        <path d="M15.5 8.5V5.5a2 2 0 0 0-2-2h-8a2 2 0 0 0-2 2v10a2 2 0 0 0 2 2h3" />
      </>
    ),
    edit: (
      <>
        <path d="M4 20h4L19 9a2.1 2.1 0 0 0-3-3L5 17v3Z" />
        <path d="m14.5 7.5 3 3" />
      </>
    ),
    info: (
      <>
        <circle cx="12" cy="12" r="9" />
        <path d="M12 11v5.5M12 7.5h.01" />
      </>
    ),
    receipt: (
      <>
        <path d="M6 3h12v18l-3-1.8-3 1.8-3-1.8L6 21V3Z" />
        <path d="M9 8h6M9 12h6" />
      </>
    ),
    phone: <path d="M6.5 3.5h3l1.5 4-2 1.5a11 11 0 0 0 6 6l1.5-2 4 1.5v3a2 2 0 0 1-2 2A15.5 15.5 0 0 1 4.5 5.5a2 2 0 0 1 2-2Z" />,
    expert: (
      <>
        <circle cx="12" cy="8" r="3.5" />
        <path d="M5 20c.5-4 3.3-6 7-6s6.5 2 7 6" />
      </>
    ),
    ban: (
      <>
        <circle cx="12" cy="12" r="9" />
        <path d="m5.7 5.7 12.6 12.6" />
      </>
    ),
    type: (
      <>
        <rect x="3" y="6" width="18" height="12" rx="2" />
        <path d="M7 10h.01M11 10h.01M15 10h.01M7.5 14h9" />
      </>
    ),
    scan: (
      <>
        <path d="M4 8V5a1 1 0 0 1 1-1h3M16 4h3a1 1 0 0 1 1 1v3M20 16v3a1 1 0 0 1-1 1h-3M8 20H5a1 1 0 0 1-1-1v-3" />
        <path d="M4 12h16" />
      </>
    ),
  };
  return (
    <svg {...svgProps()} className={className}>
      {paths[kind]}
    </svg>
  );
}

export function Spinner({ className = "size-5" }: { className?: string }) {
  return (
    <span
      aria-hidden="true"
      className={`inline-block animate-spin rounded-full border-2 border-current border-t-transparent motion-reduce:animate-none ${className}`}
    />
  );
}

/** Shield-with-leaf emblem used in the page header and the history empty state. Decorative. */
export function Emblem({ className = "size-12" }: { className?: string }) {
  return (
    <svg viewBox="0 0 48 48" aria-hidden="true" className={className} fill="none">
      <defs>
        <linearGradient id="dc-emblem-g" x1="8" y1="4" x2="40" y2="44" gradientUnits="userSpaceOnUse">
          <stop stopColor="#e7fbd7" />
          <stop offset="1" stopColor="#a8e08a" />
        </linearGradient>
      </defs>
      <path d="M24 4 7 10.5v12.2C7 33 14 40.6 24 44c10-3.4 17-11 17-21.3V10.5L24 4Z" fill="url(#dc-emblem-g)" />
      <path d="M24 4 7 10.5v12.2C7 33 14 40.6 24 44" stroke="#fff" strokeOpacity=".55" strokeWidth="1.4" />
      <path d="M15.5 31c0-9.5 5.5-15 16.5-15 0 10.5-5.5 16-15.5 16" fill="#075f3d" fillOpacity=".92" />
      <path d="M16 31.5c3.2-5.5 6.6-9 11.5-11.5" stroke="#d9f5c7" strokeWidth="1.6" strokeLinecap="round" />
      <circle cx="35.5" cy="13" r="2.2" fill="#fff" fillOpacity=".7" />
    </svg>
  );
}

const subscribeMotion = (callback: () => void) => {
  const query = window.matchMedia("(prefers-reduced-motion: reduce)");
  query.addEventListener("change", callback);
  return () => query.removeEventListener("change", callback);
};

/** True when the visitor asked for reduced motion. False during server render. */
export function useReducedMotion(): boolean {
  return useSyncExternalStore(
    subscribeMotion,
    () => window.matchMedia("(prefers-reduced-motion: reduce)").matches,
    () => false,
  );
}

/** Short vibration tap where the device supports it (never throws). */
export function haptic(ms = 12): void {
  try {
    if (typeof navigator !== "undefined" && typeof navigator.vibrate === "function") navigator.vibrate(ms);
  } catch {
    /* unsupported */
  }
}

export const toneClasses: Record<
  Tone,
  { card: string; solid: string; text: string; stroke: string; stripe: string; gradient: string }
> = {
  success: {
    card: "border-success bg-[#eaf6e6]",
    solid: "bg-success text-white",
    text: "text-[#1f5c23]",
    stroke: "#2f7d32",
    stripe: "border-s-success",
    gradient: "linear-gradient(135deg, #2f7d32 0%, #1d6b3a 55%, #075f3d 100%)",
  },
  warning: {
    card: "border-warning bg-[#fff6e2]",
    solid: "bg-warning text-white",
    text: "text-[#7a4300]",
    stroke: "#a25c00",
    stripe: "border-s-warning",
    gradient: "linear-gradient(135deg, #a25c00 0%, #8c4f00 55%, #703f00 100%)",
  },
  danger: {
    card: "border-danger bg-[#fdeceb]",
    solid: "bg-danger text-white",
    text: "text-[#8f1f1a]",
    stroke: "#c5352e",
    stripe: "border-s-danger",
    gradient: "linear-gradient(135deg, #c5352e 0%, #a6291f 55%, #861d17 100%)",
  },
  neutral: {
    card: "border-border bg-surface-soft",
    solid: "bg-[#5b6a62] text-white",
    text: "text-foreground",
    stroke: "#637168",
    stripe: "border-s-[#5b6a62]",
    gradient: "linear-gradient(135deg, #5b6a62 0%, #4b5a52 55%, #3d4a43 100%)",
  },
};

export function ErrorBanner({
  message,
  actionLabel,
  onAction,
}: {
  message: string;
  actionLabel?: string;
  onAction?: () => void;
}) {
  return (
    <div
      role="alert"
      className="dc-view-in flex flex-wrap items-center gap-3 rounded-2xl border border-danger bg-[#fdeceb] p-4 text-sm font-semibold text-[#8f1f1a]"
    >
      <GlyphIcon kind="alert" className="size-5 shrink-0" />
      <p className="min-w-0 flex-1">{message}</p>
      {actionLabel && onAction && (
        <button
          type="button"
          onClick={onAction}
          className="dc-press dc-focus min-h-11 rounded-xl border border-danger px-4 text-sm font-extrabold text-[#8f1f1a] hover:bg-white"
        >
          {actionLabel}
        </button>
      )}
    </div>
  );
}

export const primaryButton =
  "dc-press dc-focus inline-flex min-h-12 items-center justify-center gap-2 rounded-xl bg-gradient-to-b from-[#0a7049] to-brand px-5 text-sm font-extrabold text-white shadow-[0_6px_16px_rgb(7_95_61/28%)] hover:from-brand hover:to-brand-dark disabled:cursor-not-allowed disabled:opacity-50 disabled:shadow-none";
export const secondaryButton =
  "dc-press dc-focus inline-flex min-h-12 items-center justify-center gap-2 rounded-xl border border-brand bg-white px-5 text-sm font-extrabold text-brand hover:bg-brand-soft/50 disabled:cursor-not-allowed disabled:opacity-50";
export const inputClass =
  "min-h-11 w-full rounded-xl border border-border bg-white px-3 text-sm text-foreground placeholder:text-muted transition-colors focus-visible:border-brand focus-visible:outline-2 focus-visible:outline-offset-1 focus-visible:outline-brand";

export function Disclaimer({ t }: { t: T }) {
  return (
    <p className="flex items-start gap-2 rounded-2xl border border-border bg-surface-soft p-3 text-xs font-semibold leading-5 text-muted">
      <GlyphIcon kind="info" className="mt-0.5 size-4 shrink-0 text-brand" />
      <span>{t("disclaimerFull")}</span>
    </p>
  );
}

export interface SegmentOption<V extends string> {
  value: V;
  label: string;
  icon?: IconKind;
  lang?: string;
}

/**
 * Segmented control with a sliding indicator. `mode="tabs"` marks the active one with aria-current, `mode="toggle"`
 * uses aria-pressed. Direction-aware: the indicator mirrors in RTL through the dc-seg-ind CSS.
 */
export function Segmented<V extends string>({
  options,
  value,
  onChange,
  ariaLabel,
  mode = "toggle",
  onDark = false,
  compact = false,
}: {
  options: Array<SegmentOption<V>>;
  value: V;
  onChange: (next: V) => void;
  ariaLabel: string;
  mode?: "tabs" | "toggle";
  onDark?: boolean;
  compact?: boolean;
}) {
  const index = Math.max(
    0,
    options.findIndex((o) => o.value === value),
  );
  const track = onDark ? "bg-white/15 ring-1 ring-white/25" : "bg-surface-soft ring-1 ring-border";
  const indicator = onDark ? "bg-white shadow-sm" : "bg-gradient-to-b from-[#0a7049] to-brand shadow-sm";
  return (
    <div
      role="group"
      aria-label={ariaLabel}
      className={`relative grid rounded-2xl p-1 ${track}`}
      style={{ gridTemplateColumns: `repeat(${options.length}, minmax(0, 1fr))` }}
    >
      <span
        aria-hidden="true"
        className={`dc-seg-ind ${indicator}`}
        style={{ "--dc-i": index, "--dc-n": options.length } as CSSProperties}
      />
      {options.map((option) => {
        const active = option.value === value;
        const textColor = onDark
          ? active
            ? "text-brand-dark"
            : "text-white"
          : active
            ? "text-white"
            : "text-brand-dark";
        return (
          <button
            key={option.value}
            type="button"
            lang={option.lang}
            {...(mode === "tabs"
              ? { "aria-current": active ? ("page" as const) : undefined }
              : { "aria-pressed": active })}
            onClick={() => onChange(option.value)}
            className={`dc-press dc-focus relative z-10 inline-flex items-center justify-center gap-1.5 rounded-xl px-3 text-sm font-extrabold transition-colors duration-200 ${compact ? "min-h-11 min-w-14" : "min-h-12"} ${textColor}`}
          >
            {option.icon && <GlyphIcon kind={option.icon} className="size-4 shrink-0" />}
            <span>{option.label}</span>
          </button>
        );
      })}
    </div>
  );
}

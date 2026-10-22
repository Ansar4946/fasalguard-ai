import type { ReactNode } from "react";
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
  | "pill";

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

export const toneClasses: Record<Tone, { card: string; solid: string; text: string; stroke: string }> = {
  success: { card: "border-success bg-[#eaf6e6]", solid: "bg-success text-white", text: "text-[#1f5c23]", stroke: "#2f7d32" },
  warning: { card: "border-warning bg-[#fff6e2]", solid: "bg-warning text-white", text: "text-[#7a4300]", stroke: "#a25c00" },
  danger: { card: "border-danger bg-[#fdeceb]", solid: "bg-danger text-white", text: "text-[#8f1f1a]", stroke: "#c5352e" },
  neutral: { card: "border-border bg-surface-soft", solid: "bg-[#5b6a62] text-white", text: "text-foreground", stroke: "#637168" },
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
      className="flex flex-wrap items-center gap-3 rounded-2xl border border-danger bg-[#fdeceb] p-4 text-sm font-semibold text-[#8f1f1a]"
    >
      <GlyphIcon kind="alert" className="size-5 shrink-0" />
      <p className="min-w-0 flex-1">{message}</p>
      {actionLabel && onAction && (
        <button
          type="button"
          onClick={onAction}
          className="min-h-11 rounded-xl border border-danger px-4 text-sm font-extrabold text-[#8f1f1a] hover:bg-white"
        >
          {actionLabel}
        </button>
      )}
    </div>
  );
}

export const primaryButton =
  "inline-flex min-h-12 items-center justify-center gap-2 rounded-xl bg-brand px-5 text-sm font-extrabold text-white shadow-sm transition hover:bg-brand-dark focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-brand disabled:cursor-not-allowed disabled:opacity-50";
export const secondaryButton =
  "inline-flex min-h-12 items-center justify-center gap-2 rounded-xl border border-brand bg-white px-5 text-sm font-extrabold text-brand transition hover:bg-brand-soft/50 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-brand disabled:cursor-not-allowed disabled:opacity-50";
export const inputClass =
  "min-h-11 w-full rounded-xl border border-border bg-white px-3 text-sm text-foreground placeholder:text-muted focus-visible:outline-2 focus-visible:outline-offset-1 focus-visible:outline-brand";

export function Disclaimer({ t }: { t: T }) {
  return (
    <p className="rounded-2xl border border-border bg-surface-soft p-3 text-xs font-semibold leading-5 text-muted">
      {t("disclaimerFull")}
    </p>
  );
}

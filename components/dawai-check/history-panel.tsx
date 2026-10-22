"use client";

import type { CSSProperties } from "react";
import type { HistoryRow } from "@/features/dawai-check/history";
import { verdictPresentation } from "@/features/dawai-check/presentation";
import { ErrorBanner, GlyphIcon, primaryButton, Spinner, toneClasses, type T } from "./parts";

function EmptyIllustration() {
  return (
    <svg viewBox="0 0 160 120" className="dc-float h-28 w-36" fill="none" aria-hidden="true">
      <ellipse cx="80" cy="108" rx="48" ry="6" fill="#d9f5c7" opacity=".7" />
      <rect x="34" y="16" width="92" height="84" rx="12" fill="#fff" stroke="#bfe3a8" strokeWidth="2" />
      <rect x="52" y="10" width="56" height="14" rx="7" fill="#075f3d" />
      <path d="M80 40 56 50v14c0 12 9 21 24 26 15-5 24-14 24-26V50L80 40Z" fill="#d9f5c7" stroke="#075f3d" strokeWidth="2.5" strokeLinejoin="round" />
      <path d="M68 66c0-9 5-14 16-14 0 10-5 15-15 15" fill="#075f3d" />
      <path d="M69 67c3-5 6-8 11-10" stroke="#d9f5c7" strokeWidth="1.8" strokeLinecap="round" />
      <circle cx="122" cy="30" r="3" fill="#a8e08a" />
      <circle cx="40" cy="92" r="2.5" fill="#a8e08a" />
    </svg>
  );
}

export function HistoryPanel({
  t,
  rows,
  loading,
  error,
  onRetry,
  onOpen,
  onNew,
}: {
  t: T;
  rows: HistoryRow[];
  loading: boolean;
  error: string;
  onRetry: () => void;
  onOpen: (id: string) => void;
  onNew: () => void;
}) {
  return (
    <section aria-labelledby="dc-history-title" aria-busy={loading} className="space-y-4">
      <h2 id="dc-history-title" className="text-lg font-extrabold text-brand-dark">
        {t("historyTitle")}
      </h2>
      <p role="status" aria-live="polite" className="sr-only">
        {loading ? t("historyLoading") : ""}
      </p>
      {error && <ErrorBanner message={error} actionLabel={t("retry")} onAction={onRetry} />}
      {loading && rows.length === 0 ? (
        <div className="space-y-2" aria-hidden="true">
          {[0, 1, 2].map((i) => (
            <div key={i} className="dc-shimmer h-[4.5rem] rounded-2xl border border-border" />
          ))}
        </div>
      ) : rows.length === 0 && !error ? (
        <div className="card flex flex-col items-center gap-3 p-8 text-center">
          <EmptyIllustration />
          <p className="text-lg font-extrabold">{t("historyEmpty")}</p>
          <p className="max-w-xs text-sm text-muted">{t("historyEmptyHint")}</p>
          <button type="button" onClick={onNew} className={`${primaryButton} mt-1`}>
            <GlyphIcon kind="camera" className="size-5" /> {t("historyEmptyCta")}
          </button>
        </div>
      ) : (
        <ul className="space-y-2">
          {rows.map((row, index) => {
            const p = verdictPresentation(row.verdict, row.demoDataset);
            const tone = toneClasses[p.tone];
            const showScore = row.verdict !== "UNREADABLE";
            return (
              <li key={row.id} className="dc-rise" style={{ "--dc-i": Math.min(index, 8) } as CSSProperties}>
                <button
                  type="button"
                  onClick={() => onOpen(row.id)}
                  aria-label={`${row.title ?? t("unnamedProduct")}, ${t(p.titleKey)}. ${t("historyOpen")}`}
                  style={{ borderInlineStartWidth: 5, borderInlineStartColor: tone.stroke }}
                  className="dc-lift dc-press dc-focus card flex min-h-[4.5rem] w-full items-center gap-3 p-3 text-start"
                >
                  <span className={`grid size-10 shrink-0 place-items-center rounded-xl ${tone.solid}`}>
                    <GlyphIcon kind={p.icon} className="size-5" />
                  </span>
                  <span className="min-w-0 flex-1">
                    <span className="block truncate text-sm font-extrabold">{row.title ?? t("unnamedProduct")}</span>
                    <span className="flex flex-wrap items-center gap-x-2 text-xs text-muted" title={row.dateLabel} style={{ unicodeBidi: "plaintext" }}>
                      <GlyphIcon kind="history" className="size-3.5 shrink-0" />
                      <span>{row.relativeLabel || row.dateLabel}</span>
                    </span>
                    <span className={`mt-1 flex flex-wrap items-center gap-1.5 text-xs font-extrabold ${tone.text}`}>
                      {t(p.titleKey)}
                      {row.demoDataset && (
                        <span className="rounded bg-[#111] px-1.5 py-0.5 text-[10px] font-black text-[#ffe14d]">{t("demoTag")}</span>
                      )}
                    </span>
                  </span>
                  {showScore ? (
                    <span className="flex shrink-0 flex-col items-center leading-tight">
                      <span dir="ltr" className="text-lg font-black text-foreground">
                        {row.score}
                      </span>
                      <span className="text-[10px] font-bold uppercase text-muted">{t("scoreLabel")}</span>
                    </span>
                  ) : null}
                  <GlyphIcon kind="chevron" className="size-4 shrink-0 -rotate-90 text-muted rtl:rotate-90" />
                </button>
              </li>
            );
          })}
        </ul>
      )}
      {loading && rows.length > 0 && <Spinner className="size-5 text-brand" />}
    </section>
  );
}

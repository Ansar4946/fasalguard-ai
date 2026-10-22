"use client";

import type { HistoryRow } from "@/features/dawai-check/history";
import { verdictPresentation } from "@/features/dawai-check/presentation";
import { ErrorBanner, GlyphIcon, primaryButton, Spinner, toneClasses, type T } from "./parts";

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
            <div key={i} className="h-16 animate-pulse rounded-2xl bg-surface-soft motion-reduce:animate-none" />
          ))}
        </div>
      ) : rows.length === 0 && !error ? (
        <div className="card flex flex-col items-center gap-3 p-8 text-center">
          <span className="grid size-14 place-items-center rounded-full bg-brand-soft text-brand">
            <GlyphIcon kind="history" className="size-7" />
          </span>
          <p className="font-extrabold">{t("historyEmpty")}</p>
          <p className="text-sm text-muted">{t("historyEmptyHint")}</p>
          <button type="button" onClick={onNew} className={primaryButton}>
            {t("tabCheck")}
          </button>
        </div>
      ) : (
        <ul className="space-y-2">
          {rows.map((row) => {
            const p = verdictPresentation(row.verdict, row.demoDataset);
            const tone = toneClasses[p.tone];
            return (
              <li key={row.id}>
                <button
                  type="button"
                  onClick={() => onOpen(row.id)}
                  aria-label={`${row.title ?? t("unnamedProduct")}, ${t(p.titleKey)}. ${t("historyOpen")}`}
                  className="card flex min-h-16 w-full items-center gap-3 p-3 text-start transition hover:border-brand/40 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-brand"
                >
                  <span className={`grid size-10 shrink-0 place-items-center rounded-xl ${tone.solid}`}>
                    <GlyphIcon kind={p.icon} className="size-5" />
                  </span>
                  <span className="min-w-0 flex-1">
                    <span className="block truncate text-sm font-extrabold">{row.title ?? t("unnamedProduct")}</span>
                    <span className="block text-xs text-muted" style={{ unicodeBidi: "plaintext" }}>
                      {row.dateLabel}
                    </span>
                    <span className={`mt-1 flex flex-wrap items-center gap-1.5 text-xs font-extrabold ${tone.text}`}>
                      {t(p.titleKey)}
                      {row.demoDataset && (
                        <span className="rounded bg-[#111] px-1.5 py-0.5 text-[10px] font-black text-[#ffe14d]">{t("demoTag")}</span>
                      )}
                    </span>
                  </span>
                  <span dir="ltr" className="text-lg font-black text-foreground">
                    {row.score}
                  </span>
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

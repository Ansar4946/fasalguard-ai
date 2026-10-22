import type { HistoryItem, Lang, Verdict } from "./types";

export interface HistoryRow {
  id: string;
  /** null when the brand is unknown; the UI shows a localized fallback. */
  title: string | null;
  dateLabel: string;
  verdict: Verdict;
  score: number;
  demoDataset: boolean;
}

/** Latin digits in both languages so numbers stay legible in RTL. Pakistan time zone. */
export function formatDate(iso: string, lang: Lang): string {
  const date = new Date(iso);
  if (Number.isNaN(date.getTime())) return "";
  const locale = lang === "ur" ? "ur-PK-u-nu-latn" : "en-PK-u-nu-latn";
  try {
    return new Intl.DateTimeFormat(locale, {
      day: "numeric",
      month: "short",
      year: "numeric",
      hour: "2-digit",
      minute: "2-digit",
      timeZone: "Asia/Karachi",
    }).format(date);
  } catch {
    return date.toISOString().slice(0, 10);
  }
}

/** Newest first; unusable rows dropped. */
export function formatHistory(items: readonly HistoryItem[], lang: Lang): HistoryRow[] {
  return items
    .filter((item) => item && typeof item.id === "string")
    .slice()
    .sort((a, b) => (Date.parse(b.createdAt) || 0) - (Date.parse(a.createdAt) || 0))
    .map((item) => ({
      id: item.id,
      title: item.brandName?.trim() || null,
      dateLabel: formatDate(item.createdAt, lang),
      verdict: item.verdict,
      score: Math.min(100, Math.max(0, Math.round(Number(item.score) || 0))),
      demoDataset: Boolean(item.demoDataset),
    }));
}

export function extractList<T>(body: unknown): T[] {
  if (Array.isArray(body)) return body as T[];
  const items = (body as { items?: unknown } | null)?.items;
  return Array.isArray(items) ? (items as T[]) : [];
}

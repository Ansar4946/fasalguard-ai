import { checkText, clampScore, sortChecks, verdictPresentation } from "./presentation";
import type { Lang, PesticideCheckResult } from "./types";

/* ---------- Relative time ---------- */

/**
 * "5 minutes ago" / "پانچ منٹ پہلے" style label (Latin digits). Returns "" for invalid dates or anything
 * older than a week; callers then fall back to the absolute date.
 */
export function formatRelativeTime(iso: string, lang: Lang, nowMs: number = Date.now()): string {
  const then = Date.parse(iso);
  if (!Number.isFinite(then) || !Number.isFinite(nowMs)) return "";
  const diffSec = Math.round((then - nowMs) / 1000);
  const abs = Math.abs(diffSec);
  if (abs >= 7 * 24 * 3600) return "";
  const locale = lang === "ur" ? "ur-PK-u-nu-latn" : "en-PK-u-nu-latn";
  try {
    const rtf = new Intl.RelativeTimeFormat(locale, { numeric: "auto" });
    if (abs < 45) return rtf.format(0, "second");
    if (abs < 3600) return rtf.format(Math.round(diffSec / 60), "minute");
    if (abs < 24 * 3600) return rtf.format(Math.round(diffSec / 3600), "hour");
    return rtf.format(Math.round(diffSec / 86400), "day");
  } catch {
    return "";
  }
}

/* ---------- Photo quality hint ---------- */

export type QualityHint = "ok" | "tiny" | "dark" | "bright" | "blurry";

export interface GrayStats {
  mean: number;
  brightRatio: number;
  sharpness: number;
}

/** Statistics over a grayscale buffer (0-255): mean, share of near-white pixels, Laplacian variance. */
export function computeGrayStats(gray: ArrayLike<number>, width: number, height: number): GrayStats {
  const n = width * height;
  if (!(n > 0) || gray.length < n) return { mean: 128, brightRatio: 0, sharpness: 999 };
  let sum = 0;
  let bright = 0;
  for (let i = 0; i < n; i++) {
    sum += gray[i];
    if (gray[i] >= 250) bright++;
  }
  let lapSum = 0;
  let lapSq = 0;
  let count = 0;
  for (let y = 1; y < height - 1; y++) {
    for (let x = 1; x < width - 1; x++) {
      const i = y * width + x;
      const lap = 4 * gray[i] - gray[i - 1] - gray[i + 1] - gray[i - width] - gray[i + width];
      lapSum += lap;
      lapSq += lap * lap;
      count++;
    }
  }
  const sharpness = count > 0 ? lapSq / count - (lapSum / count) ** 2 : 999;
  return { mean: sum / n, brightRatio: bright / n, sharpness };
}

/** Cheap, non-blocking guess about why a photo may not be read well. Never rejects a photo. */
export function classifyQuality(width: number, height: number, stats: GrayStats): QualityHint {
  if (Math.max(width, height) < 600) return "tiny";
  if (stats.mean < 60) return "dark";
  if (stats.mean > 238 || stats.brightRatio > 0.4) return "bright";
  if (stats.sharpness < 6) return "blurry";
  return "ok";
}

/* ---------- Match highlighting ---------- */

export interface TextPart {
  text: string;
  match: boolean;
}

function escapeRegExp(value: string): string {
  return value.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

/** Splits `text` into parts, flagging the pieces that match any word of `query` (case-insensitive). */
export function highlightMatch(text: string, query: string): TextPart[] {
  const words = Array.from(new Set(query.trim().split(/\s+/).filter(Boolean)))
    .sort((a, b) => b.length - a.length)
    .map(escapeRegExp);
  if (!text || words.length === 0) return [{ text, match: false }];
  const regex = new RegExp(`(${words.join("|")})`, "gi");
  const parts: TextPart[] = [];
  let last = 0;
  for (const m of text.matchAll(regex)) {
    const start = m.index ?? 0;
    if (m[0].length === 0) continue;
    if (start > last) parts.push({ text: text.slice(last, start), match: false });
    parts.push({ text: m[0], match: true });
    last = start + m[0].length;
  }
  if (last < text.length) parts.push({ text: text.slice(last), match: false });
  return parts.length ? parts : [{ text, match: false }];
}

/* ---------- Share / copy summary ---------- */

/** Plain-text summary for copying. Same honesty wording as the screen: demo flag and risk-screening line included. */
export function buildShareText(
  result: PesticideCheckResult,
  lang: Lang,
  t: (key: string) => string,
): string {
  const p = verdictPresentation(result.verdict, result.demoDataset);
  const lines: string[] = [`${t("title")} - FasalGuard AI`];
  const brand = result.extracted?.brandName?.trim();
  if (brand) lines.push(brand);
  lines.push(t(p.titleKey));
  if (result.verdict !== "UNREADABLE") {
    lines.push(`${t("scoreLabel")}: ${clampScore(result.score)} / 100`);
  }
  if (result.demoDataset) lines.push(`${t("demoBadge")}: ${t("demoBadgeNote")}`);
  const flagged = sortChecks(result.checks ?? [])
    .filter((c) => c.status === "fail" || c.status === "warn")
    .slice(0, 4);
  for (const check of flagged) lines.push(`- ${checkText(check, lang).title}`);
  lines.push(t("disclaimerShort"));
  return lines.join("\n");
}

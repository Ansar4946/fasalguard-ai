import type { BannedMatch, CheckItem, CheckStatus, ListCoverage, PesticideCheckResult, Verdict } from "./types";

export type Tone = "success" | "warning" | "danger" | "neutral";

export interface VerdictPresentation {
  tone: Tone;
  icon: "shield-check" | "alert" | "shield-x" | "help";
  titleKey: string;
  summaryKey: string;
  showDemoBadge: boolean;
  /** "DPP LIST (PARTIAL, 2005)" badge: real DPP lists loaded and no demo row influenced the result. */
  showDppBadge: boolean;
  showRetake: boolean;
  /** Next-step string keys, in display order. */
  nextStepKeys: string[];
}

export interface PresentationContext {
  listCoverage?: ListCoverage;
  bannedMatch?: BannedMatch | null;
  /** DPP list loaded, nothing failed or warned, but the product could not be confirmed on the partial list. */
  unconfirmed?: boolean;
}

/** True when real DPP lists were used and no demo row influenced the result. */
export function isDppResult(demoDataset: boolean, listCoverage?: ListCoverage): boolean {
  return listCoverage === "DPP_PARTIAL" && !demoDataset;
}

/** SUSPICIOUS only because the product is not on the partial list we hold (nothing failed or warned). */
export function isUnconfirmed(result: Pick<PesticideCheckResult, "verdict" | "listCoverage" | "checks">): boolean {
  if (result.verdict !== "SUSPICIOUS" || result.listCoverage !== "DPP_PARTIAL") return false;
  const checks = result.checks ?? [];
  return (
    checks.some((c) => c.code === "ingredient_notified" && c.status === "unknown") &&
    !checks.some((c) => c.status === "fail" || c.status === "warn")
  );
}

/** Presentation for a full result (uses the DPP context). */
export function presentResult(result: PesticideCheckResult): VerdictPresentation {
  return verdictPresentation(result.verdict, result.demoDataset, {
    listCoverage: result.listCoverage,
    bannedMatch: result.bannedMatch,
    unconfirmed: isUnconfirmed(result),
  });
}

/**
 * Maps a verdict to wording keys. VERIFIED is never presented as authentic or approved; demo data is flagged.
 * With real DPP lists the wording is "consistent with the DPP notified list" and "not found" is never "fake".
 */
export function verdictPresentation(
  verdict: Verdict,
  demoDataset: boolean,
  context: PresentationContext = {},
): VerdictPresentation {
  const dpp = isDppResult(demoDataset, context.listCoverage);
  const base = { showDemoBadge: demoDataset, showDppBadge: dpp };
  switch (verdict) {
    case "VERIFIED":
      return {
        ...base,
        tone: "success",
        icon: "shield-check",
        titleKey: demoDataset ? "verdictVerifiedDemoTitle" : dpp ? "verdictDppTitle" : "verdictVerifiedTitle",
        summaryKey: demoDataset ? "verdictVerifiedDemoSummary" : dpp ? "verdictDppSummary" : "verdictVerifiedSummary",
        showRetake: false,
        nextStepKeys: ["stepReceipt", "stepExpert"],
      };
    case "SUSPICIOUS":
      if (context.unconfirmed && context.listCoverage === "DPP_PARTIAL") {
        return {
          ...base,
          tone: "neutral",
          icon: "help",
          titleKey: "verdictUnconfirmedTitle",
          summaryKey: "verdictUnconfirmedSummary",
          showRetake: false,
          nextStepKeys: ["stepDpp", "stepReceipt", "stepExpert"],
        };
      }
      return {
        ...base,
        tone: "warning",
        icon: "alert",
        titleKey: "verdictSuspiciousTitle",
        summaryKey: "verdictSuspiciousSummary",
        showRetake: false,
        nextStepKeys: ["stepReceipt", "stepExpert", "stepHelpline"],
      };
    case "HIGH_RISK": {
      const banned = context.bannedMatch ?? null;
      const titleKey = banned
        ? banned.kind === "premix"
          ? "verdictBannedPremixTitle"
          : "verdictBannedTitle"
        : "verdictHighRiskTitle";
      const summaryKey = banned
        ? banned.kind === "premix"
          ? "verdictBannedPremixSummary"
          : "verdictBannedSummary"
        : "verdictHighRiskSummary";
      return {
        ...base,
        tone: "danger",
        icon: "shield-x",
        titleKey,
        summaryKey,
        showRetake: false,
        nextStepKeys: ["stepKeep", "stepHelpline", "stepReceipt", "stepExpert"],
      };
    }
    default:
      return {
        ...base,
        tone: "neutral",
        icon: "help",
        titleKey: "verdictUnreadableTitle",
        summaryKey: "verdictUnreadableSummary",
        showRetake: true,
        nextStepKeys: ["stepRetake", "stepManual"],
      };
  }
}

const statusOrder: Record<CheckStatus, number> = { fail: 0, warn: 1, unknown: 2, pass: 3 };

/** Failures first, then warnings, unknown, passes. Stable for equal statuses. */
export function sortChecks(checks: readonly CheckItem[]): CheckItem[] {
  return checks
    .map((check, index) => ({ check, index }))
    .sort((a, b) => statusOrder[a.check.status] - statusOrder[b.check.status] || a.index - b.index)
    .map((entry) => entry.check);
}

const monthsEn = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"];
const monthsUr = [
  "جنوری",
  "فروری",
  "مارچ",
  "اپریل",
  "مئی",
  "جون",
  "جولائی",
  "اگست",
  "ستمبر",
  "اکتوبر",
  "نومبر",
  "دسمبر",
];

/** "2026-10-23" -> "23 Oct 2026" / "23 اکتوبر 2026" (Latin digits). Anything unparseable is returned as is. */
export function formatSourceDate(iso: string | null | undefined, lang: "en" | "ur"): string {
  const m = /^(\d{4})-(\d{2})-(\d{2})/.exec(iso ?? "");
  if (!m) return iso ?? "";
  const month = (lang === "ur" ? monthsUr : monthsEn)[Number(m[2]) - 1] ?? m[2];
  return `${Number(m[3])} ${month} ${m[1]}`;
}

/** Latest retrieval date among the data sources (YYYY-MM-DD) or null. */
export function latestSourceDate(sources: ReadonlyArray<{ asOf: string }> | undefined): string | null {
  const dates = (sources ?? []).map((s) => s.asOf).filter((d) => /^\d{4}-\d{2}-\d{2}/.test(d)).sort();
  return dates.length ? (dates[dates.length - 1] ?? null) : null;
}

export function clampScore(score: number): number {
  return Number.isFinite(score) ? Math.min(100, Math.max(0, Math.round(score))) : 0;
}

export function scoreRing(score: number, radius = 42): { circumference: number; dashOffset: number } {
  const circumference = 2 * Math.PI * radius;
  return { circumference, dashOffset: circumference * (1 - clampScore(score) / 100) };
}

export function similarityPercent(similarity: number): number {
  if (!Number.isFinite(similarity)) return 0;
  const pct = similarity <= 1 ? similarity * 100 : similarity;
  return Math.min(100, Math.max(0, Math.round(pct)));
}

export function checkText(check: CheckItem, lang: "en" | "ur"): { title: string; detail: string } {
  return lang === "ur"
    ? { title: check.titleUr || check.titleEn, detail: check.detailUr || check.detailEn }
    : { title: check.titleEn || check.titleUr, detail: check.detailEn || check.detailUr };
}

/** Plain text read aloud by the Listen button. The backend explanation is only used if it matches the language. */
export function buildSpeechText(
  result: PesticideCheckResult,
  lang: "en" | "ur",
  t: (key: string) => string,
): string {
  const p = presentResult(result);
  const parts = [t(p.titleKey), t(p.summaryKey)];
  const failing = sortChecks(result.checks)
    .filter((c) => c.status === "fail" || c.status === "warn")
    .slice(0, 3);
  for (const check of failing) parts.push(checkText(check, lang).title);
  if (result.explanation && result.language === lang) parts.push(result.explanation);
  parts.push(t("disclaimerShort"));
  return parts.filter(Boolean).join(". ");
}

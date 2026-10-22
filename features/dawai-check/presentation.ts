import type { CheckItem, CheckStatus, PesticideCheckResult, Verdict } from "./types";

export type Tone = "success" | "warning" | "danger" | "neutral";

export interface VerdictPresentation {
  tone: Tone;
  icon: "shield-check" | "alert" | "shield-x" | "help";
  titleKey: string;
  summaryKey: string;
  showDemoBadge: boolean;
  showRetake: boolean;
  /** Next-step string keys, in display order. */
  nextStepKeys: string[];
}

/** Maps a verdict to wording keys. VERIFIED is never presented as authentic; demo data is flagged. */
export function verdictPresentation(verdict: Verdict, demoDataset: boolean): VerdictPresentation {
  const base = { showDemoBadge: demoDataset };
  switch (verdict) {
    case "VERIFIED":
      return {
        ...base,
        tone: "success",
        icon: "shield-check",
        titleKey: demoDataset ? "verdictVerifiedDemoTitle" : "verdictVerifiedTitle",
        summaryKey: demoDataset ? "verdictVerifiedDemoSummary" : "verdictVerifiedSummary",
        showRetake: false,
        nextStepKeys: ["stepReceipt", "stepExpert"],
      };
    case "SUSPICIOUS":
      return {
        ...base,
        tone: "warning",
        icon: "alert",
        titleKey: "verdictSuspiciousTitle",
        summaryKey: "verdictSuspiciousSummary",
        showRetake: false,
        nextStepKeys: ["stepReceipt", "stepExpert", "stepHelpline"],
      };
    case "HIGH_RISK":
      return {
        ...base,
        tone: "danger",
        icon: "shield-x",
        titleKey: "verdictHighRiskTitle",
        summaryKey: "verdictHighRiskSummary",
        showRetake: false,
        nextStepKeys: ["stepKeep", "stepHelpline", "stepReceipt", "stepExpert"],
      };
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
  const p = verdictPresentation(result.verdict, result.demoDataset);
  const parts = [t(p.titleKey), t(p.summaryKey)];
  const failing = sortChecks(result.checks)
    .filter((c) => c.status === "fail" || c.status === "warn")
    .slice(0, 3);
  for (const check of failing) parts.push(checkText(check, lang).title);
  if (result.explanation && result.language === lang) parts.push(result.explanation);
  parts.push(t("disclaimerShort"));
  return parts.filter(Boolean).join(". ");
}

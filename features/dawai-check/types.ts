export type Lang = "en" | "ur";
export type Verdict = "VERIFIED" | "SUSPICIOUS" | "HIGH_RISK" | "UNREADABLE";
export type CheckStatus = "pass" | "warn" | "fail" | "unknown";

export interface ExtractedLabel {
  brandName?: string | null;
  activeIngredient?: string | null;
  concentration?: string | null;
  formulation?: string | null;
  company?: string | null;
  registrationNo?: string | null;
  batchNo?: string | null;
  manufacturingDate?: string | null;
  expiryDate?: string | null;
  rawText?: string | null;
  confidence?: number | null;
}

export interface MatchedProduct {
  id: string;
  brandName: string;
  activeIngredient: string;
  concentration: string;
  company: string;
  similarity: number;
}

export interface CheckItem {
  code: string;
  status: CheckStatus;
  titleEn: string;
  titleUr: string;
  detailEn: string;
  detailUr: string;
}

export type ListCoverage = "DEMO" | "DPP_PARTIAL";

export interface DataSourceRef {
  name: string;
  asOf: string;
  url: string;
}

export interface MatchedNotified {
  productText: string;
  category: string | null;
  whoClass: string | null;
  notification: string;
}

export interface BannedMatch {
  kind: "ingredient" | "premix";
  name: string;
  notificationNumber: string | null;
  notificationDate: string | null;
  position?: string | null;
}

export interface PesticideCheckResult {
  id: string;
  createdAt: string;
  inputMode: "photo" | "manual";
  language: Lang;
  verdict: Verdict;
  score: number;
  demoDataset: boolean;
  /** Additive DPP fields; absent on results from an older API (treated as DEMO). */
  listCoverage?: ListCoverage;
  dataSources?: DataSourceRef[];
  matchedNotified?: MatchedNotified | null;
  bannedMatch?: BannedMatch | null;
  extracted: ExtractedLabel;
  matchedProduct: MatchedProduct | null;
  checks: CheckItem[];
  explanation: string;
  disclaimer: { en: string; ur: string };
  provider?: string;
  model?: string;
  latencyMs?: number;
}

export interface HistoryItem {
  id: string;
  createdAt: string;
  verdict: Verdict;
  score: number;
  demoDataset: boolean;
  brandName: string | null;
}

export interface ProductSuggestion {
  id: string;
  brandName: string;
  activeIngredient: string;
  company: string | null;
  /** Additive fields: absent on responses from older servers (treated as catalogue). */
  kind?: "catalogue" | "dpp_notified";
  label?: string;
  concentration?: string | null;
  formulation?: string | null;
}

export interface CreateCheckInput {
  mediaAssetId: string;
  language?: Lang;
  priceRs?: number;
  packSize?: string;
}

export interface ManualCheckInput {
  brandName: string;
  activeIngredient?: string;
  registrationNo?: string;
  expiryDate?: string;
  priceRs?: number;
  language?: Lang;
}

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

export interface PesticideCheckResult {
  id: string;
  createdAt: string;
  inputMode: "photo" | "manual";
  language: Lang;
  verdict: Verdict;
  score: number;
  demoDataset: boolean;
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
  company: string;
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

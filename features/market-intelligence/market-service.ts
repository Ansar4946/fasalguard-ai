import type {
  MarketComparisonItem,
  MarketInsight,
  MarketIntelligenceRepository,
  MarketIntelligenceSnapshot,
  MarketPrice,
  MarketRange,
  PricePoint,
} from "./types";

export type MarketQuery = { crop: string; location: string };
export type PriceAlertInput = MarketQuery & {
  targetPrice: number;
  quantity: number;
  unit: MarketPrice["unit"];
};
export type PriceAlertResult = {
  persisted: boolean;
  status: "DEMO_ONLY";
};

/**
 * Frontend-facing boundary for Market Intelligence.
 *
 * Phase 1 uses a fixture repository. Phase 2 can replace that repository with
 * authenticated calls to the NestJS API without changing the dashboard components.
 */
export class MarketService {
  constructor(private readonly repository: MarketIntelligenceRepository) {}

  getMarketSummary(input: MarketQuery): Promise<MarketIntelligenceSnapshot | null> {
    return this.repository.getMarketSummary(input);
  }

  async getCurrentPrices(input: MarketQuery): Promise<MarketPrice | null> {
    return (await this.getMarketSummary(input))?.current ?? null;
  }

  async getPriceHistory(input: MarketQuery & { range: MarketRange }): Promise<PricePoint[]> {
    return (await this.getMarketSummary(input))?.history[input.range] ?? [];
  }

  async getNearbyMarkets(input: MarketQuery): Promise<MarketComparisonItem[]> {
    return (await this.getMarketSummary(input))?.nearbyMarkets ?? [];
  }

  async getAIRecommendation(input: MarketQuery): Promise<MarketInsight | null> {
    // The Phase 1 result is deterministic demo text, not an AI-generated recommendation.
    return (await this.getMarketSummary(input))?.insight ?? null;
  }

  async createPriceAlert(input: PriceAlertInput): Promise<PriceAlertResult> {
    if (!Number.isFinite(input.targetPrice) || input.targetPrice <= 0) {
      throw new Error("Target price must be greater than zero.");
    }
    return { persisted: false, status: "DEMO_ONLY" };
  }
}

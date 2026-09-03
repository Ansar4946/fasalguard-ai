export type MarketDataStatus =
  "DEMO" | "LIVE" | "STALE" | "UNAVAILABLE" | "ESTIMATED";
export type MarketRange = "7D" | "30D" | "SEASON";

export interface MarketPrice {
  commodity: string;
  variety: string | null;
  market: string;
  district: string;
  province: string;
  currency: "PKR";
  minimumPrice: number;
  price: number;
  maximumPrice: number;
  quantity: number;
  unit: "KG";
  observedAt: string;
  source: "AMIS" | "DEMO_FIXTURE" | "PAR_API";
  freshness: MarketDataStatus;
}

export interface PricePoint {
  observedAt: string;
  price: number;
}

export interface MarketComparisonItem extends MarketPrice {
  distanceKm: number | null;
}

export interface MarketInsight {
  summary: string;
  evidence: string[];
  uncertainty: string;
  missingEvidence: string[];
  status: MarketDataStatus;
}

export interface MarketIntelligenceSnapshot {
  current: MarketPrice;
  weeklyChangePercent: number;
  history: Record<MarketRange, PricePoint[]>;
  nearbyMarkets: MarketComparisonItem[];
  insight: MarketInsight;
  availableCrops: string[];
  availableLocations: string[];
  marketSummary: {
    reportingMarkets: number;
    lowestPrice: number;
    averagePrice: number;
    highestPrice: number;
    spread: number;
    displayQuantityKg: number;
  };
}

export interface MarketIntelligenceRepository {
  getMarketSummary(input: {
    crop: string;
    location: string;
  }): Promise<MarketIntelligenceSnapshot | null>;
}

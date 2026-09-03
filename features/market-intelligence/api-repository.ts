import { MarketService } from "./market-service";
import type {
  MarketComparisonItem,
  MarketDataStatus,
  MarketIntelligenceRepository,
  MarketIntelligenceSnapshot,
  MarketPrice,
  PricePoint,
} from "./types";

export const liveMarketCrops = [
  "Wheat",
  "Cotton",
  "Rice",
  "Maize",
  "Sugarcane",
] as const;
export const defaultLiveMarketCrop = "Wheat";
export const liveMarketLocations = ["Punjab, Pakistan"] as const;

interface ApiRecord {
  id: string;
  cropName: string;
  marketName: string;
  district: string;
  province: string;
  minimumPrice: number;
  maximumPrice: number;
  averagePrice: number;
  quantity: number;
  unit: "KG";
  source: "AMIS";
  priceDate: string;
  observedAt: string;
}

const DISPLAY_QUANTITY_KG = 40;

function normalizePrice(value: number, sourceQuantity: number): number {
  if (
    !Number.isFinite(value) ||
    !Number.isFinite(sourceQuantity) ||
    sourceQuantity <= 0
  )
    return 0;
  return Math.round((value / sourceQuantity) * DISPLAY_QUANTITY_KG);
}
interface ApiResponse {
  records: ApiRecord[];
  freshness: MarketDataStatus;
  source: "AMIS" | null;
}

function normalizedDateKey(record: ApiRecord): string | null {
  const dateOnly = String(record.priceDate ?? "").slice(0, 10);
  if (
    /^\d{4}-\d{2}-\d{2}$/.test(dateOnly) &&
    !Number.isNaN(Date.parse(`${dateOnly}T00:00:00.000Z`))
  ) {
    return dateOnly;
  }
  const observed = new Date(record.observedAt);
  return Number.isNaN(observed.getTime())
    ? null
    : observed.toISOString().slice(0, 10);
}

function observationTime(record: ApiRecord): string {
  const date = normalizedDateKey(record);
  return date ? `${date}T00:00:00.000Z` : record.observedAt;
}

function asMarketPrice(
  record: ApiRecord,
  freshness: MarketDataStatus,
): MarketPrice {
  return {
    commodity: record.cropName,
    variety: null,
    market: record.marketName,
    district: record.district,
    province: record.province,
    currency: "PKR",
    minimumPrice: normalizePrice(record.minimumPrice, Number(record.quantity)),
    price: normalizePrice(record.averagePrice, Number(record.quantity)),
    maximumPrice: normalizePrice(record.maximumPrice, Number(record.quantity)),
    quantity: DISPLAY_QUANTITY_KG,
    unit: record.unit,
    observedAt: observationTime(record),
    source: record.source,
    freshness,
  };
}

function aggregateHistory(records: ApiRecord[]): PricePoint[] {
  const byDate = new Map<string, number[]>();
  for (const record of records) {
    const date = normalizedDateKey(record);
    if (!date) continue;
    const values = byDate.get(date) ?? [];
    values.push(normalizePrice(record.averagePrice, Number(record.quantity)));
    byDate.set(date, values);
  }
  return [...byDate.entries()]
    .sort(([a], [b]) => a.localeCompare(b))
    .map(([date, prices]) => ({
      observedAt: `${date}T00:00:00.000Z`,
      price: Math.round(
        prices.reduce((sum, value) => sum + value, 0) / prices.length,
      ),
    }));
}

async function getJson<T>(url: string): Promise<T> {
  const response = await fetch(url, { cache: "no-store" });
  const body: unknown = await response.json().catch(() => null);
  if (!response.ok) {
    const message =
      body && typeof body === "object" && "error" in body
        ? (body as { error?: { message?: string } }).error?.message
        : undefined;
    throw new Error(
      message ?? "Live mandi prices are temporarily unavailable.",
    );
  }
  return body as T;
}

export const apiMarketRepository: MarketIntelligenceRepository = {
  async getMarketSummary({
    crop,
    location,
  }): Promise<MarketIntelligenceSnapshot | null> {
    if (
      location !== liveMarketLocations[0] ||
      !liveMarketCrops.includes(crop as (typeof liveMarketCrops)[number])
    )
      return null;
    const encodedCrop = encodeURIComponent(crop);
    const [currentResponse, historyResponse] = await Promise.all([
      getJson<ApiResponse>(
        `/api/market/prices?crop=${encodedCrop}&province=Punjab&limit=100`,
      ),
      getJson<ApiResponse>(
        `/api/market/history?crop=${encodedCrop}&days=365&limit=500`,
      ),
    ]);
    if (!currentResponse.records.length) return null;
    const freshness = currentResponse.freshness;
    const comparisons: MarketComparisonItem[] = currentResponse.records.map(
      (record) => ({ ...asMarketPrice(record, freshness), distanceKm: null }),
    );
    const average = Math.round(
      comparisons.reduce((sum, record) => sum + record.price, 0) /
        comparisons.length,
    );
    const lowestPrice = Math.min(
      ...comparisons.map((record) => record.minimumPrice),
    );
    const highestPrice = Math.max(
      ...comparisons.map((record) => record.maximumPrice),
    );
    const representative = currentResponse.records[0]!;
    const current: MarketPrice = {
      ...asMarketPrice(representative, freshness),
      market: "Punjab mandi average",
      district: `${comparisons.length} reporting markets`,
      price: average,
      minimumPrice: lowestPrice,
      maximumPrice: highestPrice,
    };
    const season = aggregateHistory(historyResponse.records);
    const latest = season.at(-1)?.price ?? average;
    const prior = season.length > 1 ? (season.at(-2)?.price ?? latest) : latest;
    const weeklyChangePercent =
      prior > 0 ? ((latest - prior) / prior) * 100 : 0;
    return {
      current,
      weeklyChangePercent,
      history: {
        "7D": season.slice(-7),
        "30D": season.slice(-30),
        SEASON: season,
      },
      nearbyMarkets: comparisons,
      insight: {
        summary:
          season.length > 1
            ? `${crop} mandi averages changed ${weeklyChangePercent >= 0 ? "up" : "down"} ${Math.abs(weeklyChangePercent).toFixed(1)}% between the two latest available AMIS observations.`
            : `${crop} has one current AMIS observation date. More history is required before reporting a price direction.`,
        evidence: [
          `${comparisons.length} AMIS market observations`,
          `${season.length} available observation date${season.length === 1 ? "" : "s"}`,
        ],
        uncertainty:
          "Listed prices can differ by crop variety, grade, moisture, commission, buyer terms and transport cost.",
        missingEvidence: [
          "Verified crop variety and grade",
          "Transport and commission costs",
          ...(season.length < 2 ? ["A previous AMIS observation date"] : []),
        ],
        status: freshness,
      },
      availableCrops: [...liveMarketCrops],
      availableLocations: [...liveMarketLocations],
      marketSummary: {
        reportingMarkets: comparisons.length,
        lowestPrice,
        averagePrice: average,
        highestPrice,
        spread: highestPrice - lowestPrice,
        displayQuantityKg: DISPLAY_QUANTITY_KG,
      },
    };
  },
};

export const liveMarketService = new MarketService(apiMarketRepository);

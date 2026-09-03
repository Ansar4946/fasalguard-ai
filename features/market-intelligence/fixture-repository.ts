import type {
  MarketComparisonItem,
  MarketIntelligenceRepository,
  MarketIntelligenceSnapshot,
  MarketPrice,
  PricePoint,
} from "./types";
import { MarketService } from "./market-service";

export const marketFixtureCrops = [
  "Wheat",
  "Cotton",
  "Rice",
  "Maize",
  "Sugarcane",
] as const;
export const defaultMarketFixtureCrop: (typeof marketFixtureCrops)[number] =
  "Wheat";
export const marketFixtureLocations = ["Punjab, Pakistan"] as const;

type CropFixture = {
  currentPrice: number;
  weeklyChangePercent: number;
  variation: number;
  markets: Array<{
    market: string;
    district: string;
    price: number;
    distanceKm: number;
  }>;
  context: string;
};

// Intentionally illustrative values: these must never be represented as live mandi quotes.
const cropFixtures: Record<(typeof marketFixtureCrops)[number], CropFixture> = {
  Cotton: {
    currentPrice: 8_200,
    weeklyChangePercent: -1.6,
    variation: 240,
    context:
      "Cotton prices may vary materially with staple quality, moisture and grade.",
    markets: [
      {
        market: "Multan Mandi",
        district: "Multan",
        price: 8_360,
        distanceKm: 315,
      },
      {
        market: "Faisalabad Mandi",
        district: "Faisalabad",
        price: 8_200,
        distanceKm: 122,
      },
      {
        market: "Bahawalpur Mandi",
        district: "Bahawalpur",
        price: 8_050,
        distanceKm: 430,
      },
    ],
  },
  Wheat: {
    currentPrice: 4_250,
    weeklyChangePercent: 4.8,
    variation: 130,
    context:
      "Wheat prices may vary with grain quality, moisture and procurement conditions.",
    markets: [
      {
        market: "Faisalabad Mandi",
        district: "Faisalabad",
        price: 4_500,
        distanceKm: 122,
      },
      {
        market: "Lahore Mandi",
        district: "Lahore",
        price: 4_250,
        distanceKm: 28,
      },
      {
        market: "Multan Mandi",
        district: "Multan",
        price: 4_100,
        distanceKm: 315,
      },
    ],
  },
  Rice: {
    currentPrice: 5_600,
    weeklyChangePercent: 2.4,
    variation: 180,
    context:
      "Rice prices depend strongly on variety, milling quality, moisture and grain length.",
    markets: [
      {
        market: "Gujranwala Mandi",
        district: "Gujranwala",
        price: 5_780,
        distanceKm: 95,
      },
      {
        market: "Sheikhupura Mandi",
        district: "Sheikhupura",
        price: 5_600,
        distanceKm: 48,
      },
      {
        market: "Hafizabad Mandi",
        district: "Hafizabad",
        price: 5_450,
        distanceKm: 125,
      },
    ],
  },
  Maize: {
    currentPrice: 3_100,
    weeklyChangePercent: 1.2,
    variation: 95,
    context:
      "Maize prices may vary with moisture content, grain condition and buyer specifications.",
    markets: [
      {
        market: "Sahiwal Mandi",
        district: "Sahiwal",
        price: 3_180,
        distanceKm: 165,
      },
      {
        market: "Okara Mandi",
        district: "Okara",
        price: 3_100,
        distanceKm: 120,
      },
      {
        market: "Pakpattan Mandi",
        district: "Pakpattan",
        price: 3_020,
        distanceKm: 205,
      },
    ],
  },
  Sugarcane: {
    currentPrice: 540,
    weeklyChangePercent: 0.7,
    variation: 18,
    context:
      "Sugarcane returns may depend on recovery rate, mill terms, deductions and transport.",
    markets: [
      {
        market: "Faisalabad Mandi",
        district: "Faisalabad",
        price: 555,
        distanceKm: 122,
      },
      { market: "Jhang Mandi", district: "Jhang", price: 540, distanceKm: 220 },
      {
        market: "Sargodha Mandi",
        district: "Sargodha",
        price: 525,
        distanceKm: 190,
      },
    ],
  },
};

function history(
  currentPrice: number,
  variation: number,
  length: number,
  seed: number,
): PricePoint[] {
  return Array.from({ length }, (_, index) => {
    const progress = length === 1 ? 1 : index / (length - 1);
    const wave = Math.sin((index + seed) * 1.37) * variation * 0.22;
    const price = Math.round(
      currentPrice - variation + variation * progress + wave,
    );
    const date = new Date(Date.UTC(2026, 7, 20 - (length - index - 1)));
    return {
      observedAt: date.toISOString(),
      price: index === length - 1 ? currentPrice : price,
    };
  });
}

function marketItem(
  crop: string,
  item: CropFixture["markets"][number],
  index: number,
): MarketComparisonItem {
  return {
    commodity: crop,
    variety: null,
    market: item.market,
    district: item.district,
    province: "Punjab",
    currency: "PKR",
    minimumPrice: Math.round(item.price * 0.96),
    price: item.price,
    maximumPrice: Math.round(item.price * 1.04),
    quantity: 40,
    unit: "KG",
    distanceKm: item.distanceKm,
    observedAt: new Date(
      Date.UTC(2026, 7, 20, 8, 30 - index * 15),
    ).toISOString(),
    source: "DEMO_FIXTURE",
    freshness: "DEMO",
  };
}

function buildSnapshot(
  crop: (typeof marketFixtureCrops)[number],
): MarketIntelligenceSnapshot {
  const fixture = cropFixtures[crop];
  const seed = marketFixtureCrops.indexOf(crop) + 1;
  const nearbyMarkets = fixture.markets.map((item, index) =>
    marketItem(crop, item, index),
  );
  const selected =
    nearbyMarkets.find((item) => item.price === fixture.currentPrice) ??
    nearbyMarkets[0];
  const current: MarketPrice = {
    commodity: selected.commodity,
    variety: selected.variety,
    market: selected.market,
    district: selected.district,
    province: selected.province,
    currency: selected.currency,
    minimumPrice: selected.minimumPrice,
    price: selected.price,
    maximumPrice: selected.maximumPrice,
    quantity: selected.quantity,
    unit: selected.unit,
    observedAt: selected.observedAt,
    source: selected.source,
    freshness: selected.freshness,
  };

  return {
    current,
    weeklyChangePercent: fixture.weeklyChangePercent,
    history: {
      "7D": history(fixture.currentPrice, fixture.variation, 7, seed),
      "30D": history(fixture.currentPrice, fixture.variation * 2, 30, seed),
      SEASON: history(fixture.currentPrice, fixture.variation * 3, 18, seed),
    },
    nearbyMarkets,
    insight: {
      summary: `The illustrative seven-day ${crop.toLowerCase()} series is ${fixture.weeklyChangePercent >= 0 ? "trending upward" : "trending downward"}. ${fixture.context} Compare verified local bids and selling costs before making a decision.`,
      evidence: [
        `Seven-day ${crop.toLowerCase()} demo trend`,
        "Three illustrative Punjab mandi comparisons",
      ],
      uncertainty:
        "This preview does not include live bids, verified crop grade, commissions, transport costs or official market observations.",
      missingEvidence: [
        "Live official market records",
        "Verified crop variety and grade",
        "Transport and commission costs",
      ],
      status: "DEMO",
    },
    availableCrops: [...marketFixtureCrops],
    availableLocations: [...marketFixtureLocations],
    marketSummary: {
      reportingMarkets: nearbyMarkets.length,
      lowestPrice: Math.min(...nearbyMarkets.map((item) => item.minimumPrice)),
      averagePrice: current.price,
      highestPrice: Math.max(...nearbyMarkets.map((item) => item.maximumPrice)),
      spread:
        Math.max(...nearbyMarkets.map((item) => item.maximumPrice)) -
        Math.min(...nearbyMarkets.map((item) => item.minimumPrice)),
      displayQuantityKg: 40,
    },
  };
}

export const fixtureMarketRepository: MarketIntelligenceRepository = {
  async getMarketSummary({ crop, location }) {
    // TODO: Replace via a server-only NestJS market-data provider backed by an approved official source.
    if (
      location !== marketFixtureLocations[0] ||
      !marketFixtureCrops.includes(crop as (typeof marketFixtureCrops)[number])
    )
      return null;
    return structuredClone(
      buildSnapshot(crop as (typeof marketFixtureCrops)[number]),
    );
  },
};

export const fixtureMarketService = new MarketService(fixtureMarketRepository);

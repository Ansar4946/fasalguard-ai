export type WeatherProviderName = "OPEN_METEO" | "OPENWEATHERMAP";

/** A single hourly (or current) weather observation/forecast point. */
export interface WeatherPoint {
  time: string;
  temperatureC: number | null;
  relativeHumidityPercent: number | null;
  precipitationMm: number | null;
  precipitationProbabilityPercent: number | null;
  windSpeedKph: number | null;
  windGustKph: number | null;
  solarRadiationWm2: number | null;
  et0Mm: number | null;
  soilMoistureM3M3: number | null;
  soilTemperatureC: number | null;
}

export interface WeatherCachePolicy {
  sharedProviderFetch: boolean;
  ttlSeconds: number;
  coordinatePrecisionDecimals: number;
}

/** Shape returned by GET /api/fields/:id/weather/current. */
export interface CurrentWeatherResponse {
  fieldId: string;
  provider: WeatherProviderName;
  observedAt: string;
  weather: WeatherPoint;
  cachePolicy: WeatherCachePolicy;
}

/** Shape returned by GET /api/fields/:id/weather/forecast. */
export interface ForecastResponse {
  fieldId: string;
  provider: WeatherProviderName;
  timezone: string;
  generatedAt: string;
  hourly: WeatherPoint[];
  cachePolicy: WeatherCachePolicy;
}

export type WeatherSuitability = "BENEFICIAL" | "MOSTLY_BENEFICIAL" | "CAUTION" | "HARMFUL" | "CRITICAL";

export interface WeatherRiskMatch {
  id: string;
  category: string;
  suitability: WeatherSuitability;
  priority: number;
  message: string;
  source: string;
  validationStatus: "DEMO_UNVERIFIED" | "PENDING_EXPERT_REVIEW" | "EXPERT_APPROVED" | "REJECTED";
  isExpertApproved: boolean;
  recommendationAllowed: boolean;
}

/** Shape returned by GET /api/fields/:id/weather/risks. */
export interface WeatherRisksResponse {
  fieldId: string;
  crop: string | null;
  provider: string;
  assessment: WeatherSuitability | null;
  productionAssessment: WeatherSuitability | null;
  matches: WeatherRiskMatch[];
  recommendationAllowed: boolean;
  disclaimer: string;
  ruleProvenance: { hasExpertApprovedRules: boolean; demoRuleCount: number };
}

export type DayCondition = "clear" | "chance-of-rain" | "rain-likely";

/** One calendar day's worth of hourly points, summarised for display. */
export interface DaySummary {
  key: string;
  label: string;
  dateLabel: string;
  highC: number | null;
  lowC: number | null;
  avgHumidityPercent: number | null;
  maxWindKph: number | null;
  maxRainProbabilityPercent: number | null;
  totalPrecipitationMm: number | null;
  condition: DayCondition;
}

export interface FieldOption {
  id: string;
  farmId: string;
  name: string;
  farmName: string;
  soilType: string | null;
  irrigationType: string | null;
  growthStage: string | null;
  cropCycleStatus: string | null;
}

import type { WeatherSuitability } from "./types";

const CATEGORY_LABEL: Record<string, string> = {
  HEAT_STRESS: "Heat stress",
  COLD_STRESS: "Cold stress",
  HIGH_HUMIDITY: "High humidity",
  HEAVY_RAIN: "Heavy rain",
  WATERLOGGING: "Waterlogging",
  WATER_DEFICIT: "Water deficit",
  STRONG_WIND: "Strong wind",
  SPRAYING_UNSUITABLE: "Spraying conditions",
  DISEASE_FAVOURABLE_CONDITIONS: "Disease risk",
  PEST_FAVOURABLE_CONDITIONS: "Pest risk",
};

export function categoryLabel(category: string): string {
  return CATEGORY_LABEL[category] ?? category.replaceAll("_", " ").toLowerCase();
}

export type SuitabilityTone = "beneficial" | "caution" | "harmful";

const SUITABILITY_TONE: Record<WeatherSuitability, SuitabilityTone> = {
  BENEFICIAL: "beneficial",
  MOSTLY_BENEFICIAL: "beneficial",
  CAUTION: "caution",
  HARMFUL: "harmful",
  CRITICAL: "harmful",
};

const SUITABILITY_LABEL: Record<WeatherSuitability, string> = {
  BENEFICIAL: "Beneficial",
  MOSTLY_BENEFICIAL: "Mostly beneficial",
  CAUTION: "Caution",
  HARMFUL: "Harmful",
  CRITICAL: "Critical",
};

export function suitabilityTone(suitability: WeatherSuitability): SuitabilityTone {
  return SUITABILITY_TONE[suitability];
}

export function suitabilityLabel(suitability: WeatherSuitability): string {
  return SUITABILITY_LABEL[suitability];
}

export function toneBadgeClass(tone: SuitabilityTone): string {
  if (tone === "beneficial") return "bg-green-100 text-success";
  if (tone === "caution") return "bg-amber-100 text-amber-900";
  return "bg-red-100 text-danger";
}

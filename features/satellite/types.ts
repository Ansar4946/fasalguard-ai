import type { GeoJsonPolygon } from "@/lib/geo/polygon";

// Shapes returned by the real satellite BFF routes (see docs/features/F02.md).
export type ProcessingStatus =
  | "QUEUED" | "SEARCHING_SCENE" | "PROCESSING" | "ANALYSING"
  | "COMPLETED" | "NO_VALID_SCENE" | "CLOUD_BLOCKED" | "FAILED";

export interface Scan {
  id: string;
  fieldId: string;
  processingStatus: ProcessingStatus;
  acquisitionDate: string | null;
  cloudCoverage: number | null;
  usablePixelPercentage: number | null;
  dataQuality: string;
  createdAt: string;
}
export interface LayerItem {
  id: string;
  type: string;
  contentType: string;
  access: { url: string; expiresAt: string };
}
export interface StatisticEntry {
  index: "NDVI" | "EVI" | "NDWI" | "NDMI";
  statistics: { mean: number | null; validPixelPercentage: number; maskedCloudPercentage: number; maskedPixelPercentage?: number };
}
export interface StressZoneMapItem {
  id: string;
  label: string;
  severity: "LOW" | "MODERATE" | "HIGH";
  score: number;
  areaHectares: number;
  geometry: GeoJsonPolygon;
}
export interface StressZone extends StressZoneMapItem {
  evidence: Record<string, number>;
  createdAt: string;
}
export interface Evidence {
  status: string;
  baselineMethod: string;
  observedAt: string | null;
  evidence: {
    diagnosticCapability?: string;
    reason?: string;
    validPixelPercentage?: number;
    minimumValidPixelPercentage?: number;
    observationCount?: number;
  };
}
export interface Comparison {
  fieldId: string;
  comparisonBasis: "ROLLING_FIELD_BASELINE" | "PREVIOUS_VALID_OBSERVATION" | "INSUFFICIENT_HISTORY";
  observations: Array<{
    captureId: string;
    acquisitionDate: string;
    healthScore: number | null;
    statistics: { NDVI?: { mean: number | null }; NDMI?: { mean: number | null }; EVI?: { mean: number | null }; NDWI?: { mean: number | null } };
  }>;
}

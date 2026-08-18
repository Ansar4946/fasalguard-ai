import type { GeoJsonPolygon } from "@/lib/geo/polygon";

export interface FieldCropCycleSummary {
  id: string;
  cropId: string;
  varietyId: string | null;
  sowingDate: string | null;
  expectedHarvestDate: string | null;
  growthStage: string | null;
  status: string;
}

/** Shape returned by POST /api/farms/:farmId/fields and GET /api/fields/:id. */
export interface FieldSummary {
  id: string;
  farmId: string;
  name: string;
  boundary: GeoJsonPolygon;
  centroid: { type: "Point"; coordinates: [number, number] };
  areaHectares: number;
  createdAt: string;
  updatedAt: string;
  currentCropCycle: FieldCropCycleSummary | null;
}

export interface FarmSummary {
  id: string;
  name: string;
}

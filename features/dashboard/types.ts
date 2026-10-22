import type { GeoJsonPolygon } from "@/lib/geo/polygon";

export type RiskLevel = "VERY_LOW" | "LOW" | "MODERATE" | "HIGH" | "CRITICAL";

export interface DashboardField {
  id: string;
  name: string;
  farmId: string;
  farmName: string;
  areaHectares: number;
  cropName: string | null;
  growthStage: string | null;
  healthScore: number | null;
  healthUpdatedAt: string | null;
  riskScore: number | null;
  riskLevel: RiskLevel | null;
  riskAssessedAt: string | null;
  lastScanAt: string | null;
}

export interface DashboardFarmPoint {
  id: string;
  name: string;
  latitude: number;
  longitude: number;
}

export interface DashboardTask {
  id: string;
  title: string;
  source: string;
  dueAt: string | null;
  fieldName: string | null;
}

export interface DashboardScan {
  id: string;
  status: string;
  createdAt: string;
  screenedCondition: string | null;
  confidence: number | null;
  disposition: string | null;
  fieldName: string | null;
}

export interface DashboardAlert {
  id: string;
  category: "WEATHER" | "SATELLITE" | "OUTBREAK" | "DIAGNOSIS" | "EXPERT";
  title: string;
  body: string;
  createdAt: string;
}

export interface DashboardOutbreak {
  id: string;
  crop: string;
  conditionFamily: string;
  status: string;
  lastReportedAt: string;
  distanceKm: number;
  geometry: GeoJsonPolygon;
}

/** Shape returned by GET /api/v1/dashboard. */
export interface DashboardData {
  farmer: { fullName: string; district: string | null; province: string | null } | null;
  summary: {
    farmCount: number;
    fieldCount: number;
    averageHealthScore: number | null;
    nearbyOutbreakCount: number;
    pendingTaskCount: number;
    unreadAlertCount: number;
  };
  fields: DashboardField[];
  farms: DashboardFarmPoint[];
  tasks: DashboardTask[];
  recentScans: DashboardScan[];
  alerts: DashboardAlert[];
  nearbyOutbreaks: DashboardOutbreak[];
  outbreakRadiusKm: number;
  generatedAt: string;
}

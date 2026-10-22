import type { Polygon } from 'geojson';

export type RiskLevel = 'VERY_LOW' | 'LOW' | 'MODERATE' | 'HIGH' | 'CRITICAL';

export interface DashboardFieldRow {
  id: string;
  name: string;
  farmId: string;
  farmName: string;
  areaHectares: number;
  cropName: string | null;
  growthStage: string | null;
  healthScore: number | null;
  healthUpdatedAt: Date | null;
  riskScore: number | null;
  riskLevel: RiskLevel | null;
  riskAssessedAt: Date | null;
  lastScanAt: Date | null;
}

export interface DashboardFarmPoint {
  id: string;
  name: string;
  latitude: number;
  longitude: number;
}

export interface DashboardTaskRow {
  id: string;
  title: string;
  source: string;
  dueAt: Date | null;
  fieldName: string | null;
  total: number;
}

export interface DashboardScanRow {
  id: string;
  status: string;
  createdAt: Date;
  screenedCondition: string | null;
  confidence: number | null;
  disposition: string | null;
  fieldName: string | null;
}

export interface DashboardAlertRow {
  id: string;
  category: string;
  title: string;
  body: string;
  createdAt: Date;
  total: number;
}

export interface DashboardOutbreakRow {
  id: string;
  crop: string;
  conditionFamily: string;
  status: string;
  lastReportedAt: Date;
  distanceKm: number;
  geometry: Polygon;
}

export interface DashboardResponse {
  farmer: { fullName: string; district: string | null; province: string | null } | null;
  summary: {
    farmCount: number;
    fieldCount: number;
    averageHealthScore: number | null;
    nearbyOutbreakCount: number;
    pendingTaskCount: number;
    unreadAlertCount: number;
  };
  fields: DashboardFieldRow[];
  farms: DashboardFarmPoint[];
  tasks: Array<Omit<DashboardTaskRow, 'total'>>;
  recentScans: DashboardScanRow[];
  alerts: Array<Omit<DashboardAlertRow, 'total'>>;
  nearbyOutbreaks: DashboardOutbreakRow[];
  outbreakRadiusKm: number;
  generatedAt: string;
}

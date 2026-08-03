export type OutbreakStatus = "monitoring" | "suspected" | "community_supported" | "expert_confirmed";
export type AlertKind = "outbreak" | "weather" | "expert" | "task" | "community";
export type AlertPriority = "urgent" | "warning" | "info";

export interface OutbreakCluster {
  id: string; disease: string; crop: string; district: string; reportCount: number;
  expertConfirmedCount: number; farmsAtRisk: number; radiusKm: number;
  status: OutbreakStatus; risk: "moderate" | "high" | "critical";
  position: { x: number; y: number }; updatedAt: string;
}

export interface FarmerAlert {
  id: string; kind: AlertKind; priority: AlertPriority; title: string; summary: string;
  location?: string; createdAt: string; unread: boolean; action: string;
}

export interface CommunityReportInput {
  crop: string; symptoms: string; district: string; similarSymptoms: boolean;
}

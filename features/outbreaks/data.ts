import type { FarmerAlert, OutbreakCluster } from "./types";

export const outbreakClusters: OutbreakCluster[] = [
  { id: "multan-east-clc", disease: "Cotton leaf curl", crop: "Cotton", district: "Multan East", reportCount: 14, expertConfirmedCount: 3, farmsAtRisk: 42, radiusKm: 12, status: "suspected", risk: "high", position: { x: 46, y: 38 }, updatedAt: "2026-08-01T07:45:00Z" },
  { id: "khanewal-clc", disease: "Cotton leaf curl", crop: "Cotton", district: "Khanewal", reportCount: 7, expertConfirmedCount: 5, farmsAtRisk: 31, radiusKm: 8, status: "expert_confirmed", risk: "critical", position: { x: 70, y: 58 }, updatedAt: "2026-08-01T06:20:00Z" },
  { id: "sahiwal-rust", disease: "Leaf rust", crop: "Wheat", district: "Sahiwal", reportCount: 4, expertConfirmedCount: 0, farmsAtRisk: 18, radiusKm: 6, status: "monitoring", risk: "moderate", position: { x: 28, y: 65 }, updatedAt: "2026-07-31T16:10:00Z" },
];

export const farmerAlerts: FarmerAlert[] = [
  { id: "alert-1", kind: "outbreak", priority: "urgent", title: "High-risk cotton disease activity detected", summary: "Three related reports were recorded near Green Valley Farm. Inspect cotton fields for curling and yellow veins.", location: "Multan East · approximately 8 km away", createdAt: "2026-08-01T07:45:00Z", unread: true, action: "Inspect field" },
  { id: "alert-2", kind: "weather", priority: "warning", title: "Severe weather warning: storm approaching", summary: "Strong wind and rain are expected this evening. Avoid spraying and secure loose equipment.", location: "Multan", createdAt: "2026-08-01T06:30:00Z", unread: true, action: "Review weather" },
  { id: "alert-3", kind: "expert", priority: "info", title: "An expert responded to your scan", summary: "Dr. Arshad added guidance to your North Field crop-health report.", createdAt: "2026-07-31T14:00:00Z", unread: false, action: "Read response" },
  { id: "alert-4", kind: "task", priority: "info", title: "Weekly crop-health follow-up is due", summary: "Upload a new image from South Field to compare symptom progression.", createdAt: "2026-07-31T08:00:00Z", unread: false, action: "Start follow-up" },
];

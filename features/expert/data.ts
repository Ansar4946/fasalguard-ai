import type { ExpertCase, ManagedOutbreak } from "./types";

export const expertCases: ExpertCase[] = [
  { id: "FG-8821", farmerName: "Ahmed Khan", farmName: "Sunshine Meadows", fieldName: "North Field", district: "Multan", crop: "Cotton", aiSuggestion: "Cotton leaf curl", confidence: 0.86, severity: "high", priority: "urgent", status: "pending", submittedAt: "2026-08-01T08:10:00Z", description: "Leaves are curling upward with yellow veins. Symptoms appeared five days ago and are spreading across the north section.", symptoms: ["Upward curling", "Yellow veins", "Reduced leaf size"], imageQuality: "Good", communityReports: 7 },
  { id: "FG-8819", farmerName: "M. Aslam", farmName: "Canal View Farm", fieldName: "Field 2", district: "Khanewal", crop: "Wheat", aiSuggestion: "Leaf rust", confidence: 0.78, severity: "moderate", priority: "high", status: "in_review", submittedAt: "2026-08-01T07:30:00Z", description: "Orange spots have appeared on several leaves after humid weather.", symptoms: ["Orange pustules", "Leaf yellowing"], imageQuality: "Good", communityReports: 4 },
  { id: "FG-8816", farmerName: "Razia Bibi", farmName: "Green Acres", fieldName: "West Plot", district: "Sahiwal", crop: "Rice", aiSuggestion: "Nutrient stress", confidence: 0.64, severity: "moderate", priority: "normal", status: "pending", submittedAt: "2026-07-31T17:20:00Z", description: "Lower leaves are pale and growth is slower in one section.", symptoms: ["Pale leaves", "Slow growth"], imageQuality: "Acceptable", communityReports: 0 },
  { id: "FG-8812", farmerName: "Zafar Ali", farmName: "River Bend", fieldName: "Cotton South", district: "Multan", crop: "Cotton", aiSuggestion: "Whitefly damage", confidence: 0.72, severity: "low", priority: "normal", status: "pending", submittedAt: "2026-07-31T15:40:00Z", description: "Sticky residue and a few curled leaves are visible.", symptoms: ["Sticky residue", "Whiteflies visible"], imageQuality: "Good", communityReports: 2 },
];

export const managedOutbreaks: ManagedOutbreak[] = [
  { id: "OB-104", disease: "Wheat leaf rust", crop: "Wheat", district: "Multan East", status: "suspected", reports: 14, expertConfirmed: 3, farmsAtRisk: 46, radiusKm: 12, spreadRate: 0.63, confidence: 0.81, lastUpdated: "2026-08-01T08:00:00Z" },
  { id: "OB-101", disease: "Cotton leaf curl", crop: "Cotton", district: "Khanewal", status: "confirmed", reports: 22, expertConfirmed: 12, farmsAtRisk: 71, radiusKm: 18, spreadRate: 0.78, confidence: 0.94, lastUpdated: "2026-08-01T07:20:00Z" },
];

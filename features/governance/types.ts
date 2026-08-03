export type DistrictRisk = "low" | "moderate" | "high" | "critical";
export interface DistrictSummary { district:string; crop:string; risk:DistrictRisk; reports:number; confirmed:number; farmersWarned:number; responseHours:number; }
export interface ImpactMetric { label:string; value:string; change:string; context:string; }

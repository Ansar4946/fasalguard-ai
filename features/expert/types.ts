export type CasePriority = "urgent" | "high" | "normal";
export type CaseStatus = "pending" | "in_review" | "confirmed" | "corrected" | "rejected";
export type ExpertDecision = "confirm" | "correct" | "request_more_evidence" | "reject";

export interface ExpertCase {
  id: string; farmerName: string; farmName: string; fieldName: string; district: string;
  crop: string; aiSuggestion: string; confidence: number; severity: "low" | "moderate" | "high";
  priority: CasePriority; status: CaseStatus; submittedAt: string; description: string;
  symptoms: string[]; imageQuality: string; communityReports: number;
}

export interface ExpertDecisionInput {
  caseId: string; decision: ExpertDecision; finalDiagnosis?: string; notes: string;
  farmerMessage: string; treatmentSafetyReviewed: boolean;
}

export interface ManagedOutbreak {
  id: string; disease: string; crop: string; district: string; status: "suspected" | "confirmed";
  reports: number; expertConfirmed: number; farmsAtRisk: number; radiusKm: number;
  spreadRate: number; confidence: number; lastUpdated: string;
}

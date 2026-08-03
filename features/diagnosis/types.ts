export type ScanStep = "capture" | "field" | "symptoms" | "analysis" | "results";
export type ImageQuality = "unchecked" | "good" | "too_dark" | "blurry" | "too_distant";
export type ReviewStatus = "ai_suspected" | "expert_pending" | "expert_confirmed" | "rejected";
export type Severity = "low" | "moderate" | "high" | "critical";

export interface ScanImage {
  id: string;
  name: string;
  previewUrl: string;
  quality: ImageQuality;
}

export interface DiagnosisResult {
  id: string;
  condition: string;
  scientificName: string;
  confidence: number;
  severity: Severity;
  reviewStatus: ReviewStatus;
  symptoms: string[];
  explanation: string;
  alternatives: Array<{ condition: string; confidence: number }>;
  immediateActions: string[];
  createdAt: string;
}

export interface ScanSession {
  id: string;
  farmId: string | null;
  fieldId: string | null;
  crop: string | null;
  images: ScanImage[];
  step: ScanStep;
  progress: number;
  result: DiagnosisResult | null;
  updatedAt: string;
}

export interface DiagnosisRepository {
  getSession(id: string): Promise<ScanSession | null>;
  saveSession(session: ScanSession): Promise<ScanSession>;
  analyze(session: ScanSession): Promise<DiagnosisResult>;
}

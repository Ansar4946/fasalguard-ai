export type ScanStep = "capture" | "field" | "symptoms" | "analysis" | "results";
export type ScanImageCategory = "LEAF_FRONT" | "LEAF_BACK" | "WHOLE_PLANT" | "FIELD_CONTEXT" | "PEST_IMAGE";

export interface ScanImage {
  id: string;
  name: string;
  /** Small persisted data-URL thumbnail (survives reloads, unlike blob: URLs). */
  previewUrl: string;
  category: ScanImageCategory;
  mediaId: string | null;
  uploadStatus: "uploading" | "done" | "failed";
}

export interface ScanSession {
  farmId: string | null;
  fieldId: string | null;
  backendScanId: string | null;
  images: ScanImage[];
  step: ScanStep;
  progress: number;
  /** Farmer's answers on the symptoms step, keyed by observation question. */
  observations: Record<string, string>;
  updatedAt: string;
}

export type CropScanStatus =
  | "CREATED" | "UPLOADING" | "IMAGE_VALIDATION" | "ANALYSING"
  | "NEEDS_FOLLOW_UP" | "DIAGNOSED" | "EXPERT_REVIEW" | "VERIFIED" | "RESOLVED";

export interface DiagnosisAlternative {
  condition: string;
  confidence: number;
}

export interface CropScan {
  id: string;
  fieldId: string | null;
  fieldName: string | null;
  status: CropScanStatus;
  failureCode: string | null;
  createdAt: string;
  images: Array<{ id: string; mediaId: string; category: ScanImageCategory }>;
  screenedCondition: string | null;
  confidence: number | null;
  disposition: "BETTER_IMAGES_REQUIRED" | "EXPERT_REVIEW_RECOMMENDED" | "SCREENING_COMPLETE" | null;
  isFirmDiagnosis: boolean | null;
  disclaimer: string | null;
  alternatives: DiagnosisAlternative[];
}

export type SeverityLevel = "LOW" | "MODERATE" | "HIGH" | "CRITICAL";

/** Subset of the deterministic severity assessment shown to farmers. */
export interface SeverityAssessment {
  severity: SeverityLevel;
  calculatedScore: number;
  expertEscalation: boolean;
  escalationReasons: string[];
}

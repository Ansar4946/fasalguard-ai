export type ScanStep = "capture" | "field" | "symptoms" | "analysis" | "results";
export type ScanImageCategory = "LEAF_FRONT" | "LEAF_BACK" | "WHOLE_PLANT" | "FIELD_CONTEXT" | "PEST_IMAGE";

export interface ScanImage {
  id: string;
  name: string;
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

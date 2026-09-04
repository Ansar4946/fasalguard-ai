import type { ScanImageCategory } from '../crop-scan.enums';
export const VISION_DIAGNOSIS_PROVIDER = Symbol('VISION_DIAGNOSIS_PROVIDER');
export interface VisionInput {
  image: Buffer;
  contentType: string;
  category: ScanImageCategory;
  /** Active field crop used to select the correct crop-specific model. */
  cropName?: string | null;
}
export interface VisionQuality {
  acceptable: boolean;
  issues: Array<{ code: string; score?: number }>;
  metadata?: Record<string, unknown>;
}
export interface VisionPrediction {
  modelId: string;
  modelVersion: string;
  predictedCondition: string;
  confidence: number;
  alternatives: Array<{ condition: string; confidence: number }>;
  inferenceTimestamp: string;
  rawProviderResponse: Record<string, unknown>;
}
export interface VisionDiagnosisProvider {
  assessQuality(input: VisionInput): Promise<VisionQuality>;
  predict(inputs: VisionInput[]): Promise<VisionPrediction>;
}

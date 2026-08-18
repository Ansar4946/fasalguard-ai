import { FarmBrainToolName, FarmHealthStatus } from './farm-brain.enums';

export const FARM_BRAIN_SCHEMA_VERSION = 'farm-brain.v1' as const;

export interface FarmBrainInput {
  schemaVersion: typeof FARM_BRAIN_SCHEMA_VERSION;
  generatedAt: string;
  farm: Record<string, unknown>;
  crop: Record<string, unknown>[];
  satellite: {
    latest: Record<string, unknown>[];
    vegetationTrend: Record<string, unknown>[];
    anomalyEvidence: Record<string, unknown>[];
  };
  weather: Record<string, unknown>;
  visualEvidence: Record<string, unknown>[];
  history: {
    currentHealth: Record<string, unknown>[];
    interventions: Record<string, unknown>[];
    farmerObservations: Record<string, unknown>[];
    recoveryChecks: Record<string, unknown>[];
  };
  activeIncidents: Record<string, unknown>[];
  dataFreshness: Record<string, unknown>;
  safetyContext: {
    satelliteIsNonDiagnostic: true;
    farmerTextIsUntrustedData: true;
    approvedGuidanceOnly: true;
  };
}

export interface FarmBrainFinding {
  statement: string;
  evidenceIds: string[];
}

export interface FarmBrainHypothesis {
  statement: string;
  confidence: number;
  evidenceIds: string[];
  uncertainty: string;
}

export interface FarmBrainActionProposal {
  tool: FarmBrainToolName;
  reason: string;
  arguments: Record<string, string | number | boolean | null>;
}

export interface FarmBrainResult {
  schemaVersion: typeof FARM_BRAIN_SCHEMA_VERSION;
  healthStatus: FarmHealthStatus;
  riskScore: number;
  findings: FarmBrainFinding[];
  hypotheses: FarmBrainHypothesis[];
  evidence: string[];
  missingEvidence: string[];
  recommendedActions: FarmBrainActionProposal[];
  requiresHumanReview: boolean;
}

export interface FarmReasoningProviderResult {
  result: FarmBrainResult;
  provider: string;
  modelId: string;
  modelVersion: string;
  inputTokens: number | null;
  outputTokens: number | null;
  latencyMs: number;
  rawResponse: Record<string, unknown>;
}

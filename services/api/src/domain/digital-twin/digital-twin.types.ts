import type { EvidenceFreshness } from './digital-twin.enums';

export interface EvidenceReference {
  id: string;
  type: string;
  source: string;
  sourceIdentifier: string;
  observedAt: Date | string;
  ingestedAt: Date | string;
}

export interface FreshnessDescriptor {
  status: EvidenceFreshness;
  observedAt: Date | string | null;
  ingestedAt: Date | string | null;
  ageSeconds: number | null;
  thresholdSeconds: number;
  source: string | null;
  sourceIdentifier: string | null;
}

export interface DigitalTwinSnapshot {
  generatedAt: string;
  window: { from: string; to: string; days: number };
  farm: Record<string, unknown>;
  fields: Record<string, unknown>[];
  crop: Record<string, unknown>[];
  currentHealth: Record<string, unknown>[];
  latestSatellite: Record<string, unknown>[];
  vegetationTrend: Record<string, unknown>[];
  satelliteEvidence: Record<string, unknown>[];
  weather: { current: Record<string, unknown>[]; forecasts: Record<string, unknown>[] };
  activeIncidents: Record<string, unknown>[];
  recentInterventions: Record<string, unknown>[];
  farmerObservations: Record<string, unknown>[];
  previousDiagnoses: Record<string, unknown>[];
  recoveryChecks: Record<string, unknown>[];
  dataFreshness: Record<string, FreshnessDescriptor>;
}

export interface TimelineEvent {
  id: string;
  type: string;
  fieldId: string | null;
  occurredAt: Date | string;
  source: string;
  sourceIdentifier: string;
  summary: Record<string, unknown>;
  evidence: EvidenceReference[];
}

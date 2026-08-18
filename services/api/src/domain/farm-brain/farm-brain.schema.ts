import { ServiceUnavailableException } from '@nestjs/common';
import { FarmBrainToolName, FarmHealthStatus } from './farm-brain.enums';
import {
  FARM_BRAIN_SCHEMA_VERSION,
  type FarmBrainActionProposal,
  type FarmBrainFinding,
  type FarmBrainHypothesis,
  type FarmBrainResult,
} from './farm-brain.types';

const outputKeys = new Set([
  'schemaVersion',
  'healthStatus',
  'riskScore',
  'findings',
  'hypotheses',
  'evidence',
  'missingEvidence',
  'recommendedActions',
  'requiresHumanReview',
]);
const mutationTools = new Set<FarmBrainToolName>([
  FarmBrainToolName.CreateIncident,
  FarmBrainToolName.CreateInspectionTask,
  FarmBrainToolName.ScheduleFollowUp,
  FarmBrainToolName.SendFarmerAlert,
  FarmBrainToolName.RequestFarmerPhoto,
  FarmBrainToolName.EscalateToExpert,
]);
const forbiddenAgronomicInstruction =
  /\b(pesticide|fungicide|insecticide|herbicide|dosage|dose|mixture|spray\s+\d)\b/i;
const conditionClaim =
  /\b(blight|curl virus|fung(?:us|al)|bacterial|viral|disease|infestation|deficiency)\b/i;

export function validateFarmBrainResult(
  value: unknown,
  evidenceIds: Set<string>,
  visualEvidenceIds = new Set<string>(),
  satelliteAnomalyEvidenceIds = new Set<string>(),
): FarmBrainResult {
  const record = object(value, 'Farm Brain output');
  if (Object.keys(record).some((key) => !outputKeys.has(key))) invalid('unknown output field');
  if (record.schemaVersion !== FARM_BRAIN_SCHEMA_VERSION) invalid('schema version');
  if (!Object.values(FarmHealthStatus).includes(record.healthStatus as FarmHealthStatus))
    invalid('health status');
  const riskScore = finiteNumber(record.riskScore, 'riskScore');
  if (riskScore < 0 || riskScore > 1) invalid('riskScore range');
  const findings = array(record.findings, 'findings', 20).map((item) =>
    validateFinding(item, evidenceIds),
  );
  const hypotheses = array(record.hypotheses, 'hypotheses', 10).map((item) =>
    validateHypothesis(item, evidenceIds, visualEvidenceIds),
  );
  const evidence = stringArray(record.evidence, 'evidence', 100);
  assertEvidence(evidence, evidenceIds);
  const missingEvidence = stringArray(record.missingEvidence, 'missingEvidence', 20).map((x) =>
    x.slice(0, 300),
  );
  const recommendedActions = array(record.recommendedActions, 'recommendedActions', 10).map(
    validateAction,
  );
  enforceInvestigationPolicy(
    hypotheses,
    recommendedActions,
    visualEvidenceIds,
    satelliteAnomalyEvidenceIds,
  );
  if (typeof record.requiresHumanReview !== 'boolean') invalid('requiresHumanReview');
  const mustReview =
    record.healthStatus === FarmHealthStatus.Critical ||
    hypotheses.some((hypothesis) => hypothesis.confidence < 0.65);
  return {
    schemaVersion: FARM_BRAIN_SCHEMA_VERSION,
    healthStatus: record.healthStatus as FarmHealthStatus,
    riskScore,
    findings,
    hypotheses,
    evidence,
    missingEvidence,
    recommendedActions,
    requiresHumanReview: record.requiresHumanReview || mustReview,
  };
}

function enforceInvestigationPolicy(
  hypotheses: FarmBrainHypothesis[],
  actions: FarmBrainActionProposal[],
  visualEvidenceIds: Set<string>,
  satelliteAnomalyEvidenceIds: Set<string>,
): void {
  const hasSatelliteAnomaly = satelliteAnomalyEvidenceIds.size > 0;
  const hasVisualEvidence = visualEvidenceIds.size > 0;
  const requestsPhoto = actions.some(
    (action) => action.tool === FarmBrainToolName.RequestFarmerPhoto,
  );
  const createsIncident = actions.some(
    (action) => action.tool === FarmBrainToolName.CreateIncident,
  );
  const hasVisualHypothesis = hypotheses.some((hypothesis) =>
    hypothesis.evidenceIds.some((id) => visualEvidenceIds.has(id)),
  );

  if (hasSatelliteAnomaly && !hasVisualEvidence && !requestsPhoto)
    invalid('satellite anomaly without a farmer-photo evidence request');
  if (createsIncident && (!hasVisualEvidence || !hasVisualHypothesis))
    invalid('incident proposal without a visual-evidence-grounded hypothesis');
}

export function isMutationTool(tool: FarmBrainToolName): boolean {
  return mutationTools.has(tool);
}

function validateFinding(value: unknown, evidenceIds: Set<string>): FarmBrainFinding {
  const item = object(value, 'finding');
  const statement = text(item.statement, 'finding statement', 500);
  const references = stringArray(item.evidenceIds, 'finding evidenceIds', 20);
  assertEvidence(references, evidenceIds);
  return { statement, evidenceIds: references };
}

function validateHypothesis(
  value: unknown,
  evidenceIds: Set<string>,
  visualEvidenceIds: Set<string>,
): FarmBrainHypothesis {
  const item = object(value, 'hypothesis');
  const statement = text(item.statement, 'hypothesis statement', 500);
  const confidence = finiteNumber(item.confidence, 'hypothesis confidence');
  if (confidence < 0 || confidence > 1) invalid('hypothesis confidence range');
  const references = stringArray(item.evidenceIds, 'hypothesis evidenceIds', 20);
  assertEvidence(references, evidenceIds);
  if (conditionClaim.test(statement) && !references.some((id) => visualEvidenceIds.has(id)))
    invalid('condition hypothesis without ground-level visual evidence');
  return {
    statement,
    confidence,
    evidenceIds: references,
    uncertainty: text(item.uncertainty, 'hypothesis uncertainty', 500),
  };
}

function validateAction(value: unknown): FarmBrainActionProposal {
  const item = object(value, 'recommended action');
  if (!Object.values(FarmBrainToolName).includes(item.tool as FarmBrainToolName))
    invalid('tool allowlist');
  const reason = text(item.reason, 'action reason', 500);
  if (forbiddenAgronomicInstruction.test(reason)) invalid('unapproved chemical guidance');
  const args = object(item.arguments, 'action arguments');
  if (Object.keys(args).length > 12) invalid('too many action arguments');
  const clean: Record<string, string | number | boolean | null> = {};
  for (const [key, raw] of Object.entries(args)) {
    if (!/^[a-z][A-Za-z0-9]{0,39}$/.test(key)) invalid('action argument name');
    if (raw !== null && !['string', 'number', 'boolean'].includes(typeof raw))
      invalid('action argument value');
    if (typeof raw === 'string' && forbiddenAgronomicInstruction.test(raw))
      invalid('unapproved chemical guidance');
    clean[key] = typeof raw === 'string' ? raw.slice(0, 500) : (raw as number | boolean | null);
  }
  return { tool: item.tool as FarmBrainToolName, reason, arguments: clean };
}

function object(value: unknown, name: string): Record<string, unknown> {
  if (!value || typeof value !== 'object' || Array.isArray(value)) invalid(name);
  return value as Record<string, unknown>;
}
function array(value: unknown, name: string, max: number): unknown[] {
  if (!Array.isArray(value) || value.length > max) invalid(name);
  return value;
}
function stringArray(value: unknown, name: string, max: number): string[] {
  const values = array(value, name, max);
  if (values.some((item) => typeof item !== 'string')) invalid(name);
  return (values as string[]).map((item) => item.slice(0, 300));
}
function text(value: unknown, name: string, max: number): string {
  if (typeof value !== 'string' || value.trim().length === 0 || value.length > max) invalid(name);
  return value.trim();
}
function finiteNumber(value: unknown, name: string): number {
  if (typeof value !== 'number' || !Number.isFinite(value)) invalid(name);
  return value;
}
function assertEvidence(references: string[], evidenceIds: Set<string>): void {
  if (references.some((id) => !evidenceIds.has(id))) invalid('unknown evidence reference');
}
function invalid(reason: string): never {
  throw new ServiceUnavailableException(`Gemini returned invalid structured output: ${reason}.`);
}

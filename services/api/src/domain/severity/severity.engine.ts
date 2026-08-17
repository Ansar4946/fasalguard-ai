import { Injectable } from '@nestjs/common';
import { SeverityLevel } from './severity.enums';
export type EvidenceKey =
  | 'imageConfidenceRisk'
  | 'visualExtent'
  | 'fieldAffected'
  | 'spreadRate'
  | 'historyTrend'
  | 'satelliteDecline'
  | 'nearbyReports'
  | 'weatherRisk';
export interface SeverityEvidence {
  key: EvidenceKey;
  value: number | null;
  reference: { type: string; id: string | null };
  description: string;
}
export interface SeverityRules {
  engineVersion: string;
  weights: Record<EvidenceKey, number>;
  thresholds: { moderate: number; high: number; critical: number };
}
export interface SeverityResult {
  severity: SeverityLevel;
  calculatedScore: number;
  factors: Array<SeverityEvidence & { weight: number; contribution: number }>;
  weightsUsed: Record<string, number>;
  evidenceReferences: Array<{ key: EvidenceKey; type: string; id: string | null }>;
  explanation: {
    whatIncreasedRisk: string[];
    whatReducedRisk: string[];
    whatRemainsUncertain: string[];
    recommendedNextAction: string;
  };
  expertEscalation: boolean;
  escalationReasons: string[];
  engineVersion: string;
  generatedAt: string;
}
@Injectable()
export class SeverityEngine {
  calculate(
    evidence: SeverityEvidence[],
    rules: SeverityRules,
    flags: { lowConfidence: boolean; rapidSpread: boolean; unknownCondition: boolean },
  ): SeverityResult {
    const known = evidence.filter(
      (x): x is SeverityEvidence & { value: number } => typeof x.value === 'number',
    );
    const totalWeight = known.reduce((sum, x) => sum + (rules.weights[x.key] ?? 0), 0);
    const factors = known.map((x) => {
      const weight = rules.weights[x.key] ?? 0;
      return { ...x, weight, contribution: totalWeight ? (x.value * weight) / totalWeight : 0 };
    });
    const score =
      Math.round(
        Math.max(
          0,
          Math.min(
            100,
            factors.reduce((sum, x) => sum + x.contribution, 0),
          ),
        ) * 100,
      ) / 100;
    const severity =
      score >= rules.thresholds.critical
        ? SeverityLevel.Critical
        : score >= rules.thresholds.high
          ? SeverityLevel.High
          : score >= rules.thresholds.moderate
            ? SeverityLevel.Moderate
            : SeverityLevel.Low;
    const reasons: string[] = [];
    if (severity === SeverityLevel.Critical) reasons.push('CRITICAL_SEVERITY');
    if (flags.lowConfidence) reasons.push('LOW_MODEL_CONFIDENCE');
    if (flags.rapidSpread) reasons.push('RAPID_SPREAD');
    if (flags.unknownCondition) reasons.push('UNKNOWN_CONDITION');
    const high = factors.filter((x) => x.value >= 60).map((x) => x.description);
    const low = factors.filter((x) => x.value <= 30).map((x) => x.description);
    const uncertain = evidence
      .filter((x) => x.value === null)
      .map((x) => `${x.description} was unavailable.`);
    return {
      severity,
      calculatedScore: score,
      factors,
      weightsUsed: rules.weights,
      evidenceReferences: evidence.map((x) => ({ key: x.key, ...x.reference })),
      explanation: {
        whatIncreasedRisk: high,
        whatReducedRisk: low,
        whatRemainsUncertain: uncertain,
        recommendedNextAction: reasons.length
          ? 'Request agriculture expert review before acting on the screening result.'
          : 'Continue monitoring and collect another clear image if symptoms change.',
      },
      expertEscalation: reasons.length > 0,
      escalationReasons: reasons,
      engineVersion: rules.engineVersion,
      generatedAt: new Date().toISOString(),
    };
  }
}

import { Injectable } from '@nestjs/common';
import { FieldRiskLevel } from './risk.enums';
export interface RiskEvidence {
  key: string;
  value: number | null;
  description: string;
  sourceType: string;
  sourceId: string | null;
  details?: Record<string, unknown>;
}
export interface RiskRules {
  version: string;
  weights: Record<string, number>;
  thresholds: { low: number; moderate: number; high: number; critical: number };
}
@Injectable()
export class RiskEngine {
  calculate(
    evidence: RiskEvidence[],
    rules: RiskRules,
  ): {
    score: number;
    level: FieldRiskLevel;
    evidence: RiskEvidence[];
    factors: Record<string, unknown>[];
    explanation: {
      increasedRisk: string[];
      reducedRisk: string[];
      uncertain: string[];
      summary: string;
    };
  } {
    const known = evidence.filter(
      (x): x is RiskEvidence & { value: number } => typeof x.value === 'number',
    );
    const total = known.reduce((s, x) => s + (rules.weights[x.key] ?? 0), 0);
    const factors = known.map((x) => {
      const weight = rules.weights[x.key] ?? 0;
      return {
        key: x.key,
        value: x.value,
        weight,
        contribution: total ? (x.value * weight) / total : 0,
        description: x.description,
        sourceType: x.sourceType,
        sourceId: x.sourceId,
      };
    });
    const score =
      Math.round(
        Math.max(
          0,
          Math.min(
            100,
            factors.reduce((s, x) => s + Number(x.contribution), 0),
          ),
        ) * 100,
      ) / 100;
    const level =
      score >= rules.thresholds.critical
        ? FieldRiskLevel.Critical
        : score >= rules.thresholds.high
          ? FieldRiskLevel.High
          : score >= rules.thresholds.moderate
            ? FieldRiskLevel.Moderate
            : score >= rules.thresholds.low
              ? FieldRiskLevel.Low
              : FieldRiskLevel.VeryLow;
    const increased = known.filter((x) => x.value >= 60).map((x) => x.description);
    const reduced = known.filter((x) => x.value <= 25).map((x) => x.description);
    const uncertain = evidence
      .filter((x) => x.value === null)
      .map((x) => `${x.description} is unavailable.`);
    return {
      score,
      level,
      evidence,
      factors,
      explanation: {
        increasedRisk: increased,
        reducedRisk: reduced,
        uncertain,
        summary: `${level.replace('_', ' ').toLowerCase()} evidence-based inspection priority. This is a risk assessment, not a disease prediction.`,
      },
    };
  }
}

import { Injectable } from '@nestjs/common';
import type { WeatherPoint } from './providers/weather.provider';
import { RuleValidationStatus, WeatherSuitability } from './weather.enums';
export type RuleOperator = 'gt' | 'gte' | 'lt' | 'lte' | 'eq';
export interface WeatherCondition {
  variable: keyof WeatherPoint;
  operator: RuleOperator;
  value: number;
}
export interface EvaluatedRule {
  id: string;
  category: string;
  suitability: WeatherSuitability;
  priority: number;
  conditions: { all?: WeatherCondition[]; any?: WeatherCondition[] };
  message: string;
  source: string;
  validationStatus: RuleValidationStatus;
}
export interface WeatherRuleEvaluation {
  assessment: WeatherSuitability | null;
  productionAssessment: WeatherSuitability | null;
  matches: Array<EvaluatedRule & { isExpertApproved: boolean; recommendationAllowed: boolean }>;
  recommendationAllowed: boolean;
  disclaimer: string;
}
const rank: Record<WeatherSuitability, number> = {
  [WeatherSuitability.Beneficial]: 0,
  [WeatherSuitability.MostlyBeneficial]: 1,
  [WeatherSuitability.Caution]: 2,
  [WeatherSuitability.Harmful]: 3,
  [WeatherSuitability.Critical]: 4,
};
@Injectable()
export class WeatherRulesEngine {
  evaluate(points: WeatherPoint[], rules: EvaluatedRule[]): WeatherRuleEvaluation {
    const matches = rules
      .filter((rule) => points.some((point) => this.matches(point, rule.conditions)))
      .sort(
        (a, b) =>
          rank[b.suitability] - rank[a.suitability] ||
          b.priority - a.priority ||
          a.id.localeCompare(b.id),
      );
    const approved = matches.filter(
      (x) => x.validationStatus === RuleValidationStatus.ExpertApproved,
    );
    return {
      assessment: matches[0]?.suitability ?? null,
      productionAssessment: approved[0]?.suitability ?? null,
      matches: matches.map((x) => ({
        ...x,
        isExpertApproved: x.validationStatus === RuleValidationStatus.ExpertApproved,
        recommendationAllowed: x.validationStatus === RuleValidationStatus.ExpertApproved,
      })),
      recommendationAllowed: approved.length > 0,
      disclaimer: approved.length
        ? 'Only expert-approved rules contribute to production guidance.'
        : 'No expert-approved crop-weather rule matched. Demo results are illustrative and must not be used as agronomic recommendations.',
    };
  }
  private matches(
    point: WeatherPoint,
    c: { all?: WeatherCondition[]; any?: WeatherCondition[] },
  ): boolean {
    const test = (x: WeatherCondition): boolean => {
      const actual = point[x.variable];
      if (typeof actual !== 'number') return false;
      switch (x.operator) {
        case 'gt':
          return actual > x.value;
        case 'gte':
          return actual >= x.value;
        case 'lt':
          return actual < x.value;
        case 'lte':
          return actual <= x.value;
        case 'eq':
          return actual === x.value;
      }
    };
    return (c.all?.length ? c.all.every(test) : true) && (c.any?.length ? c.any.some(test) : true);
  }
}

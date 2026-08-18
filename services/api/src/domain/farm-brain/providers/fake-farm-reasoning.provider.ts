import { Injectable } from '@nestjs/common';
import { FarmHealthStatus } from '../farm-brain.enums';
import { FARM_BRAIN_SCHEMA_VERSION, type FarmReasoningProviderResult } from '../farm-brain.types';
import type { FarmReasoningProvider } from './farm-reasoning.provider';

@Injectable()
export class FakeFarmReasoningProvider implements FarmReasoningProvider {
  async investigate(): Promise<FarmReasoningProviderResult> {
    return Promise.resolve({
      result: {
        schemaVersion: FARM_BRAIN_SCHEMA_VERSION,
        healthStatus: FarmHealthStatus.Unknown,
        riskScore: 0,
        findings: [],
        hypotheses: [],
        evidence: [],
        missingEvidence: ['Development provider has no model-backed assessment.'],
        recommendedActions: [],
        requiresHumanReview: false,
      },
      provider: 'DEVELOPMENT_FAKE',
      modelId: 'farm-brain-fake',
      modelVersion: 'v1',
      inputTokens: null,
      outputTokens: null,
      latencyMs: 0,
      rawResponse: { developmentOnly: true },
    });
  }
}

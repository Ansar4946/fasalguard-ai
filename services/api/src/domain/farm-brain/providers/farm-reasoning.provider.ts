import type {
  FarmBrainInput,
  FarmBrainResult,
  FarmReasoningProviderResult,
} from '../farm-brain.types';

export const FARM_REASONING_PROVIDER = Symbol('FARM_REASONING_PROVIDER');

export interface FarmReasoningProvider {
  investigate(input: FarmBrainInput): Promise<FarmReasoningProviderResult>;
}

export type FarmBrainOutputCandidate = FarmBrainResult;

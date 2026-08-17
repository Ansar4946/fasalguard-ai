import type { AllowedQuestion } from '../question-library';
export const LLM_PROVIDER = Symbol('LLM_PROVIDER');
export interface LlmResult<T> {
  output: T;
  modelId: string;
  modelVersion: string;
  inferenceTimestamp: string;
  rawProviderResponse: Record<string, unknown>;
}
export interface QuestionSelection {
  questionIds: string[];
}
export interface AnswerSummary {
  summary: string;
  uncertainties: string[];
}
export interface FarmerExplanation {
  resultSummary: string;
  uncertainty: string;
  whyTheseQuestions: string;
  nextStep: string;
  safetyNotice: string;
}
export interface AssistantResponse {
  answer: string;
  safetyNotice: string;
}
export interface LlmProvider {
  selectQuestions(input: {
    context: Record<string, unknown>;
    allowedQuestions: readonly AllowedQuestion[];
  }): Promise<LlmResult<QuestionSelection>>;
  summarizeAnswers(input: {
    answers: Array<{ question: string; answer: string }>;
  }): Promise<LlmResult<AnswerSummary>>;
  explainResult(input: {
    visionResult: Record<string, unknown>;
    answerSummary?: AnswerSummary;
    context: Record<string, unknown>;
  }): Promise<LlmResult<FarmerExplanation>>;
  translateApprovedInformation(input: {
    approvedText: string;
    targetLanguage: string;
  }): Promise<LlmResult<{ translation: string }>>;
  respondToContext(input: {
    farmerMessage: string;
    approvedContext: Record<string, unknown>;
  }): Promise<LlmResult<AssistantResponse>>;
}

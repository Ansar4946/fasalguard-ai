import { BadGatewayException } from '@nestjs/common';
import type {
  AnswerSummary,
  AssistantResponse,
  FarmerExplanation,
  QuestionSelection,
} from './llm.provider';
function record(value: unknown): Record<string, unknown> {
  if (!value || typeof value !== 'object' || Array.isArray(value)) throw malformed();
  return value as Record<string, unknown>;
}
function exact(o: Record<string, unknown>, keys: string[]): void {
  if (Object.keys(o).some((k) => !keys.includes(k))) throw malformed();
}
function text(o: Record<string, unknown>, key: string, max = 3000): string {
  const v = o[key];
  if (typeof v !== 'string' || !v.trim() || v.length > max) throw malformed();
  return v.trim();
}
function strings(o: Record<string, unknown>, key: string, max = 8): string[] {
  const v = o[key];
  if (
    !Array.isArray(v) ||
    v.length > max ||
    v.some((x) => typeof x !== 'string' || !x.trim() || x.length > 500)
  )
    throw malformed();
  return v.map((x) => (x as string).trim());
}
function malformed(): BadGatewayException {
  return new BadGatewayException({
    code: 'MALFORMED_LLM_RESPONSE',
    message: 'The language model returned an invalid structured response.',
  });
}
export function parseQuestionSelection(value: unknown, allowed: Set<string>): QuestionSelection {
  const o = record(value);
  exact(o, ['questionIds']);
  const ids = strings(o, 'questionIds', 5);
  if (new Set(ids).size !== ids.length || ids.some((x) => !allowed.has(x))) throw malformed();
  return { questionIds: ids };
}
export function parseAnswerSummary(value: unknown): AnswerSummary {
  const o = record(value);
  exact(o, ['summary', 'uncertainties']);
  return { summary: text(o, 'summary'), uncertainties: strings(o, 'uncertainties') };
}
export function parseExplanation(value: unknown): FarmerExplanation {
  const o = record(value);
  exact(o, ['resultSummary', 'uncertainty', 'whyTheseQuestions', 'nextStep', 'safetyNotice']);
  return {
    resultSummary: text(o, 'resultSummary'),
    uncertainty: text(o, 'uncertainty'),
    whyTheseQuestions: text(o, 'whyTheseQuestions'),
    nextStep: text(o, 'nextStep'),
    safetyNotice: text(o, 'safetyNotice'),
  };
}
export function parseTranslation(value: unknown): { translation: string } {
  const o = record(value);
  exact(o, ['translation']);
  return { translation: text(o, 'translation', 10000) };
}
export function parseAssistant(value: unknown): AssistantResponse {
  const o = record(value);
  exact(o, ['answer', 'safetyNotice']);
  return { answer: text(o, 'answer'), safetyNotice: text(o, 'safetyNotice') };
}
export function rejectRestrictedClaims(value: unknown): void {
  const body = JSON.stringify(value).toLowerCase();
  const patterns = [
    /\b\d+(\.\d+)?\s*(ml|mg|g|kg|lit(er|re)s?|oz)\b/,
    /\b(mix|combine)\b.{0,40}\b(chemical|pesticide|fungicide|insecticide)\b/,
    /laborator(y|ies) confirmed/,
    /definitive diagnosis/,
  ];
  if (patterns.some((x) => x.test(body)))
    throw new BadGatewayException({
      code: 'UNSAFE_LLM_RESPONSE',
      message: 'The language model response violated treatment or certainty safeguards.',
    });
}

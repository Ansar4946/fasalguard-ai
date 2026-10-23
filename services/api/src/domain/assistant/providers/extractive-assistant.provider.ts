import { Injectable } from '@nestjs/common';
import { ABSTENTION } from '../grounding';
import type {
  AgricultureAssistantProvider,
  AssistantLanguage,
  AssistantProviderResult,
  RetrievedSource,
} from './agriculture-assistant.provider';

const LEAD_IN: Record<AssistantLanguage, string> = {
  en: 'From approved knowledge',
  ur: 'منظور شدہ معلومات کے مطابق',
  hi: 'स्वीकृत जानकारी के अनुसार',
};
const EXPERT_LINE = /expert|ماہر|विशेषज्ञ/iu;
const SENTENCE_END = /(?<=[.!?۔؟])\s+/u;

/** Maximum characters quoted from the top source. */
export const EXTRACT_CAP = 520;

/** Whole-line cleanup only: header and rule lines are dropped, quoted text is never rewritten. */
export function cleanSourceText(text: string): string {
  return text
    .split(/\r?\n/)
    .filter((l) => !/^\s*source\s*:/i.test(l) && !/^\s*([-*_=]\s*){3,}$/.test(l))
    .join(' ')
    .replace(/\s+/g, ' ')
    .trim();
}

export function sentencesOf(text: string): string[] {
  return cleanSourceText(text)
    .split(SENTENCE_END)
    .map((s) => s.trim())
    .filter(Boolean);
}

/** A verbatim contiguous trim at a clause or word boundary, never beyond `cap` characters. */
function trimToBoundary(s: string, cap: number): string {
  if (s.length <= cap) return s;
  const head = s.slice(0, cap);
  const cut = Math.max(head.lastIndexOf(', '), head.lastIndexOf('، '), head.lastIndexOf(': '));
  const at = cut > cap * 0.5 ? cut : head.lastIndexOf(' ');
  return (at > 0 ? head.slice(0, at) : head).trim();
}

/** Leading sentences of one source up to `cap`, plus its final expert-consultation line if present. */
export function excerptOf(text: string, cap: number): string {
  const sentences = sentencesOf(text);
  if (!sentences.length) return '';
  const last = sentences.length > 1 ? sentences[sentences.length - 1]! : '';
  const keepLast = last && EXPERT_LINE.test(last) ? last : '';
  const budget = cap - (keepLast ? keepLast.length + 1 : 0);
  const picked: string[] = [];
  let used = 0;
  for (const s of keepLast ? sentences.slice(0, -1) : sentences) {
    const cost = s.length + (picked.length ? 1 : 0);
    if (used + cost > budget) {
      if (!picked.length) picked.push(trimToBoundary(s, Math.max(budget, 80)));
      break;
    }
    picked.push(s);
    used += cost;
  }
  if (keepLast) picked.push(keepLast);
  return picked.join(' ');
}

/**
 * Model-free, key-free provider: the answer is quoted text from the top-ranked retrieved
 * approved sources, and the citations are exactly the sources quoted. No sources, no answer.
 */
@Injectable()
export class ExtractiveAssistantProvider implements AgricultureAssistantProvider {
  respond(
    input: Parameters<AgricultureAssistantProvider['respond']>[0],
  ): Promise<AssistantProviderResult> {
    const started = Date.now();
    const base = {
      proposals: [],
      provider: 'EXTRACTIVE',
      modelId: 'extractive-quote',
      modelVersion: '1',
      inputTokens: null,
      outputTokens: null,
    };
    const parts: string[] = [];
    const citations: string[] = [];
    // Only the top-ranked source is quoted: a weaker second hit is often another crop.
    const first: RetrievedSource | undefined = input.sources[0];
    if (first) {
      const quote = excerptOf(first.excerpt, EXTRACT_CAP);
      if (quote) {
        parts.push(`${LEAD_IN[input.language]} (${first.title}):\n${quote}`);
        citations.push(first.id);
      }
    }
    return Promise.resolve({
      ...base,
      answer: parts.length ? parts.join('\n\n') : ABSTENTION[input.language],
      citations,
      latencyMs: Date.now() - started,
    });
  }
}

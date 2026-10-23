import { ABSTENTION, citationsAreGrounded } from '../src/domain/assistant/grounding';
import {
  EXTRACT_CAP,
  ExtractiveAssistantProvider,
  cleanSourceText,
  excerptOf,
} from '../src/domain/assistant/providers/extractive-assistant.provider';
import type {
  AssistantLanguage,
  AssistantProviderResult,
  RetrievedSource,
} from '../src/domain/assistant/providers/agriculture-assistant.provider';

const EXPERT_EN =
  'Please consult an agriculture expert before making decisions about your own field.';
const EN =
  'Walk through your wheat field regularly and look at plants in several places, not only near the edge. If wheat leaves are turning yellow, note where it starts: in whole patches, on the older lower leaves, or only at the tips. Yellow leaves can come from many causes such as too much or too little water, poor nutrition, disease or insects, so do not guess the cause. Take clear photographs in daylight and write down what you see and when. Compare with a healthy part of the field and check whether the problem is spreading. ' +
  EXPERT_EN;
const UR =
  'اپنے گندم کے کھیت کا باقاعدگی سے چکر لگائیں۔ اگر گندم کے پتے پیلے ہو رہے ہوں تو دیکھیں کہ پیلاہٹ کہاں سے شروع ہوئی۔ اندازے سے وجہ طے نہ کریں۔ اپنے کھیت کے بارے میں کوئی بھی فیصلہ کرنے سے پہلے براہِ کرم زرعی ماہر سے مشورہ کریں۔';
const src = (id: string, title: string, excerpt: string, lang = 'en'): RetrievedSource => ({
  id,
  title,
  revision: 3,
  languageCode: lang,
  excerpt,
});
const norm = (s: string): string => s.replace(/\s+/g, ' ');
const run = (
  sources: RetrievedSource[],
  language: AssistantLanguage = 'en',
): Promise<AssistantProviderResult> =>
  new ExtractiveAssistantProvider().respond({
    message: 'q',
    language,
    context: {},
    sources,
    history: [],
    allowedActions: [],
  });

describe('ExtractiveAssistantProvider', () => {
  it('quotes the English source, cites exactly it, keeps the DEMO title and the expert line', async () => {
    const s = [src('a1', 'DEMO - not expert-reviewed: Wheat scouting', EN)];
    const r = await run(s);
    expect(r.citations).toEqual(['a1']);
    expect(citationsAreGrounded(r.citations, s)).toBe(true);
    expect(r.answer.startsWith('From approved knowledge (DEMO - not expert-reviewed:')).toBe(true);
    expect(r.answer).toContain('If wheat leaves are turning yellow');
    expect(r.answer.endsWith(EXPERT_EN)).toBe(true);
    expect(r.provider).toBe('EXTRACTIVE');
    expect(r.modelId).toBe('extractive-quote');
    expect(r.proposals).toEqual([]);
  });

  it('quotes an Urdu source with the Urdu lead-in', async () => {
    const s = [src('u1', 'DEMO - not expert-reviewed: گندم', UR, 'ur')];
    const r = await run(s, 'ur');
    expect(r.answer.startsWith('منظور شدہ معلومات کے مطابق (DEMO')).toBe(true);
    expect(r.answer).toContain('زرعی ماہر سے مشورہ کریں۔');
    expect(r.citations).toEqual(['u1']);
  });

  it('abstains with the fixed text and no citations when there are no sources', async () => {
    for (const l of ['en', 'ur', 'hi'] as const) {
      const r = await run([], l);
      expect(r.answer).toBe(ABSTENTION[l]);
      expect(r.citations).toEqual([]);
    }
  });

  it('caps the excerpt and trims at a sentence boundary, keeping only source text', () => {
    const e = excerptOf(EN, EXTRACT_CAP);
    expect(e.length).toBeLessThanOrEqual(EXTRACT_CAP);
    expect(e.startsWith('Walk through')).toBe(true);
    expect(norm(EN)).toContain(e.split(EXPERT_EN)[0]!.trim());
    const long = 'word '.repeat(400).trim() + '.';
    const t = excerptOf(long, EXTRACT_CAP);
    expect(t.length).toBeLessThanOrEqual(EXTRACT_CAP);
    expect(long.startsWith(t)).toBe(true);
  });

  it('quotes and cites only the top-ranked source, and every sentence exists in it', async () => {
    const s = [src('a1', 'T1', EN), src('a2', 'T2', 'Second first sentence. Second other.')];
    const r = await run(s);
    expect(r.citations).toEqual(['a1']);
    expect(r.answer).not.toContain('Second');
    const body = r.answer.split(':\n').slice(1).join(':\n');
    for (const sentence of body.split(/(?<=\.)\s+/)) expect(norm(EN)).toContain(sentence);
  });

  it('strips the Source header line but keeps the DEMO label in the title lead-in', async () => {
    const raw =
      'Source: DEMO - not expert-reviewed\n---\nKeep records of irrigation.\nPlease consult an agriculture expert today.';
    expect(cleanSourceText(raw)).toBe(
      'Keep records of irrigation. Please consult an agriculture expert today.',
    );
    const r = await run([src('a1', 'DEMO - not expert-reviewed: Irrigation', raw)]);
    expect(r.answer).not.toContain('Source:');
    expect(r.answer).toContain('DEMO - not expert-reviewed');
    expect(r.answer).toContain('Keep records of irrigation.');
  });
});

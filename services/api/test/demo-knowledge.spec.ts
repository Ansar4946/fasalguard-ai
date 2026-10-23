import { join } from 'node:path';
import {
  BANNED_WORDS,
  CROPS,
  DEMO_LABEL,
  LANGUAGES,
  loadDemoKnowledge,
  storedContent,
  validateDemoKnowledge,
  type DemoKnowledgeFile,
} from '../src/domain/assistant/demo-knowledge-seed';

const file = loadDemoKnowledge(
  join(__dirname, '..', 'src', 'domain', 'assistant', 'seed', 'demo-knowledge.json'),
);

describe('demo knowledge content file', () => {
  it('passes the full validator with no problems', () => {
    expect(validateDemoKnowledge(file)).toEqual([]);
  });

  it('has 10-12 articles per language-pair set: 4 per crop in both Urdu and English', () => {
    expect(file.articles.length).toBeGreaterThanOrEqual(20);
    expect(file.articles.length).toBeLessThanOrEqual(24);
    for (const crop of CROPS)
      for (const language of LANGUAGES) {
        const n = file.articles.filter((a) => a.crop === crop && a.language === language).length;
        expect(n).toBeGreaterThanOrEqual(3);
      }
    const keys = new Set(file.articles.map((a) => a.key));
    expect(keys.size).toBeGreaterThanOrEqual(10);
    expect(keys.size).toBeLessThanOrEqual(12);
    for (const key of keys)
      expect(
        file.articles
          .filter((a) => a.key === key)
          .map((a) => a.language)
          .sort(),
      ).toEqual(['en', 'ur']);
  });

  it('labels every title and the stored source as DEMO - not expert-reviewed', () => {
    for (const a of file.articles) {
      expect(a.title.startsWith(DEMO_LABEL)).toBe(true);
      expect(storedContent(file, a)).toContain(DEMO_LABEL);
    }
  });

  it('every article ends with a consult-an-expert line', () => {
    for (const a of file.articles.filter((x) => x.language === 'en'))
      expect(a.content.trim()).toMatch(/consult an agriculture expert[^.]*\.$/i);
    for (const a of file.articles.filter((x) => x.language === 'ur'))
      expect(a.content.trim()).toMatch(/زرعی ماہر سے مشورہ کریں۔$/);
  });

  it('contains no digits, units, percent signs or dose-like phrases', () => {
    for (const a of file.articles) {
      const text = `${a.title} ${a.content}`;
      expect(text).not.toMatch(/[0-9٠-٩۰-۹]/);
      expect(text).not.toMatch(/[%٪]/);
      expect(text).not.toMatch(/\b(mg|ml|kg|litres?|liters?|grams?)\b/i);
      expect(text).not.toMatch(/\bper\s+acre\b/i);
      expect(text).not.toMatch(/فی ایکڑ|کلو|ملی لیٹر|گرام|فیصد/);
    }
  });

  it('contains none of the banned chemical, brand or dose words', () => {
    expect(BANNED_WORDS.length).toBeGreaterThan(20);
    for (const a of file.articles) {
      const text = `${a.title} ${a.content}`.toLowerCase();
      for (const word of BANNED_WORDS)
        if (/^[a-z]+$/.test(word)) expect(text).not.toMatch(new RegExp(`\\b${word}\\b`));
        else expect(text).not.toContain(word);
    }
  });

  it('Urdu rows are real Urdu script, not transliteration', () => {
    for (const a of file.articles.filter((x) => x.language === 'ur')) {
      const letters = a.content.replace(/[^\p{L}]/gu, '');
      const arabic = letters.replace(/[^؀-ۿ]/g, '');
      expect(arabic.length / letters.length).toBeGreaterThan(0.95);
    }
  });

  it('the validator rejects unlabelled, dosed and branded content', () => {
    const base = file.articles.find((a) => a.language === 'en')!;
    const bad = (patch: Partial<typeof base>): DemoKnowledgeFile => ({
      ...file,
      articles: [{ ...base, ...patch }],
    });
    expect(validateDemoKnowledge(bad({ title: 'Wheat tips' })).join()).toMatch(/DEMO label/);
    expect(
      validateDemoKnowledge(
        bad({
          content: `${base.content.slice(0, -10)} Use 50 ml per acre. Please consult an agriculture expert.`,
        }),
      ).length,
    ).toBeGreaterThan(0);
    expect(
      validateDemoKnowledge(
        bad({ content: base.content.replace('Please consult', 'Use urea. Please consult') }),
      ).join(),
    ).toMatch(/banned word "urea"/);
    expect(
      validateDemoKnowledge(bad({ content: `${base.content} And more words.` })).join(),
    ).toMatch(/consult-an-expert/);
  });
});

/* eslint-disable @typescript-eslint/no-unsafe-member-access, @typescript-eslint/no-unsafe-assignment */
/* Demo knowledge seed for the grounded assistant. Content: seed/demo-knowledge.json (see seed/README.md).
 * Every row is labelled DEMO and is NOT expert-reviewed. Idempotent: rows are matched by (title, language). */
import { readFileSync } from 'node:fs';
import type { DataSource } from 'typeorm';

export const DEMO_LABEL = 'DEMO - not expert-reviewed';
export const SEED_AUTHOR_EMAIL = 'demo-knowledge-seed@fasalguard.invalid';
export const CROPS = ['WHEAT', 'COTTON', 'RICE'] as const;
export const LANGUAGES = ['en', 'ur'] as const;

export interface DemoArticle {
  key: string;
  crop: (typeof CROPS)[number];
  language: (typeof LANGUAGES)[number];
  title: string;
  content: string;
}
export interface DemoKnowledgeFile {
  label: string;
  source: string;
  articles: DemoArticle[];
}

/** Words that must never appear in demo content (no chemicals, brands or dose language). */
export const BANNED_WORDS = [
  'urea',
  'dap',
  'npk',
  'potash',
  'glyphosate',
  'imidacloprid',
  'chlorpyrifos',
  'cypermethrin',
  'pesticide',
  'insecticide',
  'fungicide',
  'herbicide',
  'weedicide',
  'spray',
  'dose',
  'dosage',
  'brand',
  'acre',
  'hectare',
  'kg',
  'mg',
  'ml',
  'litre',
  'liter',
  'gram',
  'percent',
  'سپرے',
  'کیڑے مار',
  'یوریا',
  'ڈی اے پی',
  'ایکڑ',
  'ہیکٹر',
  'کلو',
  'ملی',
  'گرام',
  'لیٹر',
  'فیصد',
];
/** Dose-like patterns: any digit (ASCII, Arabic-Indic, Persian), percent signs, and number+unit forms. */
export const DOSE_PATTERNS: RegExp[] = [
  /[0-9٠-٩۰-۹]/,
  /[%٪]/,
  /\b(mg|ml|kg|g|l|ltr|litres?|liters?|grams?)\b/i,
  /\bper\s+(acre|hectare|ha|litre|liter)\b/i,
];
export const CONSULT_EN = /consult an agriculture expert[^.]*\.$/i;
export const CONSULT_UR = /زرعی ماہر سے مشورہ کریں۔$/;

export function loadDemoKnowledge(path: string): DemoKnowledgeFile {
  return JSON.parse(readFileSync(path, 'utf8')) as DemoKnowledgeFile;
}

/** Returns a list of human-readable problems; empty means the file is safe to seed. */
export function validateDemoKnowledge(file: DemoKnowledgeFile): string[] {
  const problems: string[] = [];
  if (file.label !== DEMO_LABEL) problems.push('file label must be the DEMO label');
  if (!file.source.includes(DEMO_LABEL)) problems.push('file source must carry the DEMO label');
  const seen = new Set<string>();
  for (const a of file.articles) {
    const id = `${a.key}/${a.language}`;
    if (seen.has(id)) problems.push(`${id}: duplicate`);
    seen.add(id);
    if (!(CROPS as readonly string[]).includes(a.crop)) problems.push(`${id}: bad crop`);
    if (!(LANGUAGES as readonly string[]).includes(a.language))
      problems.push(`${id}: bad language`);
    if (!a.title.startsWith(DEMO_LABEL))
      problems.push(`${id}: title must start with the DEMO label`);
    if (a.title.length > 200) problems.push(`${id}: title too long`);
    if (a.content.length < 200 || a.content.length > 1400) problems.push(`${id}: content length`);
    const consult = a.language === 'en' ? CONSULT_EN : CONSULT_UR;
    if (!consult.test(a.content.trim()))
      problems.push(`${id}: must end with the consult-an-expert line`);
    const text = `${a.title}\n${a.content}`;
    for (const pattern of DOSE_PATTERNS)
      if (pattern.test(text)) problems.push(`${id}: dose-like pattern ${String(pattern)}`);
    const lower = text.toLowerCase();
    for (const word of BANNED_WORDS) {
      const found = /^[a-z]+$/.test(word)
        ? new RegExp(`(^|[^a-z])${word}($|[^a-z])`).test(lower)
        : lower.includes(word);
      if (found) problems.push(`${id}: banned word "${word}"`);
    }
    if (a.language === 'ur' && !/[؀-ۿ]/.test(a.content))
      problems.push(`${id}: Urdu row without Urdu script`);
  }
  return problems;
}

/** Text stored in knowledge_articles.content: a source line (with the DEMO label) then the body. */
export function storedContent(file: DemoKnowledgeFile, article: DemoArticle): string {
  return `Source: ${file.source}\n\n${article.content}`;
}

export interface SeedResult {
  inserted: number;
  updated: number;
  unchanged: number;
  total: number;
}

export async function seedDemoKnowledge(
  db: DataSource,
  file: DemoKnowledgeFile,
): Promise<SeedResult> {
  const problems = validateDemoKnowledge(file);
  if (problems.length) throw new Error(`Demo knowledge file is invalid:\n${problems.join('\n')}`);
  const result: SeedResult = { inserted: 0, updated: 0, unchanged: 0, total: file.articles.length };
  await db.transaction(async (m) => {
    // Serialises concurrent seed runs so no duplicate rows can appear.
    await m.query(`SELECT pg_advisory_xact_lock(hashtext('seed:demo-knowledge'))`);
    // The author must be a real user (FK). A dedicated, suspended, passwordless system user is used.
    const found = await m.query(`SELECT id FROM users WHERE email=$1`, [SEED_AUTHOR_EMAIL]);
    const created = found.length
      ? found
      : await m.query(
          `INSERT INTO users(email,role,status) VALUES($1,'AGRICULTURE_EXPERT','suspended') RETURNING id`,
          [SEED_AUTHOR_EMAIL],
        );
    const authorId = created[0]?.id;
    if (!authorId) throw new Error('Could not resolve the demo seed author user.');
    for (const a of file.articles) {
      const content = storedContent(file, a);
      const existing = await m.query(
        `SELECT id, content, status FROM knowledge_articles WHERE title=$1 AND language_code=$2 ORDER BY created_at LIMIT 1`,
        [a.title, a.language],
      );
      const row = existing[0];
      if (!row) {
        await m.query(
          `INSERT INTO knowledge_articles(title,content,language_code,status,author_id) VALUES($1,$2,$3,'APPROVED',$4)`,
          [a.title, content, a.language, authorId],
        );
        result.inserted += 1;
      } else if (row.content !== content || row.status !== 'APPROVED') {
        await m.query(
          `UPDATE knowledge_articles SET content=$2,status='APPROVED',updated_at=now(),version=version+1 WHERE id=$1`,
          [row.id, content],
        );
        result.updated += 1;
      } else result.unchanged += 1;
    }
  });
  return result;
}

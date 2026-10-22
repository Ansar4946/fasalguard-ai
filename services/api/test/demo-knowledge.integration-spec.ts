/* eslint-disable @typescript-eslint/no-unsafe-member-access, @typescript-eslint/no-unsafe-assignment, @typescript-eslint/explicit-function-return-type */
/* Needs a disposable database named qa11_test with ALL migrations applied (container qa11-pg, port 55451).
 * Proves: the demo seed is idempotent, rows are APPROVED, and the real full-text retrieval returns
 * the DEMO articles (with id, title, revision = citation material) for Urdu and English questions
 * while an unrelated question abstains (returns nothing). Content is DEMO and not expert-reviewed. */
import 'reflect-metadata';
import { join } from 'node:path';
import { DataSource } from 'typeorm';
import { KnowledgeRetrievalService } from '../src/domain/assistant/knowledge-retrieval.service';
import {
  DEMO_LABEL,
  loadDemoKnowledge,
  seedDemoKnowledge,
} from '../src/domain/assistant/demo-knowledge-seed';

const url = process.env.QA11_TEST_DATABASE_URL;
if (url && new URL(url).pathname.slice(1) !== 'qa11_test')
  throw new Error('Demo knowledge integration requires the disposable qa11_test database.');
const integration = url ? describe : describe.skip;

integration('demo knowledge seed on PostgreSQL', () => {
  let db: DataSource;
  let retrieval: KnowledgeRetrievalService;
  const file = loadDemoKnowledge(
    join(__dirname, '..', 'src', 'domain', 'assistant', 'seed', 'demo-knowledge.json'),
  );
  const count = async () =>
    Number(
      (
        await db.query(
          `SELECT count(*)::int AS n FROM knowledge_articles WHERE title LIKE $1 AND status='APPROVED'`,
          [`${DEMO_LABEL}%`],
        )
      )[0]!.n,
    );

  beforeAll(async () => {
    db = new DataSource({ type: 'postgres', url, connectTimeoutMS: 5000 });
    await db.initialize();
    retrieval = new KnowledgeRetrievalService(db);
  });
  afterAll(async () => {
    await db?.destroy();
  });

  it('inserts every article once, then a second and third run change nothing', async () => {
    const first = await seedDemoKnowledge(db, file);
    expect(first).toEqual({
      inserted: file.articles.length,
      updated: 0,
      unchanged: 0,
      total: file.articles.length,
    });
    expect(await count()).toBe(file.articles.length);
    const second = await seedDemoKnowledge(db, file);
    expect(second).toEqual({
      inserted: 0,
      updated: 0,
      unchanged: file.articles.length,
      total: file.articles.length,
    });
    await seedDemoKnowledge(db, file);
    expect(await count()).toBe(file.articles.length);
    const authors = await db.query(
      `SELECT count(*)::int AS n FROM users WHERE email='demo-knowledge-seed@fasalguard.invalid'`,
    );
    expect(authors[0]!.n).toBe(1);
  });

  it('re-approves a row that was retired and restores edited content, without duplicating', async () => {
    await db.query(
      `UPDATE knowledge_articles SET status='RETIRED' WHERE title=$1 AND language_code='en'`,
      [file.articles.find((a) => a.language === 'en')!.title],
    );
    const result = await seedDemoKnowledge(db, file);
    expect(result.updated).toBe(1);
    expect(await count()).toBe(file.articles.length);
  });

  it('retrieves the wheat yellow-leaves article for an Urdu question, with citation fields', async () => {
    const sources = await retrieval.retrieve('میری گندم کے پتے پیلے کیوں ہو رہے ہیں؟', 'ur', 3);
    expect(sources.length).toBeGreaterThan(0);
    for (const s of sources) {
      expect(s.id).toMatch(/^[0-9a-f-]{36}$/);
      expect(s.revision).toBeGreaterThanOrEqual(1);
      expect(s.title.startsWith(DEMO_LABEL)).toBe(true);
      expect(s.languageCode).toBe('ur');
    }
    expect(sources[0]!.title).toContain('گندم');
    expect(sources[0]!.excerpt).toContain(DEMO_LABEL);
  });

  it('retrieves the wheat yellow-leaves article for an English question, with citation fields', async () => {
    const sources = await retrieval.retrieve('Why are my wheat leaves turning yellow?', 'en', 3);
    expect(sources.length).toBeGreaterThan(0);
    expect(sources[0]!.title).toBe(
      file.articles.find((a) => a.key === 'wheat-scouting' && a.language === 'en')!.title,
    );
    expect(sources[0]!.languageCode).toBe('en');
    expect(sources[0]!.excerpt).toContain('consult an agriculture expert');
  });

  it('covers the other crops too', async () => {
    const cotton = await retrieval.retrieve('cotton bolls irrigation water stress', 'en', 3);
    expect(cotton[0]!.title).toContain('Cotton');
    const rice = await retrieval.retrieve('دھان کی پنیری', 'ur', 3);
    expect(rice[0]!.title).toContain('دھان');
  });

  it('abstains (returns nothing) for unrelated questions in both languages', async () => {
    expect(await retrieval.retrieve('bitcoin blockchain ethereum', 'en', 3)).toEqual([]);
    expect(await retrieval.retrieve('کرکٹ میچ ٹکٹ', 'ur', 3)).toEqual([]);
  });

  it('never returns a demo article in a language it was not written in', async () => {
    const wrong = await retrieval.retrieve('wheat leaves turning yellow', 'ur', 3);
    expect(wrong).toEqual([]);
  });
});

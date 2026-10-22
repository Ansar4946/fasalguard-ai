/* Needs a disposable database named qa12_test with ALL migrations applied (container qa12-pg, port 55452).
 * Proves off-topic questions retrieve NO sources (so the assistant abstains without calling a model, and the
 * fake provider also abstains) while real agronomy questions still return the right DEMO articles. */
import 'reflect-metadata';
import { join } from 'node:path';
import { DataSource } from 'typeorm';
import { KnowledgeRetrievalService } from '../src/domain/assistant/knowledge-retrieval.service';
import { loadDemoKnowledge, seedDemoKnowledge } from '../src/domain/assistant/demo-knowledge-seed';
import { FakeAssistantProvider } from '../src/domain/assistant/providers/fake-assistant.provider';
import { citationsAreGrounded } from '../src/domain/assistant/grounding';

const url = process.env.QA12_TEST_DATABASE_URL;
if (url && new URL(url).pathname.slice(1) !== 'qa12_test')
  throw new Error('Retrieval abstention integration requires the disposable qa12_test database.');
const integration = url ? describe : describe.skip;

integration('retrieval abstention on the demo knowledge', () => {
  let db: DataSource;
  let retrieval: KnowledgeRetrievalService;
  const file = loadDemoKnowledge(
    join(__dirname, '..', 'src', 'domain', 'assistant', 'seed', 'demo-knowledge.json'),
  );
  const title = (key: string, lang: string): string =>
    file.articles.find((a) => a.key === key && a.language === lang)!.title;

  beforeAll(async () => {
    db = new DataSource({ type: 'postgres', url, connectTimeoutMS: 5000 });
    await db.initialize();
    await seedDemoKnowledge(db, file);
    retrieval = new KnowledgeRetrievalService(db);
  });
  afterAll(async () => {
    await db?.destroy();
  });

  it('returns the wheat yellow-leaves article first for the English wheat question', async () => {
    const s = await retrieval.retrieve('Why are my wheat leaves turning yellow?', 'en', 3);
    expect(s.length).toBeGreaterThan(0);
    expect(s[0]!.title).toBe(title('wheat-scouting', 'en'));
    expect(s.every((x) => x.languageCode === 'en')).toBe(true);
  });

  it.each([
    ['میری گندم کے پتے پیلے کیوں ہو رہے ہیں؟', 'گندم'],
    ['کپاس کی فصل کو پانی کب دینا چاہیے؟', 'کپاس'],
    ['دھان کی پنیری کیسے تیار کریں؟', 'دھان'],
  ])('returns the matching Urdu article for %s', async (q, crop) => {
    const s = await retrieval.retrieve(q, 'ur', 3);
    expect(s.length).toBeGreaterThan(0);
    expect(s[0]!.title).toContain(crop);
    expect(s.every((x) => x.languageCode === 'ur')).toBe(true);
  });

  it('still answers short real questions', async () => {
    expect((await retrieval.retrieve('cotton irrigation', 'en', 3))[0]!.title).toContain('Cotton');
    expect((await retrieval.retrieve('rice nursery', 'en', 3))[0]!.title).toContain('Rice');
    expect(
      (await retrieval.retrieve('When should I irrigate wheat?', 'en', 3))[0]!.title,
    ).toContain('Wheat');
  });

  it.each([
    ['what is the capital of France', 'en'],
    ['tell me a joke', 'en'],
    ['who won the match yesterday', 'en'],
    ['what is the', 'en'],
    ['فرانس کا دارالحکومت کیا ہے؟', 'ur'],
    ['کل میچ کون جیتا؟', 'ur'],
    ['مجھے ایک لطیفہ سنائیں', 'ur'],
  ] as const)('returns no sources for off-topic %s', async (q, lang) => {
    expect(await retrieval.retrieve(q, lang, 3)).toEqual([]);
  });

  it('abstains with the fake provider: it never produces a grounded citation', async () => {
    const fake = await new FakeAssistantProvider().respond({} as never);
    expect(citationsAreGrounded(fake.citations, [])).toBe(false);
    const s = await retrieval.retrieve('Why are my wheat leaves turning yellow?', 'en', 3);
    expect(citationsAreGrounded(fake.citations, s)).toBe(false);
  });
});

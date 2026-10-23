/* eslint-disable @typescript-eslint/explicit-function-return-type, @typescript-eslint/no-explicit-any */
/* Needs a disposable database named qa13_test with ALL migrations applied (container qa13-pg, port 55453).
 * Proves, through AssistantService with the real retrieval and the extractive provider (no model, no key):
 * cited English and Urdu answers quoting the DEMO articles, and abstention for an off-topic question. */
import 'reflect-metadata';
import { join } from 'node:path';
import { randomUUID } from 'node:crypto';
import { DataSource } from 'typeorm';
import { AssistantService } from '../src/domain/assistant/assistant.service';
import { ExtractiveAssistantProvider } from '../src/domain/assistant/providers/extractive-assistant.provider';
import { ABSTENTION } from '../src/domain/assistant/grounding';
import { loadDemoKnowledge, seedDemoKnowledge } from '../src/domain/assistant/demo-knowledge-seed';
import type { MediaService } from '../src/domain/media/media.service';
import { MetricsService } from '../src/observability/metrics.service';

const url = process.env.QA13_TEST_DATABASE_URL;
if (url && new URL(url).pathname.slice(1) !== 'qa13_test')
  throw new Error('Extractive integration requires the disposable qa13_test database.');
const integration = url ? describe : describe.skip;

integration('extractive assistant on the demo knowledge', () => {
  let db: DataSource;
  let service: AssistantService;
  const user = randomUUID();
  const file = loadDemoKnowledge(
    join(__dirname, '..', 'src', 'domain', 'assistant', 'seed', 'demo-knowledge.json'),
  );
  const article = (key: string, lang: string) =>
    file.articles.find((a) => a.key === key && a.language === lang)!;
  const ask = async (message: string, language: string) => {
    const conv = (await service.create(user, {})) as { id: string };
    return (await service.message(user, conv.id, { message, language })) as Record<string, any>;
  };

  beforeAll(async () => {
    db = new DataSource({ type: 'postgres', url, connectTimeoutMS: 5000 });
    await db.initialize();
    await seedDemoKnowledge(db, file);
    await db.query(
      `INSERT INTO users(id,email,role,status,is_test_account) VALUES($1,$2,'FARMER','active',true)`,
      [user, `${user}@qa13.test`],
    );
    await db.query(
      `INSERT INTO farmer_profiles(id,user_id,full_name,preferred_language,referral_code) VALUES($1,$2,'QA13 Farmer','en',$3)`,
      [randomUUID(), user, `Q13${user.slice(0, 6)}`],
    );
    service = new AssistantService(
      db,
      new ExtractiveAssistantProvider(),
      {} as never,
      {} as never,
      {} as unknown as MediaService,
      new MetricsService(),
    );
  });
  afterAll(async () => {
    await db?.destroy();
  });

  it('answers the English wheat yellow-leaves question with a cited quote of the DEMO article', async () => {
    const a = article('wheat-scouting', 'en');
    const r = await ask('Why are my wheat leaves turning yellow?', 'en');
    const text = JSON.stringify(r);
    console.log('EN RESPONSE:', text);
    expect(text).toContain('GROUNDED');
    expect(text).toContain(a.title);
    expect(text).toContain('If wheat leaves are turning yellow');
    expect(text).toContain('Please consult an agriculture expert');
  });

  it('answers an Urdu question with a cited Urdu quote', async () => {
    const a = article('wheat-scouting', 'ur');
    const r = await ask('میرے گندم کے پتے پیلے کیوں ہو رہے ہیں؟', 'ur');
    const text = JSON.stringify(r);
    console.log('UR RESPONSE:', text);
    expect(text).toContain('GROUNDED');
    expect(text).toContain(a.title);
    expect(text).toContain('منظور شدہ معلومات کے مطابق');
    expect(text).toContain('زرعی ماہر سے مشورہ کریں');
  });

  it('abstains for an off-topic question', async () => {
    const r = await ask('What is the capital of France?', 'en');
    const text = JSON.stringify(r);
    expect(text).toContain('ABSTAINED');
    expect(text).toContain(ABSTENTION.en);
  });
});

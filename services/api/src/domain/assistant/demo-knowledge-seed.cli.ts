/* npm run seed:demo-knowledge (ts-node) or `node dist/domain/assistant/demo-knowledge-seed.cli.js`.
 * Requires DATABASE_URL and all migrations. Idempotent. DEMO_KNOWLEDGE_FILE overrides the JSON path.
 * Inserts DEMO - not expert-reviewed articles as APPROVED so retrieval can cite them. */
import 'reflect-metadata';
import { config as loadEnvironment } from 'dotenv';
import { existsSync } from 'node:fs';
import { join } from 'node:path';
import { DataSource } from 'typeorm';
import { loadDemoKnowledge, seedDemoKnowledge } from './demo-knowledge-seed';

loadEnvironment();

function resolveFile(): string {
  if (process.env.DEMO_KNOWLEDGE_FILE) return process.env.DEMO_KNOWLEDGE_FILE;
  const beside = join(__dirname, 'seed', 'demo-knowledge.json');
  // The compiled dist may not contain the JSON asset; fall back to the source tree.
  const source = join(process.cwd(), 'src', 'domain', 'assistant', 'seed', 'demo-knowledge.json');
  return existsSync(beside) ? beside : source;
}

async function main(): Promise<void> {
  if (!process.env.DATABASE_URL) {
    console.error('DATABASE_URL is required.');
    process.exitCode = 2;
    return;
  }
  const db = new DataSource({
    type: 'postgres',
    url: process.env.DATABASE_URL,
    ssl: process.env.DATABASE_SSL === 'true' ? { rejectUnauthorized: true } : false,
    applicationName: 'fasalguard-demo-knowledge-seed',
  });
  await db.initialize();
  try {
    const file = resolveFile();
    const result = await seedDemoKnowledge(db, loadDemoKnowledge(file));
    console.log(JSON.stringify({ file, ...result }, null, 2));
  } finally {
    await db.destroy();
  }
}
void main().catch((error: unknown) => {
  console.error(error instanceof Error ? error.message : error);
  process.exitCode = 1;
});

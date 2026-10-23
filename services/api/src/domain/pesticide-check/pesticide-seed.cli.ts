/* Dawai Check seed: npm run seed:pesticide (ts-node) or `node dist/domain/pesticide-check/pesticide-seed.cli.js`.
 * Requires DATABASE_URL and migration 1755000047000. Idempotent (upsert by normalised name).
 * PESTICIDE_SEED_DIR overrides the CSV directory (default: the seed/ folder next to this file). */
import 'reflect-metadata';
import { config as loadEnvironment } from 'dotenv';
import { join } from 'node:path';
import { DataSource } from 'typeorm';
import { seedPesticideData } from './pesticide-seed';

loadEnvironment();

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
    applicationName: 'fasalguard-pesticide-seed',
  });
  await db.initialize();
  try {
    const dir = process.env.PESTICIDE_SEED_DIR ?? join(__dirname, 'seed');
    const result = await seedPesticideData(db, dir);
    console.log(JSON.stringify({ dir, ...result }, null, 2));
  } finally {
    await db.destroy();
  }
}
void main().catch((error: unknown) => {
  console.error(error instanceof Error ? error.message : error);
  process.exitCode = 1;
});

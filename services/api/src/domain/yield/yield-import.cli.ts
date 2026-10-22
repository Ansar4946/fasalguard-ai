/* F13 CSV import command: npm run yield:import -- <file.csv> --created-by "<name>"
 * Requires DATABASE_URL (see data-source.ts). Validates strictly and imports all-or-nothing. */
import { readFileSync } from 'node:fs';
import dataSource from '../../infrastructure/database/data-source';
import { YieldImportService } from './yield-import.service';

async function main(): Promise<void> {
  const args = process.argv.slice(2);
  const i = args.indexOf('--created-by');
  const createdBy = i >= 0 ? args[i + 1] : undefined;
  const file = args.find((a, idx) => !a.startsWith('--') && idx !== i + 1);
  if (!file || !createdBy) {
    console.error('Usage: yield:import <file.csv> --created-by "<importer name>"');
    process.exitCode = 2;
    return;
  }
  await dataSource.initialize();
  try {
    const result = await new YieldImportService(dataSource).importCsv(
      readFileSync(file, 'utf8'),
      createdBy,
    );
    console.log(JSON.stringify(result, null, 2));
    if (!result.ok) process.exitCode = 1;
  } finally {
    await dataSource.destroy();
  }
}
void main();

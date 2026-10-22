import { existsSync, readFileSync } from 'node:fs';
import { join } from 'node:path';
import type { DataSource } from 'typeorm';
import { normalizeName } from './pesticide-normalize';

/** Minimal RFC-4180 CSV parser (quoted fields, escaped quotes, CRLF). Returns header-keyed rows. */
export function parseCsv(text: string): Array<Record<string, string>> {
  const rows: string[][] = [];
  let row: string[] = [];
  let field = '';
  let quoted = false;
  const src = text.charCodeAt(0) === 0xfeff ? text.slice(1) : text;
  for (let i = 0; i < src.length; i += 1) {
    const ch = src[i]!;
    if (quoted) {
      if (ch === '"' && src[i + 1] === '"') {
        field += '"';
        i += 1;
      } else if (ch === '"') quoted = false;
      else field += ch;
    } else if (ch === '"') quoted = true;
    else if (ch === ',') {
      row.push(field);
      field = '';
    } else if (ch === '\n' || ch === '\r') {
      if (ch === '\r' && src[i + 1] === '\n') i += 1;
      row.push(field);
      field = '';
      if (row.some((c) => c.trim() !== '')) rows.push(row);
      row = [];
    } else field += ch;
  }
  row.push(field);
  if (row.some((c) => c.trim() !== '')) rows.push(row);
  const [header, ...body] = rows;
  if (!header) return [];
  const keys = header.map((h) => h.trim());
  return body.map((r) => Object.fromEntries(keys.map((k, i) => [k, (r[i] ?? '').trim()])));
}

const truthy = (v: string | undefined, fallback: boolean): boolean =>
  v === undefined || v === '' ? fallback : /^(1|true|yes|y)$/i.test(v);
const orNull = (v: string | undefined): string | null => (v && v.trim() ? v.trim() : null);

export interface SeedResult {
  products: number;
  banned: number;
  skipped: string[];
}

const readIfExists = (dir: string, file: string): Array<Record<string, string>> | null =>
  existsSync(join(dir, file)) ? parseCsv(readFileSync(join(dir, file), 'utf8')) : null;

/** Idempotent upsert by normalised name. Safe to run any number of times. */
export async function seedPesticideData(db: DataSource, dir: string): Promise<SeedResult> {
  const result: SeedResult = { products: 0, banned: 0, skipped: [] };
  const productRows = [
    ...(readIfExists(dir, 'pesticide-products.demo.csv') ?? []),
    ...(readIfExists(dir, 'pesticide-products.user-demo.csv') ?? []),
    ...(readIfExists(dir, 'pesticide-products.official.csv') ?? []),
  ];
  for (const r of productRows) {
    const brand = r.brand_name ?? '';
    const normalized = normalizeName(brand);
    if (!normalized || !r.active_ingredient) {
      result.skipped.push(`product row "${brand}" is missing brand_name or active_ingredient`);
      continue;
    }
    const price = r.reference_price_rs ? Number(r.reference_price_rs) : null;
    if (price !== null && (!Number.isFinite(price) || price <= 0)) {
      result.skipped.push(`product "${brand}" has an invalid reference_price_rs`);
      continue;
    }
    await db.query(
      `INSERT INTO pesticide_products(brand_name,brand_normalized,active_ingredient,concentration,formulation,company,registration_no,reference_price_rs,pack_size,crops,source,is_demo)
       VALUES($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12)
       ON CONFLICT (brand_normalized) DO UPDATE SET brand_name=EXCLUDED.brand_name,active_ingredient=EXCLUDED.active_ingredient,
         concentration=EXCLUDED.concentration,formulation=EXCLUDED.formulation,company=EXCLUDED.company,registration_no=EXCLUDED.registration_no,
         reference_price_rs=EXCLUDED.reference_price_rs,pack_size=EXCLUDED.pack_size,crops=EXCLUDED.crops,source=EXCLUDED.source,
         is_demo=EXCLUDED.is_demo,updated_at=now()`,
      [
        brand.trim(),
        normalized,
        r.active_ingredient.trim(),
        orNull(r.concentration),
        orNull(r.formulation),
        orNull(r.company),
        orNull(r.registration_no),
        price,
        orNull(r.pack_size),
        (r.crops ?? '')
          .split(';')
          .map((c) => c.trim())
          .filter(Boolean),
        orNull(r.source) ?? 'user demo entry',
        truthy(r.is_demo, true),
      ],
    );
    result.products += 1;
  }
  const bannedRows = [
    ...(readIfExists(dir, 'banned-ingredients.demo.csv') ?? []),
    ...(readIfExists(dir, 'banned-ingredients.official.csv') ?? []),
  ];
  for (const r of bannedRows) {
    const normalized = normalizeName(r.ingredient);
    if (!normalized) {
      result.skipped.push('banned row without ingredient');
      continue;
    }
    await db.query(
      `INSERT INTO banned_pesticide_ingredients(ingredient,ingredient_normalized,reason,source,is_demo)
       VALUES($1,$2,$3,$4,$5)
       ON CONFLICT (ingredient_normalized) DO UPDATE SET ingredient=EXCLUDED.ingredient,reason=EXCLUDED.reason,
         source=EXCLUDED.source,is_demo=EXCLUDED.is_demo,updated_at=now()`,
      [
        r.ingredient!.trim(),
        normalized,
        orNull(r.reason),
        orNull(r.source) ?? 'unspecified',
        truthy(r.is_demo, true),
      ],
    );
    result.banned += 1;
  }
  return result;
}

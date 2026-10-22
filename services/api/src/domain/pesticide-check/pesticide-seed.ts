import { existsSync, readFileSync } from 'node:fs';
import { join } from 'node:path';
import type { DataSource } from 'typeorm';
import { normalizeIngredient, parseNotifiedProduct } from './dpp-parser';
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
  /** Banned ingredient rows loaded (DPP list A plus any demo/official CSV). */
  banned: number;
  /** DPP Form-16 notified products loaded. */
  notified: number;
  /** DPP banned pre-mixture brands loaded (List B). */
  bannedPremixes: number;
  /** Placeholder demo banned-ingredient rows removed because they are not on the DPP list. */
  removedDemoBanned: number;
  skipped: string[];
}

/** Retrieval date and file provenance of the DPP lists (see seed/dpp/README.md). */
export const DPP_RETRIEVED_ON = '2026-10-23';
const DPP_BANNED_SOURCE =
  'DPP List of Banned Pesticides (A), LIST-OF-BANNED-PESTICIDES-26-PRODUCTS.pdf (plantprotection.gov.pk)';
const DPP_PREMIX_SOURCE =
  'DPP List of Banned Pesticides (B) pre-mixtures, vide SRO 624(I)/96 (LIST-OF-BANNED-PESTICIDES-26-PRODUCTS.pdf)';
const DPP_NOTIFIED_SOURCE =
  'DPP Form-16 notified list (Notified-List-F-16-S.R.0-636I-2005-141-PRODUCTS.xls, plantprotection.gov.pk)';
const DPP_NOTIFIED_NOTIFICATION = 'S.R.O. 636(I)/2005 dated 22.06.2005';

/** "19.09.1994" -> "1994-09-19"; empty/invalid -> null. */
export function dppDateToIso(value: string | undefined): string | null {
  const m = /^(\d{1,2})\.(\d{1,2})\.(\d{4})$/.exec((value ?? '').trim());
  if (!m) return null;
  const [d, mo, y] = [Number(m[1]), Number(m[2]), m[3]!];
  if (mo < 1 || mo > 12 || d < 1 || d > 31) return null;
  return `${y}-${String(mo).padStart(2, '0')}-${String(d).padStart(2, '0')}`;
}

/** "S.R.O 1329(I)/2012" -> "S.R.O. 1329(I)/2012" (formatting only). */
const tidySro = (v: string | undefined): string | null =>
  orNull(v)?.replace(/^S\.R\.O\.?\s*/i, 'S.R.O. ') ?? null;

const readIfExists = (dir: string, file: string): Array<Record<string, string>> | null =>
  existsSync(join(dir, file)) ? parseCsv(readFileSync(join(dir, file), 'utf8')) : null;

/** Idempotent upsert by normalised name. Safe to run any number of times. */
export async function seedPesticideData(db: DataSource, dir: string): Promise<SeedResult> {
  const result: SeedResult = {
    products: 0,
    banned: 0,
    notified: 0,
    bannedPremixes: 0,
    removedDemoBanned: 0,
    skipped: [],
  };
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
  await seedDppData(db, join(dir, 'dpp'), result);
  return result;
}

/** Loads the official DPP lists (seed/dpp/*.csv) with provenance. Idempotent: upserts by key. */
async function seedDppData(db: DataSource, dppDir: string, result: SeedResult): Promise<void> {
  const keptBanned: string[] = [];
  const banned = readIfExists(dppDir, 'dpp-banned-ingredients.csv') ?? [];
  for (const r of banned) {
    const name = (r.chemical_name ?? '').trim();
    const normalized = normalizeName(name);
    if (!normalized) {
      result.skipped.push(`DPP banned row ${r.serial ?? '?'} has no chemical_name`);
      continue;
    }
    const position = orNull(r.position_in_pakistan);
    await db.query(
      `INSERT INTO banned_pesticide_ingredients(ingredient,ingredient_normalized,reason,source,is_demo,position_in_pakistan,notification_number,notification_date,retrieved_on)
       VALUES($1,$2,$3,$4,false,$5,$6,$7,$8)
       ON CONFLICT (ingredient_normalized) DO UPDATE SET ingredient=EXCLUDED.ingredient,reason=EXCLUDED.reason,source=EXCLUDED.source,
         is_demo=false,position_in_pakistan=EXCLUDED.position_in_pakistan,notification_number=EXCLUDED.notification_number,
         notification_date=EXCLUDED.notification_date,retrieved_on=EXCLUDED.retrieved_on,updated_at=now()`,
      [
        name,
        normalized,
        position?.slice(0, 400) ?? null,
        DPP_BANNED_SOURCE,
        position,
        tidySro(r.notification_number),
        dppDateToIso(r.notification_date),
        DPP_RETRIEVED_ON,
      ],
    );
    keptBanned.push(normalized);
    result.banned += 1;
  }
  if (keptBanned.length > 0) {
    // "Banned in Pakistan" claims may only come from the DPP list: drop placeholder demo rows that are not on it.
    const removed = await db.query<Array<{ c: number }>>(
      `WITH d AS (DELETE FROM banned_pesticide_ingredients WHERE is_demo AND ingredient_normalized <> ALL($1::text[]) RETURNING 1)
       SELECT count(*)::int c FROM d`,
      [keptBanned],
    );
    result.removedDemoBanned = removed[0]?.c ?? 0;
  }

  for (const r of readIfExists(dppDir, 'dpp-banned-premixes.csv') ?? []) {
    const brand = (r.brand_name ?? '').trim();
    const normalized = normalizeName(brand);
    if (!normalized || !r.notification_number) {
      result.skipped.push(`DPP premix row "${brand}" is missing brand_name or notification_number`);
      continue;
    }
    const components = (r.common_name ?? '')
      .split('+')
      .map((c) => normalizeIngredient(c))
      .filter(Boolean);
    await db.query(
      `INSERT INTO banned_pesticide_products(brand_name,brand_normalized,formulation,common_name,ingredients_normalized,notification_number,notification_date,source,retrieved_on)
       VALUES($1,$2,$3,$4,$5::text[],$6,$7,$8,$9)
       ON CONFLICT (brand_normalized) DO UPDATE SET brand_name=EXCLUDED.brand_name,formulation=EXCLUDED.formulation,
         common_name=EXCLUDED.common_name,ingredients_normalized=EXCLUDED.ingredients_normalized,
         notification_number=EXCLUDED.notification_number,notification_date=EXCLUDED.notification_date,
         source=EXCLUDED.source,retrieved_on=EXCLUDED.retrieved_on,updated_at=now()`,
      [
        brand,
        normalized,
        orNull(r.formulation),
        orNull(r.common_name),
        components,
        r.notification_number.trim(),
        dppDateToIso(r.notification_date),
        DPP_PREMIX_SOURCE,
        DPP_RETRIEVED_ON,
      ],
    );
    result.bannedPremixes += 1;
  }

  for (const r of readIfExists(dppDir, 'dpp-form16-notified.csv') ?? []) {
    const text = (r.product_text ?? '').trim();
    const serial = Number(r.serial);
    const parsed = parseNotifiedProduct(text);
    if (!Number.isInteger(serial) || parsed.ingredients.length === 0) {
      result.skipped.push(`DPP notified row ${r.serial ?? '?'} "${text}" yielded no ingredient`);
      continue;
    }
    await db.query(
      `INSERT INTO dpp_notified_products(serial,product_text,ingredients,ingredients_normalized,concentration_text,formulations,category,uses,who_class,notification,source,retrieved_on)
       VALUES($1,$2,$3::text[],$4::text[],$5,$6::text[],$7,$8,$9,$10,$11,$12)
       ON CONFLICT (serial) DO UPDATE SET product_text=EXCLUDED.product_text,ingredients=EXCLUDED.ingredients,
         ingredients_normalized=EXCLUDED.ingredients_normalized,concentration_text=EXCLUDED.concentration_text,
         formulations=EXCLUDED.formulations,category=EXCLUDED.category,uses=EXCLUDED.uses,who_class=EXCLUDED.who_class,
         notification=EXCLUDED.notification,source=EXCLUDED.source,retrieved_on=EXCLUDED.retrieved_on,updated_at=now()`,
      [
        serial,
        text.slice(0, 300),
        parsed.ingredients,
        parsed.ingredients.map((i) => normalizeIngredient(i)),
        parsed.concentrations.length ? parsed.concentrations.join('; ').slice(0, 300) : null,
        parsed.formulations,
        orNull(r.category),
        orNull(r.uses),
        orNull(r.who_class),
        DPP_NOTIFIED_NOTIFICATION,
        DPP_NOTIFIED_SOURCE,
        DPP_RETRIEVED_ON,
      ],
    );
    result.notified += 1;
  }
}

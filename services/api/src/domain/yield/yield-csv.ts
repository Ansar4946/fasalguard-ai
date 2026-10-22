/** F13: strict CSV parsing, validation and unit conversion for historical yield observations.
 *  Pure functions only; nothing here touches the database or invents data. */

export const MAUND_KG = 40;
export const ACRE_HA = 0.4047;
export const MAX_YIELD_KG_PER_HA = 100_000;
export const MAX_CSV_ROWS = 50_000;

export const YIELD_UNITS = [
  'kg_per_ha',
  'kg_per_acre',
  'maund_per_acre',
  'maund_per_ha',
  'tonne_per_ha',
] as const;
export type YieldUnit = (typeof YIELD_UNITS)[number];
export const YIELD_SEASONS = ['KHARIF', 'RABI', 'ANNUAL'] as const;
export type YieldSeason = (typeof YIELD_SEASONS)[number];
export const IMPORTABLE_LICENCE_STATUSES = [
  'UNVERIFIED',
  'VERIFIED_OPEN',
  'VERIFIED_PERMISSION',
] as const;
export type YieldLicenceStatus = (typeof IMPORTABLE_LICENCE_STATUSES)[number];

export const YIELD_CSV_COLUMNS = [
  'crop',
  'province',
  'district',
  'season',
  'year',
  'value',
  'unit',
  'source_name',
  'source_url',
  'licence_status',
] as const;

export interface ValidYieldRow {
  line: number;
  crop: string;
  province: string;
  district: string;
  season: YieldSeason;
  year: number;
  publishedValue: number;
  publishedUnit: YieldUnit;
  yieldKgPerHa: number;
  sourceName: string;
  sourceUrl: string;
  licenceStatus: YieldLicenceStatus;
}
export interface RowError {
  line: number;
  message: string;
}

export function toKgPerHa(value: number, unit: YieldUnit): number {
  switch (unit) {
    case 'kg_per_ha':
      return value;
    case 'kg_per_acre':
      return value / ACRE_HA;
    case 'maund_per_acre':
      return (value * MAUND_KG) / ACRE_HA;
    case 'maund_per_ha':
      return value * MAUND_KG;
    case 'tonne_per_ha':
      return value * 1000;
  }
}

/** RFC 4180 style parser: quoted fields, doubled quotes, CRLF or LF. Throws on an unterminated quote. */
export function parseCsv(text: string): string[][] {
  const rows: string[][] = [];
  let row: string[] = [];
  let field = '';
  let quoted = false;
  let i = text.charCodeAt(0) === 0xfeff ? 1 : 0;
  for (; i < text.length; i++) {
    const c = text[i];
    if (quoted) {
      if (c === '"') {
        if (text[i + 1] === '"') {
          field += '"';
          i++;
        } else quoted = false;
      } else field += c;
    } else if (c === '"' && field === '') quoted = true;
    else if (c === ',') {
      row.push(field);
      field = '';
    } else if (c === '\n' || c === '\r') {
      if (c === '\r' && text[i + 1] === '\n') i++;
      row.push(field);
      field = '';
      if (row.some((f) => f.trim() !== '')) rows.push(row);
      row = [];
    } else field += c;
  }
  if (quoted) throw new Error('CSV has an unterminated quoted field.');
  row.push(field);
  if (row.some((f) => f.trim() !== '')) rows.push(row);
  return rows;
}

const norm = (v: string): string => v.trim().replace(/\s+/g, ' ').toLowerCase();

export function validateYieldCsv(text: string): {
  rows: ValidYieldRow[];
  errors: RowError[];
} {
  const errors: RowError[] = [];
  let table: string[][];
  try {
    table = parseCsv(text);
  } catch (e) {
    return { rows: [], errors: [{ line: 0, message: (e as Error).message }] };
  }
  const header = table[0]?.map((h) => h.trim().toLowerCase());
  if (!header) return { rows: [], errors: [{ line: 0, message: 'CSV is empty.' }] };
  const missing = YIELD_CSV_COLUMNS.filter((c) => !header.includes(c));
  const unknown = header.filter((h) => !(YIELD_CSV_COLUMNS as readonly string[]).includes(h));
  if (missing.length || unknown.length || new Set(header).size !== header.length) {
    return {
      rows: [],
      errors: [
        {
          line: 1,
          message: `Header must contain exactly: ${YIELD_CSV_COLUMNS.join(',')}. Missing: [${missing.join(',')}] unknown or duplicate: [${unknown.join(',')}].`,
        },
      ],
    };
  }
  if (table.length - 1 > MAX_CSV_ROWS)
    return {
      rows: [],
      errors: [{ line: 0, message: `CSV exceeds ${MAX_CSV_ROWS} data rows.` }],
    };
  const rows: ValidYieldRow[] = [];
  const seen = new Map<string, ValidYieldRow>();
  for (let r = 1; r < table.length; r++) {
    const line = r + 1;
    const cells = table[r] as string[];
    const bad = (message: string): void => {
      errors.push({ line, message });
    };
    if (cells.length !== header.length) {
      bad(`Expected ${header.length} fields but found ${cells.length}.`);
      continue;
    }
    const get = (c: (typeof YIELD_CSV_COLUMNS)[number]): string =>
      (cells[header.indexOf(c)] ?? '').trim();
    const before = errors.length;
    for (const c of ['crop', 'province', 'district', 'source_name', 'source_url'] as const)
      if (!get(c)) bad(`${c} is required (provenance and location are mandatory).`);
    const season = get('season').toUpperCase();
    if (!(YIELD_SEASONS as readonly string[]).includes(season))
      bad(`season must be one of ${YIELD_SEASONS.join(', ')}.`);
    const unit = get('unit').toLowerCase();
    if (!(YIELD_UNITS as readonly string[]).includes(unit))
      bad(`unit must be one of ${YIELD_UNITS.join(', ')}.`);
    const licence = get('licence_status').toUpperCase();
    if (!(IMPORTABLE_LICENCE_STATUSES as readonly string[]).includes(licence))
      bad(`licence_status must be one of ${IMPORTABLE_LICENCE_STATUSES.join(', ')}.`);
    const yearText = get('year');
    const year = /^\d{4}$/.test(yearText) ? Number(yearText) : NaN;
    if (!Number.isInteger(year) || year < 1900 || year > 2100) bad('year must be a 4-digit year.');
    const valueText = get('value');
    const value = /^\d+(\.\d+)?$/.test(valueText) ? Number(valueText) : NaN;
    if (!Number.isFinite(value) || value <= 0) bad('value must be a positive plain number.');
    const url = get('source_url');
    if (url && !/^https?:\/\/[^\s]+$/i.test(url)) bad('source_url must be an http(s) URL.');
    if (get('crop').length > 64 || get('province').length > 64 || get('district').length > 64)
      bad('crop, province and district must be at most 64 characters.');
    if (get('source_name').length > 200) bad('source_name must be at most 200 characters.');
    if (errors.length > before) continue;
    const kg = Math.round(toKgPerHa(value, unit as YieldUnit) * 1000) / 1000;
    if (kg <= 0 || kg > MAX_YIELD_KG_PER_HA) {
      bad(
        `normalized yield ${kg} kg/ha is outside the plausible range (0, ${MAX_YIELD_KG_PER_HA}].`,
      );
      continue;
    }
    const row: ValidYieldRow = {
      line,
      crop: norm(get('crop')),
      province: norm(get('province')),
      district: norm(get('district')),
      season: season as YieldSeason,
      year,
      publishedValue: value,
      publishedUnit: unit as YieldUnit,
      yieldKgPerHa: kg,
      sourceName: get('source_name'),
      sourceUrl: url,
      licenceStatus: licence as YieldLicenceStatus,
    };
    const key = `${row.crop}|${row.district}|${row.season}|${row.year}`;
    const prior = seen.get(key);
    if (prior) {
      bad(
        prior.yieldKgPerHa === row.yieldKgPerHa
          ? `Duplicate of line ${prior.line}.`
          : `Conflicts with line ${prior.line} for the same crop, district, season and year.`,
      );
      continue;
    }
    seen.set(key, row);
    rows.push(row);
  }
  return { rows, errors };
}

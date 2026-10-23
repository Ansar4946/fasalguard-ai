/**
 * Pure heuristics that turn raw OCR text from a pesticide label into structured fields.
 * Everything here is best-effort: a field that cannot be found with reasonable confidence is
 * left out so the scoring engine reports it as missing instead of guessing.
 */
export interface ExtractedLabelFields {
  brandName?: string;
  activeIngredient?: string;
  concentration?: string;
  formulation?: string;
  company?: string;
  registrationNo?: string;
  batchNo?: string;
  manufacturingDate?: string;
  expiryDate?: string;
}

export const LABEL_FIELD_KEYS = [
  'brandName',
  'activeIngredient',
  'concentration',
  'formulation',
  'company',
  'registrationNo',
  'batchNo',
  'manufacturingDate',
  'expiryDate',
] as const;
export type LabelFieldKey = (typeof LABEL_FIELD_KEYS)[number];

const FORMULATIONS = [
  'EC',
  'SL',
  'WP',
  'WG',
  'SC',
  'SP',
  'FS',
  'SG',
  'DF',
  'OD',
  'ME',
  'EW',
  'GR',
  'DP',
  'CS',
  'ZC',
];
const FORMULATION_ALT = FORMULATIONS.join('|');
const FORMULATION_WORDS: Array<[RegExp, string]> = [
  [/emulsifiable\s+concentrate/i, 'EC'],
  [/soluble\s+(?:liquid|concentrate)/i, 'SL'],
  [/wettable\s+powder/i, 'WP'],
  [/water\s+dispersible\s+granules?/i, 'WG'],
  [/suspension\s+concentrate/i, 'SC'],
  [/soluble\s+powder/i, 'SP'],
];

const MONTHS: Record<string, number> = {
  jan: 1,
  feb: 2,
  mar: 3,
  apr: 4,
  may: 5,
  jun: 6,
  jul: 7,
  aug: 8,
  sep: 9,
  oct: 10,
  nov: 11,
  dec: 12,
};

const escapeRe = (s: string): string => s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
const clean = (s: string): string =>
  s
    .replace(/\s+/g, ' ')
    .replace(/^[\s:;.,\-|]+|[\s:;|]+$/g, '')
    .trim();

/** A date-like token: 10/2027, 03-2026, 12.2026, 15/10/2027, 2027-10-15, Oct 2027, OCT.2027, 10/27. */
const DATE_TOKEN =
  '(\\d{1,2}\\s*[/\\-.]\\s*\\d{1,2}\\s*[/\\-.]\\s*\\d{2,4}|\\d{4}\\s*[/\\-.]\\s*\\d{1,2}(?:\\s*[/\\-.]\\s*\\d{1,2})?|\\d{1,2}\\s*[/\\-.]\\s*\\d{2,4}|[A-Za-z]{3,9}\\.?\\s*[/\\-.,]?\\s*\\d{2,4})';

function labelledDate(text: string, labels: string): string | undefined {
  const re = new RegExp(`(?:${labels})\\s*[:.\\-]?\\s*${DATE_TOKEN}`, 'i');
  const m = re.exec(text);
  const value = m?.[1] ? m[1].replace(/\s+/g, '') : undefined;
  return value && parseLabelDate(value) ? value : undefined;
}

/** Month/year (or full date) to the END of the stated month/day (UTC); undefined if unparseable. */
export function parseLabelDate(value: string | null | undefined): Date | undefined {
  if (!value) return undefined;
  const s = value.trim().replace(/\s+/g, '');
  const endOfMonth = (y: number, mo: number): Date => new Date(Date.UTC(y, mo, 0, 23, 59, 59));
  const year = (y: string): number => (y.length <= 2 ? 2000 + Number(y) : Number(y));
  let m: RegExpExecArray | null;
  if ((m = /^(\d{4})[/\-.](\d{1,2})[/\-.](\d{1,2})$/.exec(s))) {
    const [y, mo, d] = [Number(m[1]), Number(m[2]), Number(m[3])];
    return mo >= 1 && mo <= 12 && d >= 1 && d <= 31
      ? new Date(Date.UTC(y, mo - 1, d, 23, 59, 59))
      : undefined;
  }
  if ((m = /^(\d{4})[/\-.](\d{1,2})$/.exec(s))) {
    const mo = Number(m[2]);
    return mo >= 1 && mo <= 12 ? endOfMonth(Number(m[1]), mo) : undefined;
  }
  if ((m = /^(\d{1,2})[/\-.](\d{1,2})[/\-.](\d{2,4})$/.exec(s))) {
    const [d, mo] = [Number(m[1]), Number(m[2])];
    return mo >= 1 && mo <= 12 && d >= 1 && d <= 31
      ? new Date(Date.UTC(year(m[3]!), mo - 1, d, 23, 59, 59))
      : undefined;
  }
  if ((m = /^(\d{1,2})[/\-.](\d{4}|\d{2})$/.exec(s))) {
    const mo = Number(m[1]);
    return mo >= 1 && mo <= 12 ? endOfMonth(year(m[2]!), mo) : undefined;
  }
  if ((m = /^([A-Za-z]{3,9})\.?[/\-.,]?(\d{4}|\d{2})$/.exec(s))) {
    const mo = MONTHS[m[1]!.toLowerCase().slice(0, 3)];
    return mo ? endOfMonth(year(m[2]!), mo) : undefined;
  }
  return undefined;
}

export function extractLabelFields(rawText: string): ExtractedLabelFields {
  const fields: ExtractedLabelFields = {};
  if (!rawText || !rawText.trim()) return fields;
  const text = rawText.replace(/\r/g, '\n').replace(/[ \t]+/g, ' ');
  const lines = text
    .split('\n')
    .map((l) => l.trim())
    .filter(Boolean);

  // Concentration: first "20 %" / "20% w/v" style value.
  const conc = /(\d{1,3}(?:[.,]\d{1,2})?)\s*%\s*(w\s*\/\s*[vw]|v\s*\/\s*v)?/i.exec(text);
  if (conc)
    fields.concentration = `${conc[1]!.replace(',', '.')}%${
      conc[2] ? ' ' + conc[2].replace(/\s/g, '').toLowerCase() : ''
    }`;

  // Formulation: code right after the concentration ("20% SL"), a long name, a labelled code.
  const afterConc = conc
    ? new RegExp(`${escapeRe(conc[0])}\\s*(${FORMULATION_ALT})(?![A-Za-z])`, 'i').exec(text)
    : null;
  if (afterConc) fields.formulation = afterConc[1]!.toUpperCase();
  else {
    const word = FORMULATION_WORDS.find(([re]) => re.test(text));
    if (word) fields.formulation = word[1];
    else {
      const labelled = /formulation\s*[:.-]?\s*([A-Za-z]{2})(?![A-Za-z])/i.exec(text);
      if (labelled && FORMULATIONS.includes(labelled[1]!.toUpperCase()))
        fields.formulation = labelled[1]!.toUpperCase();
    }
  }

  // Registration number.
  const reg =
    /(?:registration|regn?\.?|registered)\s*(?:no|number|#)?\.?\s*[:.\-#]?\s*([A-Z0-9][A-Z0-9\-/.]{1,24})/i.exec(
      text,
    );
  if (reg && /\d/.test(reg[1]!)) fields.registrationNo = clean(reg[1]!).replace(/[.]+$/, '');

  // Batch / lot.
  const batch =
    /(?:batch|b\.?\s*no|lot)\s*(?:no|number|#)?\.?\s*[:.\-#]?\s*([A-Z0-9][A-Z0-9\-/]{1,19})/i.exec(
      text,
    );
  if (batch && /\d/.test(batch[1]!)) fields.batchNo = clean(batch[1]!);

  // Dates.
  const expiry = labelledDate(
    text,
    'exp(?:iry)?\\.?(?:\\s*date)?|expires?|use\\s+before|best\\s+before',
  );
  if (expiry) fields.expiryDate = expiry;
  const mfg = labelledDate(
    text,
    'mfg\\.?(?:\\s*date)?|manufactur(?:ed|ing)\\s*date|date\\s+of\\s+manufacture|prod(?:uction)?\\.?\\s*date',
  );
  if (mfg) fields.manufacturingDate = mfg;

  // Company.
  const byRe =
    /(?:manufactured|marketed|formulated|packed|imported|distributed)\s+by\s*[:.-]?\s*([^\n]{3,80})/i.exec(
      text,
    );
  if (byRe) fields.company = clean(byRe[1]!);
  else {
    const line = lines.find(
      (l) =>
        l.length <= 80 &&
        /\b(?:pvt|private|ltd|limited|corporation|corp|industries|chemicals|agro|agri)\b/i.test(l),
    );
    if (line) fields.company = clean(line);
  }

  // Active ingredient.
  const ai =
    /(?:active\s+ingredients?|a\.?\s*i\.?|composition|contains)\s*[:.-]?\s*([A-Za-z][A-Za-z \-,()]{2,60})/i.exec(
      text,
    );
  if (ai) {
    const v = clean(
      ai[1]!.split(/\n|\s+(?:reg|batch|mfg|exp|manufactured|marketed|net|pack)\b/i)[0]!,
    );
    if (v.length >= 3) fields.activeIngredient = v;
  }
  if (!fields.activeIngredient && conc) {
    const m = new RegExp(`([A-Za-z][A-Za-z\\- ]{3,40}?)\\s*${escapeRe(conc[0])}`, 'i').exec(text);
    if (m) {
      const v = clean(m[1]!);
      if (v.length >= 4 && !/^(?:net|batch|contents?|each|total|contains?)$/i.test(v))
        fields.activeIngredient = v;
    }
  }

  // Brand: first prominent line that is not a generic label/boilerplate/date line.
  const skip =
    /^(?:insecticide|fungicide|herbicide|pesticide|acaricide|net\b|batch|mfg|exp|reg|manufactured|marketed|active|warning|caution|keep|read|danger|poison|antidote|contents?|for\b|use\b|www\.|tel|ph\b|phone|made\s+in|formulation)/i;
  const brandLine = lines.find(
    (l) =>
      l.length >= 3 &&
      l.length <= 40 &&
      /[A-Za-z]{3}/.test(l) &&
      !skip.test(l) &&
      !/\b(?:pvt|ltd|limited|corporation)\b/i.test(l) &&
      !/\d{1,2}\s*[/\-.]\s*\d{2,4}/.test(l),
  );
  if (brandLine) fields.brandName = clean(brandLine);

  return fields;
}

/**
 * Pure helpers for the official DPP lists: an ingredient normaliser that folds well-known spelling
 * variants, and a parser for the Form-16 "product text" (ingredient(s) + concentration + formulation(s)),
 * e.g. "Abamectin 1.8% EC.", "Acephate 40 EC, 75 SP.", "Ametryn + Atrazine 80WP, 50 FW.".
 */

/** Spelling variants folded on the collapsed (letters+digits only, lowercase) form. Order matters. */
const VARIANT_FOLDS: ReadonlyArray<readonly [string, string]> = [
  ['chlorpyriphos', 'chlorpyrifos'],
  ['chlorpyriphosethyl', 'chlorpyrifos'],
  ['qulinalphos', 'quinalphos'],
  ['quinalfos', 'quinalphos'],
  ['propergyl', 'propargyl'],
  ['propergite', 'propargite'],
  ['aluminum', 'aluminium'],
  ['sulph', 'sulf'],
  ['fenitrothian', 'fenitrothion'],
  ['fenvelarate', 'fenvalerate'],
  ['primicarb', 'pirimicarb'],
  ['tridimefon', 'triadimefon'],
  ['tridiazuron', 'thidiazuron'],
  ['imazomethabenz', 'imazamethabenz'],
  ['dichlorprop', 'dichloroprop'],
  ['chlorotoluron', 'chlortoluron'],
  ['mencaprop', 'mecoprop'],
  ['cyanofenphos', 'cyanofenphos'],
  ['monocrotofos', 'monocrotophos'],
  ['methamidofos', 'methamidophos'],
  ['dicrotofos', 'dicrotophos'],
  ['mevinfos', 'mevinphos'],
  ['leptofos', 'leptophos'],
];

/** Collapses to lowercase letters and digits and folds spelling variants. */
export function normalizeIngredient(value: string | null | undefined): string {
  let n = (value ?? '')
    .normalize('NFKC')
    .toLowerCase()
    .replace(/[^\p{L}\p{N}]+/gu, '');
  for (const [from, to] of VARIANT_FOLDS) n = n.split(from).join(to);
  // "Bromoxynil acid" is the same active as "Bromoxynil" for matching purposes.
  if (n.endsWith('acid') && n.length > 8) n = n.slice(0, -4);
  return n;
}

/** Folds variants inside a longer collapsed text (OCR text) without the trailing-"acid" rule. */
export function foldVariantsInText(collapsed: string): string {
  let n = collapsed;
  for (const [from, to] of VARIANT_FOLDS) n = n.split(from).join(to);
  return n;
}

export interface ParsedNotifiedProduct {
  /** Ingredient names as written (cleaned), one per mixture component. */
  ingredients: string[];
  /** Strengths as written, e.g. "1.8%", "40", "250 g/l", "200/200". */
  concentrations: string[];
  /** Formulation codes/forms, e.g. "EC", "WP", "FW", "Tablets". */
  formulations: string[];
}

const FORMULATION_CODES = [
  'WDG',
  'ULV',
  'WG',
  'WP',
  'WS',
  'SL',
  'SC',
  'SP',
  'SE',
  'EC',
  'EW',
  'FW',
  'DC',
  'DP',
  'DF',
  'CS',
  'AS',
  'ALP',
  'G',
  'D',
  'E',
  'S',
];
const FORMULATION_WORDS = ['Tablets', 'Pellets', 'Bags', 'plates', 'strips', 'Powder', 'dust'];
const CODE_RE = new RegExp(
  `(?<![A-Za-z/])(${FORMULATION_CODES.filter((c) => c !== 'ALP').join('|')})(?![A-Za-z])`,
  'g',
);
const WORD_RE = new RegExp(`\\b(${FORMULATION_WORDS.join('|')})\\b`, 'gi');
const NUMBER_RE =
  /\d+(?:\s*\.\s*\d+)?(?:\s*\/\s*\d+(?:\.\d+)?)?(?:\s*(?:%|per\s*cent|g\s*\/\s*l(?:it(?:re)?s?)?\.?|g\s*\/\s*kg))?/gi;

/** Removes decoding debris and unifies dashes ("Diclofop \ufffd methyl" -> "Diclofop-methyl"). */
function tidy(text: string): string {
  return text
    .replace(/[\u2013\u2014\ufffd]/g, '-')
    .replace(/\s*-\s*(?=[A-Za-z])/g, '-')
    .replace(/(?<=[A-Za-z])\s*-\s*/g, '-')
    .replace(/\s+/g, ' ')
    .trim();
}

// eslint-disable-next-line no-control-regex -- \u0001 delimits the private name placeholders
const PLACEHOLDER_RE = /\u0001([a-z])\u0001/g;

const cleanIngredient = (s: string): string =>
  s
    .replace(/^[\s,;.&+/-]+|[\s,;.&+/-]+$/g, '')
    .replace(/\s+/g, ' ')
    .trim();

/**
 * Parses one Form-16 style product string. Ingredient names are everything before the first strength
 * (a number) or bracket; strengths and formulations are read from the remainder (brackets included).
 * Mixtures are split on "+", "&", "/" and commas.
 */
export function parseNotifiedProduct(text: string | null | undefined): ParsedNotifiedProduct {
  const empty: ParsedNotifiedProduct = { ingredients: [], concentrations: [], formulations: [] };
  if (!text || !text.trim()) return empty;
  let t = tidy(text);
  // Editorial notes inside brackets are not product data.
  t = t.replace(/\((?:[^)]*\b(?:typing error|not included)\b[^)]*)\)/gi, ' ');
  // Protect names that legitimately start with digits (placeholder holds a letter, never a digit).
  const protectedNames: string[] = [];
  t = t.replace(/\b2,4,5-T\b|\b2,4-DB?\b|\b2,4-D\b/gi, (m) => {
    protectedNames.push(m);
    return `\u0001${String.fromCharCode(97 + protectedNames.length - 1)}\u0001`;
  });
  // Split on top-level "+" (not inside brackets); each segment is "name [strength/formulation...]".
  const segments: string[] = [];
  let depth = 0;
  let buf = '';
  for (const ch of t) {
    if (ch === '(') depth += 1;
    else if (ch === ')') depth = Math.max(0, depth - 1);
    if (ch === '+' && depth === 0) {
      segments.push(buf);
      buf = '';
    } else buf += ch;
  }
  segments.push(buf);
  const names: string[] = [];
  const tails: string[] = [];
  for (const seg of segments) {
    const cut = seg.search(/[\d(]/);
    names.push(cut === -1 ? seg : seg.slice(0, cut));
    if (cut !== -1) tails.push(seg.slice(cut));
  }
  const restore = (v: string): string =>
    v.replace(PLACEHOLDER_RE, (_m, c: string) => protectedNames[c.charCodeAt(0) - 97] ?? '');
  const tail = tails.join(' ');

  const ingredients = names
    .flatMap((n) => n.split(/\s*(?:&|\/|,|;|\band\b)\s*/i))
    .map((x) => cleanIngredient(restore(x)))
    .filter((x) => /[A-Za-z]/.test(x) && x.length >= 2);

  // Strengths: scan the tail without the formulation words so that "per cent" stays attached.
  const concentrations: string[] = [];
  for (const m of tail.matchAll(NUMBER_RE)) {
    const raw = m[0]
      .replace(/\s+/g, ' ')
      .replace(/\s*\.\s*/g, '.')
      .replace(/ ?\/ ?/g, '/')
      .trim();
    const value = raw.replace(/\s*per ?cent/i, '%').replace(/\s+%/, '%');
    if (value && !concentrations.includes(value)) concentrations.push(value);
  }

  // Formulations: strip bracketed bits that are not formulations, then scan for codes and words.
  const tailForForms = tail.replace(/\((?:ALP|w\/[vw]|P\. dichloride[^)]*)\)/gi, ' ');
  const formulations: string[] = [];
  for (const m of tailForForms.matchAll(CODE_RE)) {
    const code = m[1]!;
    if (!formulations.includes(code)) formulations.push(code);
  }
  for (const m of tailForForms.matchAll(WORD_RE)) {
    const w = m[1]!;
    const canon = w[0]!.toUpperCase() + w.slice(1).toLowerCase();
    if (!formulations.includes(canon)) formulations.push(canon);
  }
  return { ingredients, concentrations, formulations };
}

/** Numeric parts of strength strings: "1.8%" -> 1.8, "200/328" -> 200 and 328, "250 g/l" -> 250. */
export function strengthNumbers(values: string[] | string | null | undefined): number[] {
  const list = Array.isArray(values) ? values : values ? [values] : [];
  const out: number[] = [];
  for (const v of list)
    for (const m of v.matchAll(/\d+(?:\.\d+)?/g)) {
      const n = Number(m[0]);
      if (Number.isFinite(n) && !out.includes(n)) out.push(n);
    }
  return out;
}

export interface LabelIngredientInfo extends ParsedNotifiedProduct {
  /** Where the ingredients came from: a labelled "Active ingredient:" line, or the extracted field. */
  source: 'labelled-line' | 'field' | 'none';
}

/**
 * Reads the active ingredient(s), strengths and formulations from OCR text / extracted fields using the same
 * parser as the Form-16 list. A labelled line ("Active Ingredient: A 5% + B 40% EC") wins because the
 * single-field extractor only keeps the first ingredient of a mixture.
 */
export function readLabelIngredients(
  fields: { activeIngredient?: string; concentration?: string; formulation?: string },
  rawText?: string,
): LabelIngredientInfo {
  let parsed: ParsedNotifiedProduct = { ingredients: [], concentrations: [], formulations: [] };
  let source: LabelIngredientInfo['source'] = 'none';
  const labelled = /(?:active\s+ingredients?|a\.?\s*i\.?|composition|contains)\s*[:-]\s*([^\n]+)/i;
  const m = rawText ? labelled.exec(rawText) : null;
  if (m?.[1]) {
    const p = parseNotifiedProduct(m[1]);
    if (p.ingredients.length > 0) {
      parsed = p;
      source = 'labelled-line';
    }
  }
  if (parsed.ingredients.length === 0 && fields.activeIngredient) {
    const p = parseNotifiedProduct(fields.activeIngredient);
    if (p.ingredients.length > 0) {
      parsed = p;
      source = 'field';
    }
  }
  const concentrations = [...parsed.concentrations];
  if (fields.concentration && !concentrations.includes(fields.concentration))
    concentrations.push(fields.concentration);
  const formulations = [...parsed.formulations];
  if (fields.formulation && !formulations.includes(fields.formulation.toUpperCase()))
    formulations.push(fields.formulation.toUpperCase());
  return { ingredients: parsed.ingredients, concentrations, formulations, source };
}

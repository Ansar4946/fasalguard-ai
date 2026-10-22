import { foldVariantsInText, normalizeIngredient, strengthNumbers } from './dpp-parser';
import { normalizeName, trigramSimilarity } from './pesticide-normalize';

/* ---- Tunable thresholds for the DPP list checks ---- */
/** A label brand this similar (pg_trgm-compatible) to a banned pre-mixture brand is a hit; exact normalised equality is always a hit. */
export const PREMIX_BRAND_MIN_SIMILARITY = 0.8;
/** Banned pre-mixture brand names are also searched in the full label text, but only when at least this long (avoids false hits on short names). */
export const PREMIX_TEXT_SCAN_MIN_LENGTH = 7;
/** Typo tolerance for comparing a label ingredient with a notified-list ingredient (long names only). */
export const NOTIFIED_INGREDIENT_MIN_SIMILARITY = 0.85;
export const NOTIFIED_FUZZY_MIN_LENGTH = 8;

export type ListCoverage = 'DEMO' | 'DPP_PARTIAL';

export interface NotifiedProductInfo {
  serial: number;
  productText: string;
  ingredientsNormalized: string[];
  concentrationText: string | null;
  formulations: string[];
  category: string | null;
  whoClass: string | null;
  notification: string;
}

export interface PremixBrandInfo {
  brandName: string;
  brandNormalized: string;
  formulation: string | null;
  commonName: string | null;
  ingredientsNormalized: string[];
  notificationNumber: string;
  /** ISO date (YYYY-MM-DD) or null. */
  notificationDate: string | null;
}

export interface PremixMatch {
  brand: PremixBrandInfo;
  similarity: number;
  exact: boolean;
  /** How many of the premix components also appear among the label ingredients. */
  ingredientOverlap: number;
  /** True when every component of the premix is on the label. */
  ingredientsAllMatch: boolean;
}

export interface NotifiedMatchResult {
  status: 'pass' | 'unknown';
  reason: 'listed' | 'no_ingredient' | 'not_found' | 'combination';
  row: NotifiedProductInfo | null;
  concentrationMatches: boolean;
  formulationMatches: boolean;
  /** Label ingredients (normalised keys) that were not found on the notified list at all. */
  missing: string[];
}

/** Two ingredient names are the same chemical: equal after variant folding, or a close typo of a long name. */
export function ingredientEquivalent(a: string, b: string): boolean {
  const na = normalizeIngredient(a);
  const nb = normalizeIngredient(b);
  if (!na || !nb) return false;
  if (na === nb) return true;
  return (
    na.length >= NOTIFIED_FUZZY_MIN_LENGTH &&
    nb.length >= NOTIFIED_FUZZY_MIN_LENGTH &&
    trigramSimilarity(na, nb) >= NOTIFIED_INGREDIENT_MIN_SIMILARITY
  );
}

/** Normalised, de-duplicated ingredient keys for a list of ingredient names. */
export function ingredientKeys(names: string[]): string[] {
  const out: string[] = [];
  for (const n of names) {
    const k = normalizeIngredient(n);
    if (k && !out.some((o) => ingredientEquivalent(o, k))) out.push(k);
  }
  return out;
}

const sameSet = (a: string[], b: string[]): boolean =>
  a.length === b.length && a.every((x) => b.some((y) => ingredientEquivalent(x, y)));

/**
 * Compares the label's ingredients with the DPP Form-16 notified list.
 * pass: a notified row has exactly these ingredients (strength / formulation matches are reported too).
 * unknown (never warn/fail): nothing read, an ingredient not on the list, or the combination is not a notified mixture.
 */
export function matchNotifiedList(args: {
  labelIngredients: string[];
  labelConcentrations?: string[];
  labelFormulations?: string[];
  notified: NotifiedProductInfo[];
}): NotifiedMatchResult {
  const keys = ingredientKeys(args.labelIngredients);
  const none = { row: null, concentrationMatches: false, formulationMatches: false };
  if (keys.length === 0)
    return { status: 'unknown', reason: 'no_ingredient', missing: [], ...none };
  const labelNumbers = strengthNumbers(args.labelConcentrations);
  const labelForms = (args.labelFormulations ?? []).map((f) => f.toUpperCase());
  let best: { row: NotifiedProductInfo; conc: boolean; form: boolean; score: number } | null = null;
  for (const row of args.notified) {
    if (!sameSet(keys, row.ingredientsNormalized)) continue;
    const conc = strengthNumbers(row.concentrationText).some((n) => labelNumbers.includes(n));
    const form = row.formulations.some((f) => labelForms.includes(f.toUpperCase()));
    const score = (conc ? 2 : 0) + (form ? 1 : 0);
    if (!best || score > best.score || (score === best.score && row.serial < best.row.serial))
      best = { row, conc, form, score };
  }
  if (best)
    return {
      status: 'pass',
      reason: 'listed',
      row: best.row,
      concentrationMatches: best.conc,
      formulationMatches: best.form,
      missing: [],
    };
  const missing = keys.filter(
    (k) =>
      !args.notified.some((row) =>
        row.ingredientsNormalized.some((x) => ingredientEquivalent(k, x)),
      ),
  );
  return {
    status: 'unknown',
    reason: missing.length === 0 ? 'combination' : 'not_found',
    missing,
    ...none,
  };
}

/** Banned pre-mixture BRAND (List B): exact normalised equality, similarity >= 0.8, or the name inside the label text. */
export function findPremixMatch(args: {
  brandName?: string | null;
  rawText?: string | null;
  labelIngredients: string[];
  brands: PremixBrandInfo[];
}): PremixMatch | null {
  // A label brand line often carries the strength/formulation ("Ammo-phos 450 EC"): compare with and without it.
  const rawBrand = args.brandName ?? '';
  const brandCandidates = [
    normalizeName(rawBrand),
    normalizeName(rawBrand.replace(/\s*\d[\d\s.,/+%]*[A-Za-z]{0,4}\s*$/, '')),
  ].filter(Boolean);
  const text = normalizeName(args.rawText);
  const keys = ingredientKeys(args.labelIngredients);
  let best: PremixMatch | null = null;
  for (const b of args.brands) {
    const target = b.brandNormalized || normalizeName(b.brandName);
    if (!target) continue;
    const targets = [target, normalizeName(`${b.brandName} ${b.formulation ?? ''}`)];
    let similarity = 0;
    for (const c of brandCandidates)
      for (const t of targets)
        similarity = Math.max(similarity, c === t ? 1 : trigramSimilarity(c, t));
    const inText = target.length >= PREMIX_TEXT_SCAN_MIN_LENGTH && text.includes(target);
    if (inText) similarity = Math.max(similarity, 1);
    if (similarity < PREMIX_BRAND_MIN_SIMILARITY) continue;
    const overlap = b.ingredientsNormalized.filter((c) =>
      keys.some((k) => ingredientEquivalent(k, c)),
    ).length;
    const m: PremixMatch = {
      brand: b,
      similarity,
      exact: similarity === 1,
      ingredientOverlap: overlap,
      ingredientsAllMatch:
        b.ingredientsNormalized.length > 0 && overlap === b.ingredientsNormalized.length,
    };
    if (
      !best ||
      m.similarity > best.similarity ||
      (m.similarity === best.similarity && m.ingredientOverlap > best.ingredientOverlap)
    )
      best = m;
  }
  return best;
}

/** Hand-checked extra spellings/synonyms for the DPP banned list (collapsed form). */
const BANNED_ALIASES: Record<string, string[]> = {
  bhc: ['hexachlorocyclohexane', 'benzenehexachloride'],
  ddt: ['dichlorodiphenyltrichloroethane'],
  mercury: ['mercuric', 'mercurous'],
  methylparathion: ['parathionmethyl'],
};

/** All collapsed search terms for a banned-list name ("A + B" lists are searched component-wise). */
export function bannedSearchTerms(ingredient: string): string[] {
  const terms = new Set<string>();
  const parts = ingredient.split(/\s*\+\s*/);
  for (const part of parts) {
    const p = normalizeIngredient(part.replace(/\bcompounds?\b/i, ''));
    if (p) terms.add(p);
  }
  for (const t of [...terms]) for (const a of BANNED_ALIASES[t] ?? []) terms.add(a);
  return [...terms];
}

/** Collapses OCR text the same way the banned terms are collapsed. */
export function collapseForBanned(text: string): string {
  return foldVariantsInText(normalizeName(text));
}

/** "1994-09-19" -> "19 Sep 1994"; anything else is returned unchanged. */
export function formatIsoDate(value: string | null | undefined): string {
  if (!value) return '';
  const m = /^(\d{4})-(\d{2})-(\d{2})/.exec(value);
  if (!m) return value;
  const months = [
    'Jan',
    'Feb',
    'Mar',
    'Apr',
    'May',
    'Jun',
    'Jul',
    'Aug',
    'Sep',
    'Oct',
    'Nov',
    'Dec',
  ];
  return `${Number(m[3])} ${months[Number(m[2]) - 1] ?? m[2]} ${m[1]}`;
}

import {
  bannedSearchTerms,
  collapseForBanned,
  findPremixMatch,
  formatIsoDate,
  matchNotifiedList,
  type ListCoverage,
  type NotifiedProductInfo,
  type PremixBrandInfo,
} from './dpp-matching';
import { parseLabelDate, type ExtractedLabelFields } from './label-fields';
import { ingredientsMatch, normalizeName, trigramSimilarity } from './pesticide-normalize';

export {
  NOTIFIED_FUZZY_MIN_LENGTH,
  NOTIFIED_INGREDIENT_MIN_SIMILARITY,
  PREMIX_BRAND_MIN_SIMILARITY,
  PREMIX_TEXT_SCAN_MIN_LENGTH,
  type ListCoverage,
  type NotifiedProductInfo,
  type PremixBrandInfo,
} from './dpp-matching';

/* ---- Tunable thresholds (all scoring decisions live here) ---- */
/** Fewer alphanumeric characters than this means the photo could not be read. */
export const MIN_READABLE_CHARS = 25;
/** A photo with readable text but none of brand / ingredient / registration is still unreadable. */
export const MIN_USEFUL_FIELDS = 1;
/** Mean OCR confidence (0..1) below this adds a "low quality" warning. */
export const LOW_OCR_CONFIDENCE = 0.55;
/** Mean OCR confidence below this is treated as noise (e.g. a photo of something that is not a label). */
export const UNREADABLE_OCR_CONFIDENCE = 0.3;
/** Minimum trigram similarity for a registered-list brand match to count as "found". */
export const MATCH_MIN_SIMILARITY = 0.45;
/** Similarity at or above this is reported as an exact-quality match. */
export const MATCH_STRONG_SIMILARITY = 0.8;
/** Expiry within this many days is a warning. */
export const EXPIRY_SOON_DAYS = 60;
/** Price below this fraction of the reference price is "unusually cheap". */
export const PRICE_CHEAP_RATIO = 0.6;
/** Company names this similar (trigram) are considered the same company. */
export const COMPANY_MIN_SIMILARITY = 0.45;
/** Verdict cut-offs on the 0-100 risk score (higher = riskier). */
export const SCORE_SUSPICIOUS_AT = 25;
export const SCORE_HIGH_RISK_AT = 60;
/**
 * Verdict policy when the real DPP lists are loaded (listCoverage DPP_PARTIAL). The Form-16 list is a PARTIAL
 * 2005 list of ingredient+strength+formulation rows with no brands, so "not on the list" is never evidence of a
 * fake. Rules, in order: (1) banned ingredient or banned pre-mixture brand -> HIGH_RISK, score 100;
 * (2) score >= SCORE_HIGH_RISK_AT -> HIGH_RISK; (3) score >= SCORE_SUSPICIOUS_AT or any failed check
 * (e.g. expired) -> SUSPICIOUS; (4) a notified-list pass (or a matched demo/user product) with nothing failed
 * -> VERIFIED (the UI says "consistent with the DPP notified list", never "genuine"); (5) nothing confirmed
 * and nothing wrong -> SUSPICIOUS at the floor score UNCONFIRMED_SCORE, which the explanation words as
 * "could not confirm" (the verdict enum is constrained in the database, so no new value is added).
 */
export const UNCONFIRMED_SCORE = 25;
/** Risk points added per finding. */
export const POINTS = {
  productNotFound: 30,
  ingredientMismatch: 35,
  registrationMissing: 10,
  registrationMalformed: 15,
  registrationMismatch: 35,
  expiryExpired: 45,
  expiryMissing: 15,
  expirySoon: 10,
  companyMismatch: 10,
  priceCheap: 15,
  lowOcr: 5,
} as const;

export type Verdict = 'VERIFIED' | 'SUSPICIOUS' | 'HIGH_RISK' | 'UNREADABLE';
export type CheckStatus = 'pass' | 'warn' | 'fail' | 'unknown';
export type Lang = 'en' | 'ur';

export interface Check {
  code: string;
  status: CheckStatus;
  titleEn: string;
  titleUr: string;
  detailEn: string;
  detailUr: string;
}

export interface MatchedProductInfo {
  id: string;
  brandName: string;
  activeIngredient: string;
  concentration: string | null;
  company: string | null;
  registrationNo: string | null;
  referencePriceRs: number | null;
  packSize: string | null;
  isDemo: boolean;
}

export interface BannedHit {
  ingredient: string;
  reason: string | null;
  isDemo: boolean;
  /** DPP provenance (absent for demo rows). */
  notificationNumber?: string | null;
  notificationDate?: string | null;
  position?: string | null;
}

export interface RiskInput {
  inputMode: 'photo' | 'manual';
  fields: ExtractedLabelFields;
  /** Length of the OCR text (photo mode); ignored for manual entry. */
  rawText?: string;
  /** Mean OCR confidence 0..1 when the reader supplies it. */
  ocrConfidence?: number;
  match: { product: MatchedProductInfo; similarity: number } | null;
  bannedHits: BannedHit[];
  /** True when the whole reference list in the database is demo data. */
  referenceListIsDemo?: boolean;
  /** True when the real DPP lists (banned list + Form-16 notified list) are loaded. Absent/false = legacy demo behaviour. */
  dppLoaded?: boolean;
  /** The DPP Form-16 notified rows (only read when dppLoaded). */
  notified?: NotifiedProductInfo[];
  /** The DPP banned pre-mixture brands, List B (only read when dppLoaded). */
  premixBrands?: PremixBrandInfo[];
  /** Active ingredient names read from the label (mixtures already split). */
  labelIngredients?: string[];
  /** Strengths / formulations read from the label, e.g. ["1.8%"], ["EC"]. */
  labelConcentrations?: string[];
  labelFormulations?: string[];
  priceRs?: number;
  packSize?: string;
  now?: Date;
}

export interface MatchedNotified {
  productText: string;
  category: string | null;
  whoClass: string | null;
  notification: string;
}

export interface BannedMatch {
  kind: 'ingredient' | 'premix';
  name: string;
  notificationNumber: string | null;
  notificationDate: string | null;
  position?: string | null;
}

export interface DataSource {
  name: string;
  asOf: string;
  url: string;
}

export interface RiskResult {
  verdict: Verdict;
  /** Risk score 0..100; higher means riskier. 0 for UNREADABLE (no assessment was possible). */
  score: number;
  demoDataset: boolean;
  checks: Check[];
  listCoverage: ListCoverage;
  matchedNotified: MatchedNotified | null;
  bannedMatch: BannedMatch | null;
}

/** Retrieval date of the DPP lists held in the database. */
export const DPP_RETRIEVED_ON = '2026-10-23';
export const DPP_DATA_SOURCES: DataSource[] = [
  {
    name: 'DPP List of Banned Pesticides (A) and banned pre-mixtures (B), Department of Plant Protection',
    asOf: DPP_RETRIEVED_ON,
    url: 'https://plantprotection.gov.pk/services/pesticide-registration/list-of-banned-pesticides-in-pakistan/',
  },
  {
    name: 'DPP Form-16 notified products, S.R.O. 636(I)/2005 dated 22 Jun 2005 (partial list)',
    asOf: DPP_RETRIEVED_ON,
    url: 'https://plantprotection.gov.pk/services/pesticide-registration/list-of-registered-pesticides-in-pakistan/',
  },
];
export const dataSourcesFor = (coverage: ListCoverage): DataSource[] =>
  coverage === 'DPP_PARTIAL' ? DPP_DATA_SOURCES : [];

export const DISCLAIMER = {
  en: 'This is a risk screening based on a photo and a reference list, not a laboratory test. It cannot prove a product is genuine or safe. When in doubt, buy from a licensed dealer and ask your agriculture extension officer.',
  ur: 'یہ تصویر اور حوالہ فہرست پر مبنی خطرے کی جانچ ہے، لیبارٹری ٹیسٹ نہیں۔ اس سے یہ ثابت نہیں ہوتا کہ مصنوعات اصلی یا محفوظ ہے۔ شک ہو تو لائسنس یافتہ ڈیلر سے خریدیں اور اپنے زرعی توسیعی افسر سے مشورہ کریں۔',
} as const;

/** Registration numbers: 3-25 chars of letters, digits and - / . and at least one digit. */
export function isWellFormedRegistration(value: string): boolean {
  const v = value.trim();
  return /^[A-Za-z0-9][A-Za-z0-9\-/. ]{1,23}[A-Za-z0-9]$/.test(v) && /\d/.test(v);
}

/**
 * Finds banned-list ingredients mentioned in the extracted ingredient, brand or full OCR text.
 * Short names (under 5 letters, e.g. DDT) must appear as a whole word to avoid false positives.
 */
export function findBannedHits(
  texts: Array<string | null | undefined>,
  banned: Array<{
    ingredient: string;
    ingredientNormalized: string;
    reason: string | null;
    isDemo: boolean;
    notificationNumber?: string | null;
    notificationDate?: string | null;
    position?: string | null;
  }>,
): BannedHit[] {
  const joined = texts.filter(Boolean).join('\n').toLowerCase();
  const collapsed = collapseForBanned(joined);
  const escape = (v: string): string => v.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
  const hits: BannedHit[] = [];
  for (const b of banned) {
    const terms = new Set(bannedSearchTerms(b.ingredient));
    if (b.ingredientNormalized) terms.add(b.ingredientNormalized);
    let found = false;
    for (const t of terms) {
      if (!t) continue;
      if (t.length < 5) {
        // Short names (e.g. DDT, BHC) must appear as a whole word to avoid false positives.
        const word = new RegExp(`(?:^|[^\\p{L}\\p{N}])${escape(t)}(?![\\p{L}\\p{N}])`, 'u');
        found = word.test(joined);
      } else found = collapsed.includes(t);
      if (found) break;
    }
    if (found)
      hits.push({
        ingredient: b.ingredient,
        reason: b.reason,
        isDemo: b.isDemo,
        ...(b.notificationNumber !== undefined ? { notificationNumber: b.notificationNumber } : {}),
        ...(b.notificationDate !== undefined ? { notificationDate: b.notificationDate } : {}),
        ...(b.position !== undefined ? { position: b.position } : {}),
      });
  }
  return hits;
}

const chk = (
  code: string,
  status: CheckStatus,
  titleEn: string,
  titleUr: string,
  detailEn: string,
  detailUr: string,
): Check => ({ code, status, titleEn, titleUr, detailEn, detailUr });

export function evaluatePesticideRisk(input: RiskInput): RiskResult {
  const now = input.now ?? new Date();
  const f = input.fields;
  const demoDataset =
    Boolean(input.match?.product.isDemo) ||
    input.bannedHits.some((h) => h.isDemo) ||
    Boolean(input.referenceListIsDemo);
  const dpp = Boolean(input.dppLoaded);
  const listCoverage: ListCoverage = dpp ? 'DPP_PARTIAL' : 'DEMO';
  const checks: Check[] = [];

  // 1. OCR quality (photo mode only) - may short-circuit to UNREADABLE.
  if (input.inputMode === 'photo') {
    const chars = (input.rawText ?? '').replace(/[^\p{L}\p{N}]/gu, '').length;
    const usefulFields = [f.brandName, f.activeIngredient, f.registrationNo].filter(Boolean).length;
    const noise =
      input.ocrConfidence !== undefined && input.ocrConfidence < UNREADABLE_OCR_CONFIDENCE;
    if (chars < MIN_READABLE_CHARS || usefulFields < MIN_USEFUL_FIELDS || noise) {
      checks.push(
        chk(
          'ocr_quality',
          'fail',
          'Label could not be read',
          'لیبل پڑھا نہیں جا سکا',
          'Too little text was readable. Retake the photo in daylight, hold the phone steady, fill the frame with the label front and avoid glare or shadows.',
          'بہت کم تحریر پڑھی جا سکی۔ دن کی روشنی میں دوبارہ تصویر لیں، موبائل کو مستحکم رکھیں، لیبل کے سامنے والے حصے کو فریم میں بھر دیں اور چمک یا سائے سے بچیں۔',
        ),
      );
      return {
        verdict: 'UNREADABLE',
        score: 0,
        demoDataset: false,
        checks,
        listCoverage,
        matchedNotified: null,
        bannedMatch: null,
      };
    }
  }

  let score = 0;
  if (
    input.inputMode === 'photo' &&
    input.ocrConfidence !== undefined &&
    input.ocrConfidence < LOW_OCR_CONFIDENCE
  ) {
    score += POINTS.lowOcr;
    checks.push(
      chk(
        'ocr_quality',
        'warn',
        'Photo quality is low',
        'تصویر کا معیار کم ہے',
        'The text was hard to read, so some fields may be wrong. A clearer photo gives a better result.',
        'تحریر پڑھنے میں مشکل تھی، اس لیے کچھ معلومات غلط ہو سکتی ہیں۔ صاف تصویر بہتر نتیجہ دیتی ہے۔',
      ),
    );
  } else if (input.inputMode === 'photo') {
    checks.push(
      chk(
        'ocr_quality',
        'pass',
        'Label text was readable',
        'لیبل کی تحریر پڑھی جا سکی',
        'Enough text was read from the photo to run the checks.',
        'تصویر سے اتنی تحریر پڑھی گئی کہ جانچ کی جا سکے۔',
      ),
    );
  }

  const product =
    input.match && input.match.similarity >= MATCH_MIN_SIMILARITY ? input.match.product : null;
  const similarity = input.match?.similarity ?? 0;

  // 2. Product found in the registered list.
  if (product) {
    checks.push(
      chk(
        'product_registered',
        'pass',
        'Product found in the reference list',
        'مصنوعات حوالہ فہرست میں موجود ہے',
        `Matched "${product.brandName}" (${Math.round(similarity * 100)}% name similarity).`,
        `"${product.brandName}" سے مماثلت ملی (نام میں ${Math.round(similarity * 100)}٪ مشابہت)۔`,
      ),
    );
  } else if (dpp) {
    // The DPP lists hold no brand names, so an unmatched brand is unknown, not a risk signal.
    checks.push(
      chk(
        'product_registered',
        'unknown',
        'Brand not checked against the DPP lists',
        'برانڈ کا موازنہ ڈی پی پی فہرستوں سے نہیں ہو سکا',
        f.brandName
          ? `"${f.brandName}": brand names are not part of the DPP lists we hold, so the brand itself could not be looked up. See the ingredient check below.`
          : 'No brand name was read, and brand names are not part of the DPP lists we hold. See the ingredient check below.',
        f.brandName
          ? `"${f.brandName}": برانڈ کے نام ہمارے پاس موجود ڈی پی پی فہرستوں کا حصہ نہیں، اس لیے برانڈ خود تلاش نہیں ہو سکا۔ نیچے جزو کی جانچ دیکھیں۔`
          : 'برانڈ کا نام نہیں پڑھا گیا، اور برانڈ کے نام ہمارے پاس موجود ڈی پی پی فہرستوں کا حصہ نہیں۔ نیچے جزو کی جانچ دیکھیں۔',
      ),
    );
  } else if (!f.brandName) {
    score += POINTS.productNotFound;
    checks.push(
      chk(
        'product_registered',
        'unknown',
        'Brand name not read',
        'برانڈ کا نام نہیں پڑھا گیا',
        'No brand name could be read, so the product could not be looked up.',
        'برانڈ کا نام نہیں پڑھا جا سکا، اس لیے مصنوعات تلاش نہیں ہو سکی۔',
      ),
    );
  } else {
    score += POINTS.productNotFound;
    checks.push(
      chk(
        'product_registered',
        'warn',
        'Product not found in the reference list',
        'مصنوعات حوالہ فہرست میں نہیں ملی',
        `"${f.brandName}" was not found in the reference list. It may be unregistered, a different spelling, or missing from the list.`,
        `"${f.brandName}" حوالہ فہرست میں نہیں ملا۔ یہ غیر رجسٹرڈ ہو سکتا ہے، ہجے مختلف ہو سکتے ہیں، یا فہرست میں شامل نہ ہو۔`,
      ),
    );
  }

  // 3. Active ingredient matches the registered product.
  if (product && f.activeIngredient) {
    if (ingredientsMatch(f.activeIngredient, product.activeIngredient)) {
      checks.push(
        chk(
          'ingredient_match',
          'pass',
          'Active ingredient matches',
          'فعال جزو مطابقت رکھتا ہے',
          `The label ingredient "${f.activeIngredient}" matches the listed "${product.activeIngredient}".`,
          `لیبل کا جزو "${f.activeIngredient}" فہرست کے "${product.activeIngredient}" سے مطابقت رکھتا ہے۔`,
        ),
      );
    } else {
      score += POINTS.ingredientMismatch;
      checks.push(
        chk(
          'ingredient_match',
          'fail',
          'Active ingredient does not match',
          'فعال جزو مطابقت نہیں رکھتا',
          `The label says "${f.activeIngredient}" but the listed product contains "${product.activeIngredient}".`,
          `لیبل پر "${f.activeIngredient}" لکھا ہے جبکہ فہرست میں اس مصنوعات کا جزو "${product.activeIngredient}" ہے۔`,
        ),
      );
    }
  } else {
    checks.push(
      chk(
        'ingredient_match',
        'unknown',
        'Active ingredient not compared',
        'فعال جزو کا موازنہ نہیں ہو سکا',
        'Either the ingredient was not read or the product was not found, so they could not be compared.',
        'یا تو جزو نہیں پڑھا گیا یا مصنوعات نہیں ملی، اس لیے موازنہ ممکن نہیں ہوا۔',
      ),
    );
  }

  // 3b. DPP Form-16 notified list (only when the real DPP lists are loaded).
  let matchedNotified: MatchedNotified | null = null;
  let notifiedPass = false;
  const labelIngredients =
    input.labelIngredients ?? (f.activeIngredient ? [f.activeIngredient] : []);
  if (dpp) {
    const nm = matchNotifiedList({
      labelIngredients,
      labelConcentrations: input.labelConcentrations ?? (f.concentration ? [f.concentration] : []),
      labelFormulations: input.labelFormulations ?? (f.formulation ? [f.formulation] : []),
      notified: input.notified ?? [],
    });
    const shown = labelIngredients.join(' + ');
    if (nm.status === 'pass' && nm.row) {
      notifiedPass = true;
      matchedNotified = {
        productText: nm.row.productText,
        category: nm.row.category,
        whoClass: nm.row.whoClass,
        notification: nm.row.notification,
      };
      const extra = [
        nm.row.category ? `category ${nm.row.category}` : null,
        nm.row.whoClass ? `WHO class ${nm.row.whoClass}` : null,
      ]
        .filter(Boolean)
        .join(', ');
      const strongEn =
        nm.concentrationMatches || nm.formulationMatches
          ? ` The ${
              nm.concentrationMatches && nm.formulationMatches
                ? 'strength and formulation'
                : nm.formulationMatches
                  ? 'formulation'
                  : 'strength'
            } on the label also matches.`
          : ' The strength and formulation on the label could not be matched to this row.';
      const strongUr =
        nm.concentrationMatches || nm.formulationMatches
          ? ' لیبل پر درج مقدار/فارمولیشن بھی مطابقت رکھتی ہے۔'
          : ' لیبل کی مقدار اور فارمولیشن اس اندراج سے مطابقت نہیں کر سکی۔';
      checks.push(
        chk(
          'ingredient_notified',
          'pass',
          'Consistent with the DPP notified list',
          'ڈی پی پی کی مطلع شدہ فہرست سے مطابقت',
          `The label ingredient (${shown}) matches a product on the DPP notified list: "${nm.row.productText}"${extra ? ` (${extra})` : ''}, ${nm.row.notification}.${strongEn} This is a consistency check on a partial 2005 list, not proof of registration.`,
          `لیبل کا جزو (${shown}) ڈی پی پی کی مطلع شدہ فہرست کے اندراج "${nm.row.productText}" سے مطابقت رکھتا ہے${nm.row.whoClass ? ` (ڈبلیو ایچ او کلاس ${nm.row.whoClass})` : ''}، ${nm.row.notification}۔${strongUr} یہ 2005 کی جزوی فہرست سے مطابقت کی جانچ ہے، رجسٹریشن کا ثبوت نہیں۔`,
        ),
      );
    } else if (nm.reason === 'no_ingredient') {
      checks.push(
        chk(
          'ingredient_notified',
          'unknown',
          'Ingredient not read',
          'جزو نہیں پڑھا گیا',
          'No active ingredient could be read, so it could not be compared with the DPP notified list.',
          'کوئی فعال جزو نہیں پڑھا جا سکا، اس لیے ڈی پی پی کی مطلع شدہ فہرست سے موازنہ نہیں ہو سکا۔',
        ),
      );
    } else if (nm.reason === 'combination') {
      checks.push(
        chk(
          'ingredient_notified',
          'unknown',
          'Combination not found on the DPP list',
          'یہ امتزاج ڈی پی پی فہرست میں نہیں ملا',
          `Each ingredient (${shown}) appears on the partial 2005 DPP list on its own, but this combination was not found as a notified product; this does not mean it is unregistered. Check with the dealer or the DPP.`,
          `ہر جزو (${shown}) 2005 کی جزوی ڈی پی پی فہرست میں الگ سے موجود ہے لیکن یہ امتزاج مطلع شدہ مصنوعات کے طور پر نہیں ملا؛ اس کا مطلب یہ نہیں کہ یہ غیر رجسٹرڈ ہے۔ ڈیلر یا ڈی پی پی سے تصدیق کریں۔`,
        ),
      );
    } else {
      checks.push(
        chk(
          'ingredient_notified',
          'unknown',
          'Not found on the partial DPP list',
          'جزوی ڈی پی پی فہرست میں نہیں ملا',
          `"${shown}" was not found on the partial 2005 DPP list we hold; this does not mean it is unregistered. Check with the dealer or the DPP.`,
          `"${shown}" ہمارے پاس موجود 2005 کی جزوی ڈی پی پی فہرست میں نہیں ملا؛ اس کا مطلب یہ نہیں کہ یہ غیر رجسٹرڈ ہے۔ ڈیلر یا ڈی پی پی سے تصدیق کریں۔`,
        ),
      );
    }
  }

  // 4. Banned ingredient list.
  if (input.bannedHits.length > 0) {
    const names = input.bannedHits.map((h) => h.ingredient).join(', ');
    const official = input.bannedHits.filter((h) => h.notificationNumber || h.position);
    if (official.length > 0) {
      const describe = (h: BannedHit): string =>
        `${h.ingredient}${
          h.notificationNumber
            ? ` (${h.notificationNumber}${h.notificationDate ? `, ${formatIsoDate(h.notificationDate)}` : ''})`
            : ''
        }${h.position ? ` - ${h.position}` : ''}`;
      const describeUr = (h: BannedHit): string =>
        `${h.ingredient}${
          h.notificationNumber
            ? ` (${h.notificationNumber}${h.notificationDate ? `، ${formatIsoDate(h.notificationDate)}` : ''})`
            : ''
        }`;
      checks.push(
        chk(
          'banned_ingredient',
          'fail',
          'Listed in the DPP banned pesticides list',
          'ڈی پی پی کی ممنوعہ زرعی ادویات کی فہرست میں شامل',
          `Listed in the DPP banned pesticides list: ${official.map(describe).join('; ')}. Do not buy or use this product.`,
          `ڈی پی پی کی ممنوعہ زرعی ادویات کی فہرست میں شامل: ${official.map(describeUr).join('؛ ')}۔ یہ مصنوعات نہ خریدیں اور نہ استعمال کریں۔`,
        ),
      );
    } else
      checks.push(
        chk(
          'banned_ingredient',
          'fail',
          'Ingredient on the banned list',
          'ممنوعہ فہرست میں شامل جزو',
          `The label mentions ${names}, which appears on the banned or restricted ingredient list. Do not buy or use this product.`,
          `لیبل پر ${names} کا ذکر ہے جو ممنوعہ یا محدود اجزا کی فہرست میں شامل ہے۔ یہ مصنوعات نہ خریدیں اور نہ استعمال کریں۔`,
        ),
      );
  } else {
    checks.push(
      chk(
        'banned_ingredient',
        'pass',
        'No banned ingredient found',
        'کوئی ممنوعہ جزو نہیں ملا',
        'None of the ingredients read matches the banned list.',
        'پڑھے گئے اجزا میں سے کوئی ممنوعہ فہرست سے نہیں ملتا۔',
      ),
    );
  }

  // 4b. Banned pre-mixture brands (DPP List B), only when the real DPP lists are loaded.
  const premix = dpp
    ? findPremixMatch({
        brandName: f.brandName,
        rawText: input.rawText,
        labelIngredients,
        brands: input.premixBrands ?? [],
      })
    : null;
  if (dpp) {
    if (premix) {
      const b = premix.brand;
      const pct = Math.round(premix.similarity * 100);
      const same = premix.exact ? '' : ` (${pct}% name similarity)`;
      const comp = premix.ingredientsAllMatch
        ? ' The ingredients on the label also match the banned mixture.'
        : premix.ingredientOverlap > 0
          ? ' Some ingredients on the label match the banned mixture.'
          : '';
      const compUr = premix.ingredientsAllMatch
        ? ' لیبل کے اجزا بھی ممنوعہ آمیزے سے مطابقت رکھتے ہیں۔'
        : premix.ingredientOverlap > 0
          ? ' لیبل کے کچھ اجزا ممنوعہ آمیزے سے مطابقت رکھتے ہیں۔'
          : '';
      const when = b.notificationDate ? `, ${formatIsoDate(b.notificationDate)}` : '';
      const label = `${b.brandName}${b.formulation ? ' ' + b.formulation : ''}`;
      checks.push(
        chk(
          'banned_premix_brand',
          'fail',
          'Banned pre-mixture brand',
          'ممنوعہ پری مکسچر برانڈ',
          `"${label}"${same} is listed as a banned pre-mixture (${b.notificationNumber}${when})${b.commonName ? `: ${b.commonName}` : ''}.${comp} Do not buy or use this product.`,
          `"${label}"${same} ممنوعہ پری مکسچر کے طور پر درج ہے (${b.notificationNumber}${when})${b.commonName ? `: ${b.commonName}` : ''}۔${compUr} یہ مصنوعات نہ خریدیں اور نہ استعمال کریں۔`,
        ),
      );
    } else {
      checks.push(
        chk(
          'banned_premix_brand',
          'pass',
          'Not a banned pre-mixture brand',
          'ممنوعہ پری مکسچر برانڈ نہیں',
          'The brand does not match any banned pre-mixture brand on the DPP list (List B).',
          'برانڈ ڈی پی پی کی فہرست (بی) کے کسی ممنوعہ پری مکسچر برانڈ سے نہیں ملتا۔',
        ),
      );
    }
  }

  // 5. Registration number.
  if (!f.registrationNo) {
    score += POINTS.registrationMissing;
    checks.push(
      chk(
        'registration_number',
        'warn',
        'Registration number not found',
        'رجسٹریشن نمبر نہیں ملا',
        'No registration number was read. Registered products normally print one on the label.',
        'کوئی رجسٹریشن نمبر نہیں پڑھا گیا۔ رجسٹرڈ مصنوعات پر عموماً لیبل پر نمبر چھپا ہوتا ہے۔',
      ),
    );
  } else if (!isWellFormedRegistration(f.registrationNo)) {
    score += POINTS.registrationMalformed;
    checks.push(
      chk(
        'registration_number',
        'fail',
        'Registration number looks malformed',
        'رجسٹریشن نمبر درست شکل میں نہیں',
        `"${f.registrationNo}" does not look like a valid registration number.`,
        `"${f.registrationNo}" درست رجسٹریشن نمبر نہیں لگتا۔`,
      ),
    );
  } else if (product?.registrationNo) {
    if (normalizeName(product.registrationNo) === normalizeName(f.registrationNo)) {
      checks.push(
        chk(
          'registration_number',
          'pass',
          'Registration number matches',
          'رجسٹریشن نمبر مطابقت رکھتا ہے',
          'The registration number on the label matches the reference list.',
          'لیبل کا رجسٹریشن نمبر حوالہ فہرست سے مطابقت رکھتا ہے۔',
        ),
      );
    } else {
      score += POINTS.registrationMismatch;
      checks.push(
        chk(
          'registration_number',
          'fail',
          'Registration number does not match',
          'رجسٹریشن نمبر مطابقت نہیں رکھتا',
          `The label shows "${f.registrationNo}" but the reference list has "${product.registrationNo}" for this product.`,
          `لیبل پر "${f.registrationNo}" ہے جبکہ حوالہ فہرست میں اس مصنوعات کا نمبر "${product.registrationNo}" ہے۔`,
        ),
      );
    }
  } else {
    checks.push(
      chk(
        'registration_number',
        'pass',
        'Registration number present',
        'رجسٹریشن نمبر موجود ہے',
        `A well-formed registration number ("${f.registrationNo}") is printed. It could not be confirmed against the list.`,
        `درست شکل کا رجسٹریشن نمبر ("${f.registrationNo}") چھپا ہے۔ فہرست سے اس کی تصدیق نہیں ہو سکی۔`,
      ),
    );
  }

  // 6. Expiry.
  const expiry = parseLabelDate(f.expiryDate);
  if (!f.expiryDate || !expiry) {
    score += POINTS.expiryMissing;
    checks.push(
      chk(
        'expiry_date',
        'warn',
        f.expiryDate ? 'Expiry date unclear' : 'Expiry date not found',
        f.expiryDate ? 'میعاد ختم ہونے کی تاریخ واضح نہیں' : 'میعاد ختم ہونے کی تاریخ نہیں ملی',
        'No usable expiry date was found. Check the pack for a printed expiry before buying.',
        'کوئی قابل استعمال تاریخ نہیں ملی۔ خریدنے سے پہلے پیک پر چھپی میعاد دیکھ لیں۔',
      ),
    );
  } else if (expiry.getTime() < now.getTime()) {
    score += POINTS.expiryExpired;
    checks.push(
      chk(
        'expiry_date',
        'fail',
        'Product is expired',
        'مصنوعات کی میعاد ختم ہو چکی ہے',
        `The expiry date (${f.expiryDate}) has passed. Do not use expired pesticide.`,
        `میعاد کی تاریخ (${f.expiryDate}) گزر چکی ہے۔ زائد المیعاد زرعی دوا استعمال نہ کریں۔`,
      ),
    );
  } else if (expiry.getTime() - now.getTime() < EXPIRY_SOON_DAYS * 86_400_000) {
    score += POINTS.expirySoon;
    checks.push(
      chk(
        'expiry_date',
        'warn',
        'Expires soon',
        'میعاد جلد ختم ہونے والی ہے',
        `The expiry date (${f.expiryDate}) is within ${EXPIRY_SOON_DAYS} days.`,
        `میعاد کی تاریخ (${f.expiryDate}) ${EXPIRY_SOON_DAYS} دن کے اندر ہے۔`,
      ),
    );
  } else {
    checks.push(
      chk(
        'expiry_date',
        'pass',
        'Expiry date is valid',
        'میعاد کی تاریخ درست ہے',
        `The expiry date (${f.expiryDate}) is in the future.`,
        `میعاد کی تاریخ (${f.expiryDate}) آنے والے وقت میں ہے۔`,
      ),
    );
  }

  // 7. Company consistency (warning only).
  if (product?.company && f.company) {
    const a = normalizeName(product.company);
    const b = normalizeName(f.company);
    const same =
      a === b ||
      a.includes(b) ||
      b.includes(a) ||
      trigramSimilarity(a, b) >= COMPANY_MIN_SIMILARITY;
    if (same) {
      checks.push(
        chk(
          'company_consistency',
          'pass',
          'Company is consistent',
          'کمپنی کا نام مطابقت رکھتا ہے',
          'The company on the label is consistent with the reference list.',
          'لیبل پر کمپنی کا نام حوالہ فہرست سے مطابقت رکھتا ہے۔',
        ),
      );
    } else {
      score += POINTS.companyMismatch;
      checks.push(
        chk(
          'company_consistency',
          'warn',
          'Company differs from the list',
          'کمپنی کا نام فہرست سے مختلف ہے',
          `The label names "${f.company}" but the list shows "${product.company}" for this product.`,
          `لیبل پر "${f.company}" لکھا ہے جبکہ فہرست میں "${product.company}" ہے۔`,
        ),
      );
    }
  } else {
    checks.push(
      chk(
        'company_consistency',
        'unknown',
        'Company not compared',
        'کمپنی کا موازنہ نہیں ہو سکا',
        'The company was not read or the list has no company for this product.',
        'کمپنی کا نام نہیں پڑھا گیا یا فہرست میں اس مصنوعات کی کمپنی درج نہیں۔',
      ),
    );
  }

  // 8. Price sanity.
  const sameSize =
    !input.packSize ||
    !product?.packSize ||
    normalizeName(input.packSize) === normalizeName(product.packSize);
  if (input.priceRs !== undefined && product?.referencePriceRs && sameSize) {
    if (input.priceRs < product.referencePriceRs * PRICE_CHEAP_RATIO) {
      score += POINTS.priceCheap;
      checks.push(
        chk(
          'price_sanity',
          'warn',
          'Unusually cheap',
          'غیر معمولی طور پر سستا',
          `Rs ${input.priceRs} is far below the reference price of about Rs ${product.referencePriceRs}. Very cheap pesticide is often counterfeit.`,
          `روپے ${input.priceRs} حوالہ قیمت (تقریباً روپے ${product.referencePriceRs}) سے بہت کم ہے۔ بہت سستی زرعی دوا اکثر جعلی ہوتی ہے۔`,
        ),
      );
    } else {
      checks.push(
        chk(
          'price_sanity',
          'pass',
          'Price looks reasonable',
          'قیمت مناسب لگتی ہے',
          'The price is not unusually low compared with the reference price.',
          'قیمت حوالہ قیمت کے مقابلے میں غیر معمولی کم نہیں۔',
        ),
      );
    }
  } else {
    checks.push(
      chk(
        'price_sanity',
        'unknown',
        'Price not compared',
        'قیمت کا موازنہ نہیں ہو سکا',
        'No price was given, there is no reference price, or the pack sizes differ.',
        'قیمت نہیں دی گئی، حوالہ قیمت موجود نہیں، یا پیک کا سائز مختلف ہے۔',
      ),
    );
  }

  // Verdict.
  score = Math.min(100, score);
  let verdict: Verdict;
  const anyFail = checks.some((c) => c.status === 'fail');
  if (input.bannedHits.length > 0 || premix) {
    verdict = 'HIGH_RISK';
    score = 100;
  } else if (score >= SCORE_HIGH_RISK_AT) verdict = 'HIGH_RISK';
  else if (score >= SCORE_SUSPICIOUS_AT || anyFail) verdict = 'SUSPICIOUS';
  else if (dpp) {
    // Real DPP lists: a notified-list pass (or a matched demo/user product) is "consistent"; nothing confirmed is
    // only "could not confirm" (SUSPICIOUS at the floor score, worded neutrally by composeExplanation).
    if (product || notifiedPass) verdict = 'VERIFIED';
    else {
      verdict = 'SUSPICIOUS';
      score = Math.max(score, UNCONFIRMED_SCORE);
    }
  } else if (!product) verdict = 'SUSPICIOUS';
  else verdict = 'VERIFIED';
  if (verdict === 'SUSPICIOUS') score = Math.max(score, SCORE_SUSPICIOUS_AT);

  const firstOfficial = input.bannedHits.find((h) => h.notificationNumber || h.position);
  const firstHit = firstOfficial ?? input.bannedHits[0];
  const bannedMatch: BannedMatch | null = premix
    ? {
        kind: 'premix',
        name: `${premix.brand.brandName}${premix.brand.formulation ? ' ' + premix.brand.formulation : ''}`,
        notificationNumber: premix.brand.notificationNumber,
        notificationDate: premix.brand.notificationDate,
      }
    : firstHit
      ? {
          kind: 'ingredient',
          name: firstHit.ingredient,
          notificationNumber: firstHit.notificationNumber ?? null,
          notificationDate: firstHit.notificationDate ?? null,
          ...(firstHit.position ? { position: firstHit.position } : {}),
        }
      : null;

  return { verdict, score, demoDataset, checks, listCoverage, matchedNotified, bannedMatch };
}

/** Template-only narrative (no model involved) in the requested language. */
export function composeExplanation(result: RiskResult, lang: Lang): string {
  const ur = lang === 'ur';
  const demo = result.demoDataset;
  const problems = result.checks.filter((c) => c.status === 'fail' || c.status === 'warn');
  const top = problems
    .sort((a, b) => (a.status === b.status ? 0 : a.status === 'fail' ? -1 : 1))
    .slice(0, 2)
    .map((c) => (ur ? c.titleUr : c.titleEn));
  const join = (xs: string[]): string => xs.join(ur ? '؛ ' : '; ');

  let first: string;
  switch (result.verdict) {
    case 'UNREADABLE':
      first = ur
        ? 'لیبل کی تصویر سے اتنی تحریر نہیں پڑھی جا سکی کہ جانچ ہو سکے۔'
        : 'The label photo did not contain enough readable text to screen the product.';
      return ur
        ? `${first} روشنی میں، مستحکم ہاتھ سے لیبل کے سامنے والے حصے کی نئی تصویر لیں۔ یہ صرف خطرے کی جانچ ہے، لیبارٹری ٹیسٹ نہیں۔`
        : `${first} Please retake the photo in good light with a steady hand, filling the frame with the front of the label. This is a risk screening, not a lab test.`;
    case 'HIGH_RISK': {
      const bm = result.bannedMatch;
      const ref = bm?.notificationNumber ? ` (${bm.name}, ${bm.notificationNumber})` : '';
      first = bm
        ? bm.kind === 'premix'
          ? ur
            ? `یہ مصنوعات ڈی پی پی کی ممنوعہ پری مکسچر فہرست میں شامل ہے${ref}۔`
            : `This product is listed as a banned pre-mixture in the DPP list${ref}.`
          : ur
            ? `اس میں ایسا جزو ہے جو ڈی پی پی کی ممنوعہ زرعی ادویات کی فہرست میں شامل ہے${ref}۔`
            : `Listed in the DPP banned pesticides list${ref}.`
        : ur
          ? 'اس مصنوعات میں سنگین خطرے کی علامات ملی ہیں۔'
          : 'This product shows serious risk signs.';
      break;
    }
    case 'SUSPICIOUS':
      if (result.listCoverage === 'DPP_PARTIAL' && problems.length === 0) {
        first = ur
          ? 'ہم اس مصنوعات کی تصدیق ہمارے پاس موجود 2005 کی جزوی ڈی پی پی فہرست سے نہیں کر سکے۔ اس کا مطلب یہ نہیں کہ یہ جعلی یا غیر رجسٹرڈ ہے؛ ڈیلر سے رجسٹریشن کی تفصیل مانگیں اور ڈی پی پی سے تصدیق کریں۔'
          : 'We could not confirm this product on the partial 2005 DPP list we hold. This does not mean it is fake or unregistered; ask the dealer for the registration details and check with the DPP.';
      } else
        first = ur
          ? 'اس مصنوعات میں کچھ مشکوک باتیں ملی ہیں۔'
          : 'This product shows some suspicious signs.';
      break;
    default:
      if (result.listCoverage === 'DPP_PARTIAL' && !demo) {
        first = ur
          ? 'جانچ میں کوئی نمایاں مسئلہ نہیں ملا اور یہ ڈی پی پی کی مطلع شدہ فہرست (2005 کی جزوی فہرست) سے مطابقت رکھتی ہے۔ یہ رجسٹریشن کی جانچ نہیں۔'
          : 'No major problem was found and the label is consistent with the DPP notified list (a partial 2005 list; this is not a registration check).';
        break;
      }
      first = demo
        ? ur
          ? 'جانچ میں کوئی نمایاں مسئلہ نہیں ملا اور یہ ڈیمو فہرست سے مطابقت رکھتی ہے۔'
          : 'No major problem was found and the product is consistent with the DEMO list.'
        : ur
          ? 'جانچ میں کوئی نمایاں مسئلہ نہیں ملا اور یہ حوالہ فہرست سے مطابقت رکھتی ہے۔'
          : 'No major problem was found and the product is consistent with the reference list.';
  }
  const unconfirmed =
    result.verdict === 'SUSPICIOUS' && result.listCoverage === 'DPP_PARTIAL' && top.length === 0;
  const second = unconfirmed
    ? ''
    : top.length
      ? ur
        ? `بنیادی نکات: ${join(top)}۔`
        : `Main points: ${join(top)}.`
      : ur
        ? 'تمام دستیاب جانچیں کامیاب رہیں۔'
        : 'All the checks that could be run passed.';
  const third = ur
    ? 'یہ صرف خطرے کی جانچ ہے، لیبارٹری ٹیسٹ نہیں؛ خریداری سے پہلے لائسنس یافتہ ڈیلر یا زرعی توسیعی افسر سے تصدیق کریں۔'
    : 'This is a risk screening, not a lab test; confirm with a licensed dealer or your agriculture extension officer before buying or using it.';
  return [first, second, third].filter(Boolean).join(' ');
}

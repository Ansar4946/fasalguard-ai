/* eslint-disable @typescript-eslint/explicit-function-return-type */
import {
  composeExplanation,
  DISCLAIMER,
  evaluatePesticideRisk,
  findBannedHits,
  isWellFormedRegistration,
  type MatchedProductInfo,
  type RiskInput,
} from '../src/domain/pesticide-check/pesticide-risk.engine';

const NOW = new Date('2026-10-22T00:00:00Z');
const product = (over: Partial<MatchedProductInfo> = {}): MatchedProductInfo => ({
  id: 'p1',
  brandName: 'DEMO Imidacloprid 20% SL',
  activeIngredient: 'Imidacloprid',
  concentration: '20%',
  company: 'Demo Agro Pvt Ltd',
  registrationNo: null,
  referencePriceRs: null,
  packSize: null,
  isDemo: true,
  ...over,
});
const TEXT = 'DEMO Imidacloprid 20% SL Insecticide Reg No 1234/2020 Exp 03/2028 net 250 ml';
const base = (over: Partial<RiskInput> = {}): RiskInput => ({
  inputMode: 'photo',
  rawText: TEXT,
  fields: {
    brandName: 'DEMO Imidacloprid 20% SL',
    activeIngredient: 'Imidacloprid',
    registrationNo: '1234/2020',
    expiryDate: '03/2028',
    company: 'Demo Agro Pvt Ltd',
  },
  match: { product: product(), similarity: 0.95 },
  bannedHits: [],
  now: NOW,
  ...over,
});
const status = (r: ReturnType<typeof evaluatePesticideRisk>, code: string) =>
  r.checks.find((c) => c.code === code)?.status;

describe('pesticide risk engine', () => {
  it('a clean, fully matched label is VERIFIED with a low risk score', () => {
    const r = evaluatePesticideRisk(base());
    expect(r.verdict).toBe('VERIFIED');
    expect(r.score).toBeLessThan(25);
    expect(r.checks.map((c) => c.code)).toEqual([
      'ocr_quality',
      'product_registered',
      'ingredient_match',
      'banned_ingredient',
      'registration_number',
      'expiry_date',
      'company_consistency',
      'price_sanity',
    ]);
    expect(status(r, 'product_registered')).toBe('pass');
    expect(status(r, 'ingredient_match')).toBe('pass');
  });

  it('product not found is a warning and at least SUSPICIOUS', () => {
    const r = evaluatePesticideRisk(base({ match: null }));
    expect(status(r, 'product_registered')).toBe('warn');
    expect(status(r, 'ingredient_match')).toBe('unknown');
    expect(r.verdict).toBe('SUSPICIOUS');
  });

  it('a weak fuzzy match below the similarity threshold counts as not found', () => {
    const r = evaluatePesticideRisk(base({ match: { product: product(), similarity: 0.3 } }));
    expect(status(r, 'product_registered')).toBe('warn');
  });

  it('active ingredient mismatch fails and raises the verdict', () => {
    const r = evaluatePesticideRisk(
      base({ fields: { ...base().fields, activeIngredient: 'Mancozeb' } }),
    );
    expect(status(r, 'ingredient_match')).toBe('fail');
    expect(r.verdict).not.toBe('VERIFIED');
  });

  it('a banned ingredient forces HIGH_RISK at score 100 regardless of everything else', () => {
    const r = evaluatePesticideRisk(
      base({ bannedHits: [{ ingredient: 'Endosulfan', reason: 'x', isDemo: true }] }),
    );
    expect(status(r, 'banned_ingredient')).toBe('fail');
    expect(r.verdict).toBe('HIGH_RISK');
    expect(r.score).toBe(100);
  });

  it('registration number: missing warns, malformed fails, mismatch with DB fails, match passes', () => {
    const noReg = evaluatePesticideRisk(
      base({ fields: { ...base().fields, registrationNo: undefined } }),
    );
    expect(status(noReg, 'registration_number')).toBe('warn');
    const bad = evaluatePesticideRisk(
      base({ fields: { ...base().fields, registrationNo: 'ABC' } }),
    );
    expect(status(bad, 'registration_number')).toBe('fail');
    const mismatch = evaluatePesticideRisk(
      base({ match: { product: product({ registrationNo: '999/2019' }), similarity: 0.95 } }),
    );
    expect(status(mismatch, 'registration_number')).toBe('fail');
    const same = evaluatePesticideRisk(
      base({ match: { product: product({ registrationNo: '1234/2020' }), similarity: 0.95 } }),
    );
    expect(status(same, 'registration_number')).toBe('pass');
    expect(isWellFormedRegistration('1234/2020')).toBe(true);
    expect(isWellFormedRegistration('no digits')).toBe(false);
  });

  it('expiry: past fails, within 60 days warns, missing warns, far future passes', () => {
    const expired = evaluatePesticideRisk(
      base({ fields: { ...base().fields, expiryDate: '01/2020' } }),
    );
    expect(status(expired, 'expiry_date')).toBe('fail');
    expect(expired.verdict).not.toBe('VERIFIED');
    const soon = evaluatePesticideRisk(
      base({ fields: { ...base().fields, expiryDate: '11/2026' } }),
    );
    expect(status(soon, 'expiry_date')).toBe('warn');
    const missing = evaluatePesticideRisk(
      base({ fields: { ...base().fields, expiryDate: undefined } }),
    );
    expect(status(missing, 'expiry_date')).toBe('warn');
    expect(status(evaluatePesticideRisk(base()), 'expiry_date')).toBe('pass');
  });

  it('company mismatch is only a warning; same company passes', () => {
    const r = evaluatePesticideRisk(
      base({ fields: { ...base().fields, company: 'Totally Other Industries' } }),
    );
    expect(status(r, 'company_consistency')).toBe('warn');
    expect(status(evaluatePesticideRisk(base()), 'company_consistency')).toBe('pass');
  });

  it('price below 60% of the reference warns "unusually cheap"; otherwise passes; unknown without reference', () => {
    const withRef = (priceRs: number) =>
      evaluatePesticideRisk(
        base({
          priceRs,
          match: { product: product({ referencePriceRs: 1000 }), similarity: 0.95 },
        }),
      );
    const cheap = withRef(500);
    expect(status(cheap, 'price_sanity')).toBe('warn');
    expect(cheap.checks.find((c) => c.code === 'price_sanity')!.titleEn).toMatch(/cheap/i);
    expect(status(withRef(900), 'price_sanity')).toBe('pass');
    expect(status(evaluatePesticideRisk(base({ priceRs: 100 })), 'price_sanity')).toBe('unknown');
  });

  it('too little text is UNREADABLE with a retake tip', () => {
    const r = evaluatePesticideRisk(base({ rawText: 'x1 ~~', fields: {}, match: null }));
    expect(r.verdict).toBe('UNREADABLE');
    expect(r.checks).toHaveLength(1);
    expect(r.checks[0]!.detailEn).toMatch(/retake/i);
    expect(composeExplanation(r, 'en')).toMatch(/retake/i);
  });

  it('readable text with no brand, ingredient or registration is also UNREADABLE', () => {
    const r = evaluatePesticideRisk(
      base({ rawText: 'lorem ipsum dolor sit amet consectetur', fields: {}, match: null }),
    );
    expect(r.verdict).toBe('UNREADABLE');
  });

  it('manual mode skips the OCR check', () => {
    const r = evaluatePesticideRisk({
      inputMode: 'manual',
      fields: { brandName: 'DEMO Imidacloprid 20% SL' },
      match: { product: product(), similarity: 1 },
      bannedHits: [],
      now: NOW,
    });
    expect(r.checks.find((c) => c.code === 'ocr_quality')).toBeUndefined();
    expect(r.verdict).not.toBe('UNREADABLE');
  });

  it('demoDataset is true for demo matches, demo banned rows or a demo-only reference list', () => {
    expect(evaluatePesticideRisk(base()).demoDataset).toBe(true);
    const official = base({ match: { product: product({ isDemo: false }), similarity: 0.95 } });
    expect(evaluatePesticideRisk(official).demoDataset).toBe(false);
    expect(
      evaluatePesticideRisk({
        ...official,
        bannedHits: [{ ingredient: 'DDT', reason: null, isDemo: true }],
      }).demoDataset,
    ).toBe(true);
    expect(evaluatePesticideRisk({ ...official, referenceListIsDemo: true }).demoDataset).toBe(
      true,
    );
  });

  it('low OCR confidence adds a warning without changing a clean verdict', () => {
    const r = evaluatePesticideRisk(base({ ocrConfidence: 0.45 }));
    expect(status(r, 'ocr_quality')).toBe('warn');
    expect(r.verdict).toBe('VERIFIED');
    // Garbage-level confidence (e.g. a photo that is not a label) is UNREADABLE even with some characters.
    expect(evaluatePesticideRisk(base({ ocrConfidence: 0.2 })).verdict).toBe('UNREADABLE');
  });

  it('explanations are templated, bilingual, mention DEMO list and never say genuine', () => {
    const ok = evaluatePesticideRisk(base());
    const en = composeExplanation(ok, 'en');
    expect(en).toMatch(/DEMO list/);
    expect(en).not.toMatch(/genuine/i);
    expect(en).toMatch(/not a lab test/i);
    const ur = composeExplanation(ok, 'ur');
    expect(ur).toMatch(/[؀-ۿ]/);
    expect(ur).not.toMatch(/genuine/i);
    expect(composeExplanation(evaluatePesticideRisk(base({ match: null })), 'en')).toMatch(
      /Main points/,
    );
  });

  it('every check carries real Urdu script and the disclaimers are bilingual', () => {
    const r = evaluatePesticideRisk(
      base({
        match: null,
        bannedHits: [{ ingredient: 'DDT', reason: null, isDemo: true }],
        fields: { ...base().fields, expiryDate: '01/2020', registrationNo: 'ABC' },
      }),
    );
    for (const c of r.checks) {
      expect(c.titleUr).toMatch(/[؀-ۿ]/);
      expect(c.detailUr).toMatch(/[؀-ۿ]/);
    }
    expect(DISCLAIMER.en).toMatch(/not a laboratory test/);
    expect(DISCLAIMER.ur).toMatch(/[؀-ۿ]/);
  });
});

describe('findBannedHits', () => {
  const banned = [
    { ingredient: 'DDT', ingredientNormalized: 'ddt', reason: null, isDemo: true },
    { ingredient: 'Endosulfan', ingredientNormalized: 'endosulfan', reason: 'r', isDemo: true },
  ];
  it('finds names in free text and respects word boundaries for short names', () => {
    expect(findBannedHits(['Active: Endosulfan 35% EC'], banned).map((h) => h.ingredient)).toEqual([
      'Endosulfan',
    ]);
    expect(findBannedHits(['DDT dust'], banned).map((h) => h.ingredient)).toEqual(['DDT']);
    expect(findBannedHits(['additional ddtx notes'], banned)).toHaveLength(0);
    expect(findBannedHits(['Imidacloprid', null, undefined], banned)).toHaveLength(0);
  });
  it('finds a name split by OCR spacing or punctuation', () => {
    expect(findBannedHits(['Endo-sulfan'], banned)).toHaveLength(1);
  });
});

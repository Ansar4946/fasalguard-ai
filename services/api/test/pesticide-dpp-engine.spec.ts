/* eslint-disable @typescript-eslint/explicit-function-return-type */
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import {
  composeExplanation,
  dataSourcesFor,
  evaluatePesticideRisk,
  findBannedHits,
  UNCONFIRMED_SCORE,
  type RiskInput,
} from '../src/domain/pesticide-check/pesticide-risk.engine';
import { parseNotifiedProduct } from '../src/domain/pesticide-check/dpp-parser';
import { dppDateToIso, parseCsv } from '../src/domain/pesticide-check/pesticide-seed';
import { DPP_DIR, loadNotified, loadPremixes } from './dpp-fixtures';

const NOW = new Date('2026-10-23T00:00:00Z');
const bannedRows = parseCsv(readFileSync(join(DPP_DIR, 'dpp-banned-ingredients.csv'), 'utf8')).map(
  (r) => ({
    ingredient: r.chemical_name!,
    ingredientNormalized: r.chemical_name!.toLowerCase().replace(/[^a-z0-9]/g, ''),
    reason: r.position_in_pakistan || null,
    isDemo: false,
    position: r.position_in_pakistan || null,
    notificationNumber: r.notification_number
      ? r.notification_number.replace(/^S\.R\.O\.?\s*/i, 'S.R.O. ')
      : null,
    notificationDate: dppDateToIso(r.notification_date),
  }),
);
const notified = loadNotified();
const premixBrands = loadPremixes();

const label = (over: Partial<RiskInput> = {}): RiskInput => {
  const fields = {
    brandName: 'Agrimectin',
    activeIngredient: 'Abamectin',
    concentration: '1.8%',
    formulation: 'EC',
    registrationNo: 'REG-1234',
    expiryDate: '03/2029',
    ...(over.fields ?? {}),
  };
  const rawText =
    over.rawText ?? `${fields.brandName}\nActive Ingredient: ${fields.activeIngredient} 1.8% EC`;
  const labelIngredients = over.labelIngredients ?? [fields.activeIngredient];
  const bannedHits =
    over.bannedHits ??
    findBannedHits([fields.activeIngredient, fields.brandName, rawText], bannedRows);
  return {
    inputMode: 'photo',
    rawText,
    ocrConfidence: 0.9,
    match: null,
    dppLoaded: true,
    notified,
    premixBrands,
    labelConcentrations: ['1.8%'],
    labelFormulations: ['EC'],
    now: NOW,
    ...over,
    fields,
    labelIngredients,
    bannedHits,
  };
};
const status = (r: ReturnType<typeof evaluatePesticideRisk>, code: string) =>
  r.checks.find((c) => c.code === code)?.status;
const detail = (r: ReturnType<typeof evaluatePesticideRisk>, code: string) =>
  r.checks.find((c) => c.code === code)?.detailEn ?? '';

describe('DPP-aware risk engine', () => {
  it('Abamectin 1.8% EC passes ingredient_notified with category and WHO class and is VERIFIED', () => {
    const r = evaluatePesticideRisk(label());
    expect(status(r, 'ingredient_notified')).toBe('pass');
    expect(detail(r, 'ingredient_notified')).toMatch(/Abamectin 1\.8% EC/);
    expect(detail(r, 'ingredient_notified')).toMatch(/WHO class III/);
    expect(detail(r, 'ingredient_notified')).toMatch(/category Ins\./);
    expect(detail(r, 'ingredient_notified')).toMatch(/strength and formulation/);
    expect(detail(r, 'ingredient_notified')).toMatch(/not proof of registration/);
    expect(r.verdict).toBe('VERIFIED');
    expect(r.listCoverage).toBe('DPP_PARTIAL');
    expect(r.demoDataset).toBe(false);
    expect(r.matchedNotified).toEqual({
      productText: 'Abamectin 1.8% EC.',
      category: 'Ins.',
      whoClass: 'III',
      notification: 'S.R.O. 636(I)/2005 dated 22.06.2005',
    });
    expect(r.bannedMatch).toBeNull();
    expect(status(r, 'banned_ingredient')).toBe('pass');
    expect(status(r, 'banned_premix_brand')).toBe('pass');
    // Unmatched brand: unknown with the plain explanation, no risk points for it.
    expect(status(r, 'product_registered')).toBe('unknown');
    expect(detail(r, 'product_registered')).toMatch(
      /brand names are not part of the DPP lists we hold/,
    );
    expect(r.score).toBeLessThan(25);
  });

  it('the wording never claims registered / genuine / safe / authentic / approved', () => {
    const ok = evaluatePesticideRisk(label());
    const texts = [
      ...ok.checks.flatMap((c) => [c.titleEn, c.detailEn]),
      composeExplanation(ok, 'en'),
    ].join(' ');
    expect(texts).not.toMatch(/genuine|authentic|approved|\bsafe\b/i);
    expect(composeExplanation(ok, 'en')).toMatch(/consistent with the DPP notified list/);
    expect(composeExplanation(ok, 'ur')).toMatch(/[؀-ۿ]/);
  });

  it('a notified ingredient with a different strength still passes but says so', () => {
    const r = evaluatePesticideRisk(
      label({ labelConcentrations: ['9%'], labelFormulations: ['WP'] }),
    );
    expect(status(r, 'ingredient_notified')).toBe('pass');
    expect(detail(r, 'ingredient_notified')).toMatch(/could not be matched/);
  });

  it('an ingredient not on the partial list is unknown (never warn/fail) and is not called unregistered', () => {
    const r = evaluatePesticideRisk(label({ fields: { activeIngredient: 'Zorbitol' } }));
    expect(status(r, 'ingredient_notified')).toBe('unknown');
    expect(detail(r, 'ingredient_notified')).toMatch(
      /not found on the partial 2005 DPP list we hold; this does not mean it is unregistered/,
    );
    expect(r.checks.some((c) => c.status === 'warn' || c.status === 'fail')).toBe(false);
    expect(r.verdict).toBe('SUSPICIOUS');
    expect(r.score).toBe(UNCONFIRMED_SCORE);
    expect(r.matchedNotified).toBeNull();
    const en = composeExplanation(r, 'en');
    expect(en).toMatch(/could not confirm/i);
    expect(en).toMatch(/does not mean it is fake or unregistered/);
    expect(en).not.toMatch(/Main points|All the checks/);
    expect(composeExplanation(r, 'ur')).toMatch(/[؀-ۿ]/);
  });

  it('banned ingredient (Endosulfan) forces HIGH_RISK with the S.R.O. number and date', () => {
    const r = evaluatePesticideRisk(label({ fields: { activeIngredient: 'Endosulfan' } }));
    expect(r.verdict).toBe('HIGH_RISK');
    expect(r.score).toBe(100);
    expect(status(r, 'banned_ingredient')).toBe('fail');
    expect(detail(r, 'banned_ingredient')).toMatch(/Listed in the DPP banned pesticides list/);
    expect(detail(r, 'banned_ingredient')).toMatch(/S\.R\.O\. 1329\(I\)\/2012, 22 Oct 2012/);
    expect(r.bannedMatch).toMatchObject({
      kind: 'ingredient',
      name: 'Endosulfan',
      notificationNumber: 'S.R.O. 1329(I)/2012',
      notificationDate: '2012-10-22',
    });
    expect(r.demoDataset).toBe(false);
    expect(composeExplanation(r, 'en')).toMatch(/Listed in the DPP banned pesticides list/);
  });

  it('ingredients without a notification (BHC, Heptachlor) still cite the position text', () => {
    const r = evaluatePesticideRisk(label({ fields: { activeIngredient: 'Heptachlor' } }));
    expect(r.verdict).toBe('HIGH_RISK');
    expect(detail(r, 'banned_ingredient')).toMatch(/Heptachlor - Deregistered - banned in 1997/);
  });

  it('banned pre-mixture brand Ammo-phos 450 EC is HIGH_RISK with SRO 624(I)/96', () => {
    const r = evaluatePesticideRisk(
      label({
        fields: { brandName: 'Ammo-phos 450 EC', activeIngredient: 'Cypermethrin' },
        labelIngredients: ['Cypermethrin'],
        bannedHits: [],
      }),
    );
    expect(r.verdict).toBe('HIGH_RISK');
    expect(r.score).toBe(100);
    expect(status(r, 'banned_premix_brand')).toBe('fail');
    expect(detail(r, 'banned_premix_brand')).toMatch(
      /listed as a banned pre-mixture \(SRO 624\(I\)\/96, 15 Jul 1996\)/,
    );
    expect(r.bannedMatch).toMatchObject({
      kind: 'premix',
      notificationNumber: 'SRO 624(I)/96',
      notificationDate: '1996-07-15',
    });
    expect(composeExplanation(r, 'en')).toMatch(/banned pre-mixture/);
  });

  it('matching components strengthen the premix detail; the banned ingredient also fails', () => {
    const r = evaluatePesticideRisk(
      label({
        fields: { brandName: 'Ammo-phos', activeIngredient: 'Cypermethrin' },
        labelIngredients: ['Cypermethrin', 'Monocrotophos'],
        rawText: 'Ammo-phos\nActive Ingredient: Cypermethrin + Monocrotophos',
      }),
    );
    expect(detail(r, 'banned_premix_brand')).toMatch(/ingredients on the label also match/);
    expect(status(r, 'banned_ingredient')).toBe('fail');
    expect(r.verdict).toBe('HIGH_RISK');
  });

  it('a premix is only flagged via the brand: its components alone are not a premix hit', () => {
    const r = evaluatePesticideRisk(
      label({
        fields: { brandName: 'Cyper Plus', activeIngredient: 'Chlorpyrifos' },
        labelIngredients: ['Chlorpyrifos', 'Dimethoate'],
      }),
    );
    expect(status(r, 'banned_premix_brand')).toBe('pass');
    expect(r.verdict).not.toBe('HIGH_RISK');
  });

  it('expired still fails even when the ingredient is on the notified list', () => {
    const r = evaluatePesticideRisk(label({ fields: { expiryDate: '01/2020' } }));
    expect(status(r, 'expiry_date')).toBe('fail');
    expect(status(r, 'ingredient_notified')).toBe('pass');
    expect(r.verdict).toBe('SUSPICIOUS');
  });

  it('missing registration number and expiry make a notified label SUSPICIOUS, as before', () => {
    const r = evaluatePesticideRisk(
      label({ fields: { registrationNo: undefined, expiryDate: undefined } }),
    );
    expect(r.verdict).toBe('SUSPICIOUS');
  });

  it('coverage and demo flags: DEMO without DPP data, DPP_PARTIAL with it, demo only if demo rows influenced the result', () => {
    const legacy = evaluatePesticideRisk({
      ...label(),
      dppLoaded: false,
      notified: undefined,
      premixBrands: undefined,
    });
    expect(legacy.listCoverage).toBe('DEMO');
    expect(legacy.checks.map((c) => c.code)).not.toContain('ingredient_notified');
    expect(legacy.checks.map((c) => c.code)).not.toContain('banned_premix_brand');
    expect(dataSourcesFor('DEMO')).toEqual([]);
    const sources = dataSourcesFor('DPP_PARTIAL');
    expect(sources).toHaveLength(2);
    expect(sources[0]).toMatchObject({
      asOf: '2026-10-23',
      url: expect.stringMatching(/^https:\/\/plantprotection\.gov\.pk\//) as string,
    });
    const demoMatch = evaluatePesticideRisk(
      label({
        match: {
          similarity: 1,
          product: {
            id: 'p',
            brandName: 'DEMO Abamectin',
            activeIngredient: 'Abamectin',
            concentration: null,
            company: null,
            registrationNo: null,
            referencePriceRs: null,
            packSize: null,
            isDemo: true,
          },
        },
      }),
    );
    expect(demoMatch.listCoverage).toBe('DPP_PARTIAL');
    expect(demoMatch.demoDataset).toBe(true);
    expect(status(demoMatch, 'product_registered')).toBe('pass');
    expect(evaluatePesticideRisk(label()).demoDataset).toBe(false);
  });

  it('UNREADABLE keeps the additive fields', () => {
    const r = evaluatePesticideRisk(label({ rawText: 'xx', fields: {} }));
    expect(r).toMatchObject({
      verdict: 'UNREADABLE',
      listCoverage: 'DPP_PARTIAL',
      matchedNotified: null,
      bannedMatch: null,
    });
  });

  it('every new check has real Urdu title and detail', () => {
    for (const ing of ['Abamectin', 'Zorbitol', 'Endosulfan']) {
      const r = evaluatePesticideRisk(label({ fields: { activeIngredient: ing } }));
      for (const c of r.checks) {
        expect(c.titleUr).toMatch(/[؀-ۿ]/);
        expect(c.detailUr).toMatch(/[؀-ۿ]/);
      }
    }
    const p = evaluatePesticideRisk(label({ fields: { brandName: 'Tombel' }, bannedHits: [] }));
    expect(p.checks.find((c) => c.code === 'banned_premix_brand')?.detailUr).toMatch(/[؀-ۿ]/);
  });
});

describe('banned list matching (real DPP rows)', () => {
  const hits = (...texts: string[]) => findBannedHits(texts, bannedRows).map((h) => h.ingredient);
  it('finds each banned chemical by name and by spelling variant', () => {
    for (const row of bannedRows) {
      const term = row.ingredient
        .split('+')[0]!
        .replace(/\bcompound\b/i, '')
        .trim();
      expect(hits(`Active: ${term} 20% EC`)).toContain(row.ingredient);
    }
    expect(hits('Endosulphan 35 EC')).toContain('Endosulfan');
    expect(hits('Mono-crotofos 36 SL')).toContain('Monocrotophos');
    expect(hits('Methamidofos')).toContain('Methamidophos');
    expect(hits('Parathion-methyl')).toContain('Methyl parathion');
    expect(hits('contains Mercury chloride')).toContain('Mercury compound');
  });
  it('does not flag notified products or look-alike words (word boundary for DDT / BHC)', () => {
    for (const r of csv139()) expect(hits(r)).toEqual([]);
    expect(hits('additional ddtx notes', 'bhcx')).toEqual([]);
    expect(hits('Mancozeb 80 WP')).toEqual([]);
  });
});

function csv139(): string[] {
  return parseCsv(readFileSync(join(DPP_DIR, 'dpp-form16-notified.csv'), 'utf8')).map(
    (r) => r.product_text!,
  );
}

describe('seed helpers', () => {
  it('converts DPP dates to ISO and rejects nonsense', () => {
    expect(dppDateToIso('19.09.1994')).toBe('1994-09-19');
    expect(dppDateToIso('15.07.1996')).toBe('1996-07-15');
    expect(dppDateToIso('')).toBeNull();
    expect(dppDateToIso('32.01.2000')).toBeNull();
    expect(parseNotifiedProduct('Quinalphos 20 EC, 25 EC.').ingredients).toEqual(['Quinalphos']);
  });
});

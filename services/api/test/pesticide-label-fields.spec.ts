import { extractLabelFields, parseLabelDate } from '../src/domain/pesticide-check/label-fields';
import {
  ingredientsMatch,
  normalizeName,
  trigramSimilarity,
} from '../src/domain/pesticide-check/pesticide-normalize';

describe('extractLabelFields', () => {
  it('reads a typical label', () => {
    const f = extractLabelFields(
      [
        'DEMO Imidacloprid 20% SL',
        'INSECTICIDE',
        'Active Ingredient: Imidacloprid 20% SL',
        'Manufactured by: Demo Agro Chemicals Pvt Ltd',
        'Reg. No. 1234/2020',
        'Batch No: B2407A',
        'Mfg: 03/2026  Exp: 03/2028',
      ].join('\n'),
    );
    expect(f.brandName).toBe('DEMO Imidacloprid 20% SL');
    expect(f.concentration).toBe('20%');
    expect(f.formulation).toBe('SL');
    expect(f.registrationNo).toBe('1234/2020');
    expect(f.batchNo).toBe('B2407A');
    expect(f.expiryDate).toBe('03/2028');
    expect(f.manufacturingDate).toBe('03/2026');
    expect(f.company).toMatch(/Demo Agro Chemicals/);
    expect(f.activeIngredient).toMatch(/^Imidacloprid/);
  });

  it.each([
    ['Exp: 10/2027', '10/2027'],
    ['EXP 03-2026', '03-2026'],
    ['Expiry Date: 12/2026', '12/2026'],
    ['EXP. DATE 15/06/2027', '15/06/2027'],
    ['Expiry: OCT 2027', 'OCT2027'],
    ['Use before 2027-09', '2027-09'],
  ])('reads expiry from "%s"', (text, expected) => {
    expect(extractLabelFields(`Some Brand 20% EC\n${text}`).expiryDate).toBe(expected);
  });

  it('reads a fungicide label with w/v concentration and a long formulation name', () => {
    const f = extractLabelFields(
      'TILT PLUS\nFungicide\nPropiconazole 25 % w/v Emulsifiable Concentrate\nRegistration No: PK-4521\nLot 55X9\nMarketed by Agro Marketing (Pvt) Ltd',
    );
    expect(f.concentration).toBe('25% w/v');
    expect(f.formulation).toBe('EC');
    expect(f.registrationNo).toBe('PK-4521');
    expect(f.batchNo).toBe('55X9');
    expect(f.activeIngredient).toMatch(/Propiconazole/);
    expect(f.brandName).toBe('TILT PLUS');
  });

  it('reads comma decimals and glued formulations', () => {
    const f = extractLabelFields('SUPERCYP\nCypermethrin 2,5%EC\nNet 1 litre');
    expect(f.concentration).toBe('2.5%');
    expect(f.formulation).toBe('EC');
  });

  it('does not invent fields from noise', () => {
    expect(extractLabelFields('')).toEqual({});
    expect(extractLabelFields('  \n ')).toEqual({});
    const f = extractLabelFields('xx ~~ ..');
    expect(f.registrationNo).toBeUndefined();
    expect(f.expiryDate).toBeUndefined();
  });

  it('ignores a date-like value that is not parseable', () => {
    expect(extractLabelFields('Exp: 99/9999 brand name').expiryDate).toBeUndefined();
  });
});

describe('parseLabelDate', () => {
  it('uses the end of the month for month/year', () => {
    expect(parseLabelDate('02/2028')!.toISOString().slice(0, 10)).toBe('2028-02-29');
    expect(parseLabelDate('10/27')!.toISOString().slice(0, 7)).toBe('2027-10');
    expect(parseLabelDate('Dec 2026')!.toISOString().slice(0, 7)).toBe('2026-12');
    expect(parseLabelDate('2027-09-15')!.toISOString().slice(0, 10)).toBe('2027-09-15');
    expect(parseLabelDate('15/06/2027')!.toISOString().slice(0, 10)).toBe('2027-06-15');
  });
  it('rejects nonsense', () => {
    expect(parseLabelDate('13/2027')).toBeUndefined();
    expect(parseLabelDate('hello')).toBeUndefined();
    expect(parseLabelDate(undefined)).toBeUndefined();
  });
});

describe('name normalisation and similarity', () => {
  it('lowercases and strips punctuation and spaces', () => {
    expect(normalizeName('DEMO Imidacloprid 20% SL')).toBe('demoimidacloprid20sl');
    expect(normalizeName(' Tilt-Plus. ')).toBe('tiltplus');
    expect(normalizeName(null)).toBe('');
  });
  it('trigram similarity behaves like pg_trgm', () => {
    expect(trigramSimilarity('abc', 'abc')).toBe(1);
    expect(trigramSimilarity('', 'abc')).toBe(0);
    expect(trigramSimilarity('imidacloprid', 'imidaclopird')).toBeGreaterThan(0.4);
    expect(trigramSimilarity('imidacloprid', 'mancozeb')).toBeLessThan(0.1);
  });
  it('ingredient matching tolerates case, punctuation and small OCR noise', () => {
    expect(ingredientsMatch('Imidacloprid', 'IMIDACLOPRID')).toBe(true);
    expect(ingredientsMatch('Lambda-cyhalothrin', 'lambda cyhalothrin')).toBe(true);
    expect(ingredientsMatch('Imidacloprid 20%', 'Imidacloprid')).toBe(true);
    expect(ingredientsMatch('Imidacloprid', 'Mancozeb')).toBe(false);
    expect(ingredientsMatch('', 'Mancozeb')).toBe(false);
  });
});

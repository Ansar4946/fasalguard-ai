/* eslint-disable @typescript-eslint/explicit-function-return-type */
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import {
  bannedSearchTerms,
  findPremixMatch,
  ingredientEquivalent,
  matchNotifiedList,
  type PremixBrandInfo,
} from '../src/domain/pesticide-check/dpp-matching';
import {
  normalizeIngredient,
  parseNotifiedProduct,
  readLabelIngredients,
  strengthNumbers,
} from '../src/domain/pesticide-check/dpp-parser';
import { parseCsv } from '../src/domain/pesticide-check/pesticide-seed';
import { DPP_DIR, loadNotified, loadPremixes } from './dpp-fixtures';

const csv = (name: string) => parseCsv(readFileSync(join(DPP_DIR, name), 'utf8'));

describe('normalizeIngredient spelling variants', () => {
  it.each([
    ['Chlorpyrifos', 'Chlorpyriphos'],
    ['Quinalphos', 'Qulinalphos'],
    ['Clodinafop propargyl', 'Clodinafop propergyl'],
    ['Propargite', 'Propergite'],
    ['Aluminium Phosphide', 'Aluminum Phosphide'],
    ['Sulfur', 'Sulphur'],
    ['Lambda-Cyhalothrin', 'lambda cyhalothrin'],
    ['Fenitrothion', 'Fenitrothian'],
    ['Diclofop-methyl', 'Diclofop - methyl'],
  ])('%s == %s', (a, b) => {
    expect(normalizeIngredient(a)).toBe(normalizeIngredient(b));
    expect(ingredientEquivalent(a, b)).toBe(true);
  });
  it('different chemicals stay different', () => {
    expect(ingredientEquivalent('Cypermethrin', 'Alpha-Cypermethrin')).toBe(false);
    expect(ingredientEquivalent('Chlorpyrifos', 'Chlortoluron')).toBe(false);
    expect(ingredientEquivalent('', 'Abamectin')).toBe(false);
  });
});

describe('parseNotifiedProduct', () => {
  it('handles the documented shapes', () => {
    expect(parseNotifiedProduct('Abamectin 1.8% EC.')).toEqual({
      ingredients: ['Abamectin'],
      concentrations: ['1.8%'],
      formulations: ['EC'],
    });
    expect(parseNotifiedProduct('Acephate 40 EC, 75 SP.')).toEqual({
      ingredients: ['Acephate'],
      concentrations: ['40', '75'],
      formulations: ['EC', 'SP'],
    });
    expect(parseNotifiedProduct('Acetamiprid 20% SL, 20% SP').formulations).toEqual(['SL', 'SP']);
    expect(parseNotifiedProduct('Ametryn + Atrazine 80WP, 50 FW.')).toEqual({
      ingredients: ['Ametryn', 'Atrazine'],
      concentrations: ['80', '50'],
      formulations: ['WP', 'FW'],
    });
    expect(parseNotifiedProduct('Glyphosate 41% SL / 48% SL.').concentrations).toEqual([
      '41%',
      '48%',
    ]);
    expect(
      parseNotifiedProduct('Bromoxynil + MCPA 200/200 EC, 200/328 EC.').concentrations,
    ).toEqual(['200/200', '200/328']);
    expect(parseNotifiedProduct('Dichlorprop + MCPA + MCPP (185 + 125 + 125 g/l) SL.')).toEqual({
      ingredients: ['Dichlorprop', 'MCPA', 'MCPP'],
      concentrations: ['185', '125', '125 g/l'],
      formulations: ['SL'],
    });
    expect(
      parseNotifiedProduct('Beta Cyfluthrin + Chlorpyrifos 262. 5 EC (12.5 g/l + 250 g/l).'),
    ).toMatchObject({
      ingredients: ['Beta Cyfluthrin', 'Chlorpyrifos'],
      concentrations: expect.arrayContaining(['262.5', '12.5 g/l']) as string[],
    });
    expect(parseNotifiedProduct('Methyl Bromide 98per cent, 100 per cent.').concentrations).toEqual(
      ['98%', '100%'],
    );
    expect(parseNotifiedProduct('Carbaryl  20G, 85 SP, 10 D.').formulations).toEqual([
      'G',
      'SP',
      'D',
    ]);
    expect(
      parseNotifiedProduct('Fenoxaprop � P � ethyl + Isoproturon 50% WP (2% + 48%).'),
    ).toMatchObject({ ingredients: ['Fenoxaprop-P-ethyl', 'Isoproturon'] });
    expect(
      parseNotifiedProduct('Aluminium Phosphide 56% (ALP) Tablets, Pellets, Bags.'),
    ).toMatchObject({
      ingredients: ['Aluminium Phosphide'],
      formulations: ['Tablets', 'Pellets', 'Bags'],
    });
  });
  it('protects names that start with digits and ignores empty input', () => {
    expect(parseNotifiedProduct('2,4-D 72% SL').ingredients).toEqual(['2,4-D']);
    expect(parseNotifiedProduct('')).toEqual({
      ingredients: [],
      concentrations: [],
      formulations: [],
    });
    expect(parseNotifiedProduct(null).ingredients).toEqual([]);
  });
  it('parses ALL 139 Form-16 rows and every one yields at least one ingredient', () => {
    const rows = csv('dpp-form16-notified.csv');
    expect(rows).toHaveLength(139);
    const empty = rows.filter((r) => parseNotifiedProduct(r.product_text).ingredients.length === 0);
    expect(empty.map((r) => `${r.serial}: ${r.product_text}`)).toEqual([]);
    // Every row also has a strength and (all but the methyl bromide row, which lists only per cent strengths) a formulation.
    const noStrength = rows.filter(
      (r) => parseNotifiedProduct(r.product_text).concentrations.length === 0,
    );
    expect(noStrength.map((r) => r.serial)).toEqual([]);
    const noForm = rows.filter(
      (r) => parseNotifiedProduct(r.product_text).formulations.length === 0,
    );
    expect(noForm.map((r) => r.serial)).toEqual(['97']);
    // Mixtures: 28 rows have two or more ingredients.
    const mixtures = rows.filter(
      (r) => parseNotifiedProduct(r.product_text).ingredients.length > 1,
    );
    expect(mixtures.length).toBeGreaterThanOrEqual(25);
  });
  it('strengthNumbers extracts the numeric parts', () => {
    expect(strengthNumbers(['1.8%', '200/328', '250 g/l'])).toEqual([1.8, 200, 328, 250]);
    expect(strengthNumbers(undefined)).toEqual([]);
  });
});

describe('readLabelIngredients', () => {
  it('prefers the labelled line and keeps every mixture component', () => {
    const r = readLabelIngredients(
      { activeIngredient: 'Cypermethrin' },
      'Ammo-phos 450 EC\nActive Ingredient: Cypermethrin 5% + Monocrotophos 40% EC\nNet 1 L',
    );
    expect(r.ingredients).toEqual(['Cypermethrin', 'Monocrotophos']);
    expect(r.formulations).toContain('EC');
    expect(r.source).toBe('labelled-line');
  });
  it('falls back to the extracted field and adds field strength / formulation', () => {
    const r = readLabelIngredients(
      { activeIngredient: 'Abamectin', concentration: '1.8%', formulation: 'ec' },
      'no labelled line here',
    );
    expect(r).toEqual({
      ingredients: ['Abamectin'],
      concentrations: ['1.8%'],
      formulations: ['EC'],
      source: 'field',
    });
    expect(readLabelIngredients({}, '').source).toBe('none');
  });
});

describe('matchNotifiedList with the real Form-16 rows', () => {
  const notified = loadNotified();
  it('Abamectin 1.8% EC passes with strength and formulation, category and WHO class', () => {
    const m = matchNotifiedList({
      labelIngredients: ['Abamectin'],
      labelConcentrations: ['1.8%'],
      labelFormulations: ['EC'],
      notified,
    });
    expect(m.status).toBe('pass');
    expect(m.row?.productText).toBe('Abamectin 1.8% EC.');
    expect(m.row?.whoClass).toBe('III');
    expect(m.concentrationMatches && m.formulationMatches).toBe(true);
  });
  it('spelling variants still match (chlorpyriphos, aluminum)', () => {
    expect(
      matchNotifiedList({ labelIngredients: ['Chlorpyriphos'], notified }).row?.productText,
    ).toMatch(/^Chlorpyrifos/);
    expect(matchNotifiedList({ labelIngredients: ['Aluminum Phosphide'], notified }).status).toBe(
      'pass',
    );
  });
  it('mixtures must be a notified combination; unknown ingredients are unknown, never warn/fail', () => {
    expect(
      matchNotifiedList({ labelIngredients: ['Cypermethrin', 'Profenofos'], notified }).status,
    ).toBe('pass');
    const combo = matchNotifiedList({ labelIngredients: ['Abamectin', 'Mancozeb'], notified });
    expect(combo).toMatchObject({ status: 'unknown', reason: 'combination' });
    const nope = matchNotifiedList({ labelIngredients: ['Zorbitol'], notified });
    expect(nope).toMatchObject({ status: 'unknown', reason: 'not_found', missing: ['zorbitol'] });
    expect(matchNotifiedList({ labelIngredients: [], notified }).reason).toBe('no_ingredient');
  });
});

describe('banned pre-mixture brands (List B)', () => {
  const brands = loadPremixes();
  it('loads all nine brands with components and the SRO', () => {
    expect(brands).toHaveLength(9);
    const tombel = brands.find((b) => b.brandName === 'Tombel')!;
    expect(tombel.ingredientsNormalized).toEqual(['quinalphos', 'thiometon']);
    expect(tombel.notificationDate).toBe('1996-07-15');
  });
  it('exact normalised brand, spacing/punctuation noise and similar spelling match', () => {
    const find = (brandName: string, labelIngredients: string[] = []) =>
      findPremixMatch({ brandName, labelIngredients, brands });
    expect(find('Ammo-phos 450 EC')?.brand.brandName).toBe('Ammo-phos');
    expect(find('Ammo-phos 450 EC')?.exact).toBe(true);
    expect(find('Ammo-phos')?.brand.brandName).toBe('Ammo-phos');
    expect(find('AMMOPHOS')?.exact).toBe(true);
    expect(find('Pay Off Plus')?.brand.brandName).toBe('Pay Off Plus');
    expect(find('Crop gard')?.brand.brandName).toBe('Crop gard');
    // One stray character on a short name stays below the 0.8 threshold (high threshold on purpose).
    expect(find('Ammo-phoss')).toBeNull();
    // A long brand with a one-character OCR slip is a fuzzy hit (>= 0.8) and is flagged as not exact.
    const long: PremixBrandInfo = {
      ...brands[0]!,
      brandName: 'Superlongbrandname',
      brandNormalized: 'superlongbrandname',
      formulation: null,
    };
    const fuzzy = findPremixMatch({
      brandName: 'Superlongbrandnames',
      labelIngredients: [],
      brands: [long],
    });
    expect(fuzzy?.exact).toBe(false);
    expect(fuzzy?.similarity).toBeGreaterThanOrEqual(0.8);
    expect(find('Mavrik')).toBeNull();
    expect(find('Confidor')).toBeNull();
  });
  it('label ingredients matching the components strengthen the hit', () => {
    const m = findPremixMatch({
      brandName: 'Ammo-phos',
      labelIngredients: ['Cypermethrin', 'Monocrotophos'],
      brands,
    });
    expect(m?.ingredientsAllMatch).toBe(true);
    expect(m?.ingredientOverlap).toBe(2);
  });
  it('finds a long brand name inside the label text', () => {
    const m = findPremixMatch({
      brandName: 'Super Spray',
      rawText: 'Brand: Facron-B 235/200 EC insecticide',
      labelIngredients: [],
      brands,
    });
    expect(m?.brand.brandName).toBe('Facron-B');
  });
});

describe('bannedSearchTerms', () => {
  it('splits "+" lists and strips "compound"', () => {
    expect(bannedSearchTerms('Dibromochloropropane + Dibromochloropropene')).toEqual([
      'dibromochloropropane',
      'dibromochloropropene',
    ]);
    expect(bannedSearchTerms('Mercury compound')).toEqual(expect.arrayContaining(['mercury']));
    expect(bannedSearchTerms('Methyl parathion')).toEqual(
      expect.arrayContaining(['methylparathion', 'parathionmethyl']),
    );
  });
});

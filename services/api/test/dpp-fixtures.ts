import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import type {
  NotifiedProductInfo,
  PremixBrandInfo,
} from '../src/domain/pesticide-check/dpp-matching';
import {
  normalizeIngredient,
  parseNotifiedProduct,
} from '../src/domain/pesticide-check/dpp-parser';
import { dppDateToIso, parseCsv } from '../src/domain/pesticide-check/pesticide-seed';

export const DPP_DIR = join(__dirname, '..', 'src', 'domain', 'pesticide-check', 'seed', 'dpp');
const csv = (name: string): Array<Record<string, string>> =>
  parseCsv(readFileSync(join(DPP_DIR, name), 'utf8'));

export const loadNotified = (): NotifiedProductInfo[] =>
  csv('dpp-form16-notified.csv').map((r) => {
    const p = parseNotifiedProduct(r.product_text);
    return {
      serial: Number(r.serial),
      productText: r.product_text!,
      ingredientsNormalized: p.ingredients.map((i) => normalizeIngredient(i)),
      concentrationText: p.concentrations.join('; ') || null,
      formulations: p.formulations,
      category: r.category || null,
      whoClass: r.who_class || null,
      notification: 'S.R.O. 636(I)/2005 dated 22.06.2005',
    };
  });

export const loadPremixes = (): PremixBrandInfo[] =>
  csv('dpp-banned-premixes.csv').map((r) => ({
    brandName: r.brand_name!,
    brandNormalized: r.brand_name!.toLowerCase().replace(/[^a-z0-9]/g, ''),
    formulation: r.formulation || null,
    commonName: r.common_name || null,
    ingredientsNormalized: r
      .common_name!.split('+')
      .map((c) => normalizeIngredient(c))
      .filter(Boolean),
    notificationNumber: r.notification_number!,
    notificationDate: dppDateToIso(r.notification_date),
  }));

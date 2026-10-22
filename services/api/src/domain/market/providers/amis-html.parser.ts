import type { MarketPriceObservation } from './market-price.provider';
import { dateAgeDays } from '../market-data-policy';

export class AmisParseError extends Error {}

const MARKET_NAMES: Record<string, string> = {
  dgkhan: 'Dera Ghazi Khan',
  faisalabad: 'Faisalabad',
  gujranwala: 'Gujranwala',
  jauharabad: 'Jauharabad',
  lahore: 'Lahore',
  mandibahaudin: 'Mandi Bahauddin',
  multan: 'Multan',
  multanroadlahore: 'Multan Road Lahore',
  pakpattan: 'Pakpattan',
  rahimyarkhan: 'Rahim Yar Khan',
  rawalpindi: 'Rawalpindi',
  sahiwal: 'Sahiwal',
  sargodha: 'Sargodha',
};

function decodeHtml(value: string): string {
  return value
    .replace(/&#(\d+);/g, (_, code: string) => String.fromCodePoint(Number(code)))
    .replace(/&#x([\da-f]+);/gi, (_, code: string) => String.fromCodePoint(parseInt(code, 16)))
    .replace(/&nbsp;?/gi, ' ')
    .replace(/&amp;/gi, '&')
    .replace(/&lt;/gi, '<')
    .replace(/&gt;/gi, '>')
    .replace(/&quot;/gi, '"')
    .replace(/&#39;|&apos;/gi, "'");
}

function textContent(value: string): string {
  return decodeHtml(value.replace(/<[^>]*>/g, ' '))
    .replace(/\s+/g, ' ')
    .trim();
}

export function normalizeCropName(value: string): string {
  const key = value.toLocaleLowerCase('en').replace(/[^a-z]/g, '');
  const aliases: Record<string, string> = {
    wheat: 'Wheat',
    maize: 'Maize',
    seedcottonphutti: 'Cotton',
    cotton: 'Cotton',
    riceirri: 'Rice',
    ricebasmatisupernew: 'Rice',
    sugarcane: 'Sugarcane',
  };
  return (
    aliases[key] ??
    value
      .replace(/\s+/g, ' ')
      .trim()
      .replace(/\b\w/g, (x) => x.toUpperCase())
  );
}

export function normalizeMarketName(value: string): string {
  const cleaned = value
    .replace(/^\d+\s*/, '')
    .replace(/\s+/g, ' ')
    .trim();
  const key = cleaned.toLocaleLowerCase('en').replace(/[^a-z]/g, '');
  return MARKET_NAMES[key] ?? cleaned.replace(/\b\w/g, (x) => x.toUpperCase());
}

function parsePrice(value: string): number | null {
  const cleaned = value.replace(/,/g, '').trim();
  if (!/^\d+(?:\.\d+)?$/.test(cleaned)) return null;
  const amount = Math.round(Number(cleaned));
  return amount > 0 ? amount : null;
}

function parsePriceDate(html: string): string {
  const match = textContent(html).match(/Dated\s*:\s*(\d{2})-(\d{2})-(\d{4})/i);
  if (!match) throw new AmisParseError('AMIS price date was not found');
  const [, dayText, monthText, yearText] = match;
  const day = Number(dayText);
  const month = Number(monthText);
  const year = Number(yearText);
  const parsed = new Date(Date.UTC(year, month - 1, day));
  if (
    parsed.getUTCFullYear() !== year ||
    parsed.getUTCMonth() !== month - 1 ||
    parsed.getUTCDate() !== day
  )
    throw new AmisParseError('AMIS price date was invalid');
  return `${yearText}-${monthText}-${dayText}`;
}

export function parseAmisCommodityPage(
  html: string,
  cropName: string,
  sourceUrl: string,
): MarketPriceObservation[] {
  const heading = /<span\b[^>]*\bid=["']ctl00_cphPage_lblMsg["'][^>]*>([\s\S]*?)<\/span>/i.exec(
    html,
  );
  const identity = (value: string): string =>
    textContent(value)
      .toLowerCase()
      .replace(/[^a-z0-9]/g, '');
  if (!heading || identity(heading[1] ?? '') !== identity(cropName))
    throw new AmisParseError('AMIS selected commodity does not match the requested commodity.');
  const units = [
    ...textContent(html).matchAll(/\b(?:Rs\.?|PKR|Rupees)\s*(?:\/|per)\s*(\d+)\s*kg\b/gi),
  ];
  if (!units.length || units.some((match) => Number(match[1]) !== 100))
    throw new AmisParseError(
      'AMIS quantity unit is missing or unsupported; expected PKR per 100 KG.',
    );
  const priceDate = parsePriceDate(html);
  if (dateAgeDays(priceDate) === null)
    throw new AmisParseError('AMIS price date is invalid or in the future.');
  if (!/\bGraph\s+Min\s+Max\s+FQP\b/i.test(textContent(html)))
    throw new AmisParseError('AMIS price table column contract is missing.');
  const records: MarketPriceObservation[] = [];
  const rows = html.match(/<tr\b[^>]*>[\s\S]*?<\/tr>/gi) ?? [];
  for (const row of rows) {
    const cells = [...row.matchAll(/<td\b[^>]*>([\s\S]*?)<\/td>/gi)].map((match) =>
      textContent(match[1] ?? ''),
    );
    if (cells.length < 5) continue;
    const minimumPrice = parsePrice(cells[2] ?? '');
    const maximumPrice = parsePrice(cells[3] ?? '');
    const averagePrice = parsePrice(cells[4] ?? '');
    if (minimumPrice === null || maximumPrice === null || averagePrice === null) continue;
    const market = normalizeMarketName(cells[0] ?? '');
    if (
      !market ||
      minimumPrice > maximumPrice ||
      averagePrice < minimumPrice ||
      averagePrice > maximumPrice
    )
      continue;
    records.push({
      crop: normalizeCropName(cropName),
      market,
      district: 'Unknown',
      province: 'Punjab',
      minimumPrice,
      maximumPrice,
      averagePrice,
      quantity: 100,
      unit: 'KG',
      source: 'AMIS',
      priceDate,
      sourceIdentifier: `AMIS:${textContent(heading[1] ?? '')}:${market}:${priceDate}`,
      sourceUrl,
    });
  }

  return records;
}

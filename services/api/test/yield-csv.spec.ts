/* F13 unit tests. Every CSV below is a SYNTHETIC TEST FIXTURE with invented numbers and a fake
 * source; none of it is real yield data and none of it is ever seeded into a runtime database. */
import { ACRE_HA, parseCsv, toKgPerHa, validateYieldCsv } from '../src/domain/yield/yield-csv';

const HEADER =
  'crop,province,district,season,year,value,unit,source_name,source_url,licence_status';
const row = (over: Partial<Record<string, string>> = {}): string => {
  const base: Record<string, string> = {
    crop: 'Wheat',
    province: 'Punjab',
    district: 'Testville',
    season: 'rabi',
    year: '2015',
    value: '2000',
    unit: 'kg_per_ha',
    source_name: 'SYNTHETIC TEST FIXTURE',
    source_url: 'https://example.invalid/fixture',
    licence_status: 'unverified',
    ...over,
  };
  return HEADER.split(',')
    .map((c) => base[c])
    .join(',');
};
const csv = (...rows: string[]): string => [HEADER, ...rows].join('\n');

describe('F13 unit conversion', () => {
  it('converts with 1 maund = 40 kg and 1 acre = 0.4047 ha', () => {
    expect(toKgPerHa(1000, 'kg_per_ha')).toBe(1000);
    expect(toKgPerHa(1, 'maund_per_ha')).toBe(40);
    expect(toKgPerHa(2, 'tonne_per_ha')).toBe(2000);
    expect(toKgPerHa(100, 'kg_per_acre')).toBeCloseTo(100 / ACRE_HA, 9);
    expect(toKgPerHa(30, 'maund_per_acre')).toBeCloseTo((30 * 40) / 0.4047, 9);
  });
  it('rounds the normalized value to 3 decimals on a validated row', () => {
    const { rows, errors } = validateYieldCsv(csv(row({ value: '30', unit: 'maund_per_acre' })));
    expect(errors).toEqual([]);
    expect(rows[0]?.yieldKgPerHa).toBe(2965.159);
    expect(rows[0]?.publishedValue).toBe(30);
    expect(rows[0]?.publishedUnit).toBe('maund_per_acre');
  });
});

describe('F13 CSV parsing', () => {
  it('handles quotes, doubled quotes, CRLF and BOM', () => {
    expect(parseCsv('﻿a,"b,c","d""e"\r\n1,2,3\r\n')).toEqual([
      ['a', 'b,c', 'd"e'],
      ['1', '2', '3'],
    ]);
  });
  it('throws on an unterminated quote', () => {
    expect(() => parseCsv('a,"b\n')).toThrow(/unterminated/);
  });
});

describe('F13 strict validation', () => {
  it('accepts a valid row and normalizes names', () => {
    const { rows, errors } = validateYieldCsv(csv(row({ crop: '  WHEAT ' })));
    expect(errors).toEqual([]);
    expect(rows[0]).toMatchObject({ crop: 'wheat', district: 'testville', season: 'RABI' });
  });
  it.each([
    ['source_name', ''],
    ['source_url', ''],
    ['source_url', 'ftp://x'],
    ['licence_status', ''],
    ['licence_status', 'restricted'],
    ['unit', 'bushels'],
    ['season', 'summer'],
    ['year', '15'],
    ['value', '-3'],
    ['value', '0'],
    ['value', '1e3'],
    ['value', 'abc'],
    ['district', ''],
    ['crop', ''],
    ['province', ''],
    ['value', '999999'],
  ])('rejects %s = %p', (col, val) => {
    const { rows, errors } = validateYieldCsv(csv(row({ [col]: val })));
    expect(rows).toEqual([]);
    expect(errors).toHaveLength(1);
    expect(errors[0]?.line).toBe(2);
  });
  it('rejects a wrong header and a wrong field count', () => {
    expect(validateYieldCsv('crop,year\nwheat,2015').errors[0]?.line).toBe(1);
    expect(validateYieldCsv(csv('wheat,2015')).errors[0]?.message).toMatch(/Expected 10 fields/);
    expect(validateYieldCsv('').errors[0]?.message).toMatch(/empty/);
  });
  it('flags duplicate and conflicting keys within one file', () => {
    const dup = validateYieldCsv(csv(row(), row()));
    expect(dup.errors[0]?.message).toMatch(/Duplicate of line 2/);
    const conflict = validateYieldCsv(csv(row(), row({ value: '2100' })));
    expect(conflict.errors[0]?.message).toMatch(/Conflicts with line 2/);
  });
  it('reports every bad row, not only the first', () => {
    const { errors } = validateYieldCsv(
      csv(row({ unit: 'x' }), row({ year: '2016' }), row({ year: 'x' })),
    );
    expect(errors.map((e) => e.line)).toEqual([2, 4]);
  });
});

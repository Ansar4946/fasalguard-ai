import {
  AmisParseError,
  normalizeCropName,
  normalizeMarketName,
  parseAmisCommodityPage,
} from '../src/domain/market/providers/amis-html.parser';

const fixture = `
<html><body><table>
  <tr><td>Dated:03-09-2026</td><td>Graph</td><td>Min</td><td>Max</td><td>FQP</td><td>Quantity</td></tr>
  <tr><td><b>1 <a href="ViewPrices.aspx">Faisalabad</a></b></td><td>Graph</td><td>11,500</td><td>12000</td><td>11750</td><td>-</td></tr>
  <tr><td><b>2 <a href="ViewPrices.aspx">Lahore</a></b></td><td>Graph</td><td>-</td><td>-</td><td>-</td><td>-</td></tr>
</table></body></html>`;

describe('AMIS HTML parser', () => {
  it('parses the AMIS column order and skips unavailable rows', () => {
    expect(parseAmisCommodityPage(fixture, 'wheat', 'http://www.amis.pk/example')).toEqual([
      {
        crop: 'Wheat', market: 'Faisalabad', district: 'Faisalabad', province: 'Punjab',
        minimumPrice: 11500, maximumPrice: 12000, averagePrice: 11750,
        quantity: 100, unit: 'KG', source: 'AMIS', priceDate: '2026-09-03',
        sourceIdentifier: 'AMIS:wheat:Faisalabad:2026-09-03',
        sourceUrl: 'http://www.amis.pk/example',
      },
    ]);
  });

  it('normalizes supported aliases', () => {
    expect(normalizeCropName('Seed Cotton(Phutti)')).toBe('Cotton');
    expect(normalizeMarketName('12 MandiBahaudin')).toBe('Mandi Bahauddin');
  });

  it('rejects a page without an observation date', () => {
    expect(() => parseAmisCommodityPage('<html></html>', 'Wheat', 'http://www.amis.pk')).toThrow(
      AmisParseError,
    );
  });
});

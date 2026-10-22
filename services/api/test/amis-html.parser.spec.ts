import {
  AmisParseError,
  normalizeCropName,
  normalizeMarketName,
  parseAmisCommodityPage,
} from '../src/domain/market/providers/amis-html.parser';

const fixture = `
<html><body><span id="ctl00_cphPage_lblMsg">Wheat</span><p>Prices are in Rs/100Kg</p><table>
  <tr><td>Dated:03-09-2026</td><td>Graph</td><td>Min</td><td>Max</td><td>FQP</td><td>Quantity</td></tr>
  <tr><td><b>1 <a href="ViewPrices.aspx">Faisalabad</a></b></td><td>Graph</td><td>11,500</td><td>12000</td><td>11750</td><td>-</td></tr>
  <tr><td><b>2 <a href="ViewPrices.aspx">Lahore</a></b></td><td>Graph</td><td>-</td><td>-</td><td>-</td><td>-</td></tr>
</table></body></html>`;

describe('AMIS HTML parser', () => {
  it('parses the AMIS column order and skips unavailable rows', () => {
    expect(parseAmisCommodityPage(fixture, 'wheat', 'http://www.amis.pk/example')).toEqual([
      {
        crop: 'Wheat',
        market: 'Faisalabad',
        district: 'Unknown',
        province: 'Punjab',
        minimumPrice: 11500,
        maximumPrice: 12000,
        averagePrice: 11750,
        quantity: 100,
        unit: 'KG',
        source: 'AMIS',
        priceDate: '2026-09-03',
        sourceIdentifier: 'AMIS:Wheat:Faisalabad:2026-09-03',
        sourceUrl: 'http://www.amis.pk/example',
      },
    ]);
  });

  it('normalizes supported aliases', () => {
    expect(normalizeCropName('Seed Cotton(Phutti)')).toBe('Cotton');
    expect(normalizeMarketName('12 MandiBahaudin')).toBe('Mandi Bahauddin');
  });

  it('removes the malformed non-breaking-space marker returned by AMIS', () => {
    const html = fixture.replace('Faisalabad</a>', '&Nbsp Faisalabad</a>');
    expect(parseAmisCommodityPage(html, 'Wheat', 'http://www.amis.pk')[0]?.market).toBe(
      'Faisalabad',
    );
  });

  it('rejects a page without an observation date', () => {
    expect(() => parseAmisCommodityPage('<html></html>', 'Wheat', 'http://www.amis.pk')).toThrow(
      AmisParseError,
    );
  });
});

describe('AMIS scientific provenance', () => {
  it('rejects missing or wrong selected commodity even if navigation mentions wheat', () => {
    for (const html of [
      fixture.replace('>Wheat</span>', '>Maize</span>'),
      fixture.replace('id="ctl00_cphPage_lblMsg"', 'id="navigation"'),
    ])
      expect(() => parseAmisCommodityPage(html, 'Wheat', 'http://www.amis.pk')).toThrow(
        AmisParseError,
      );
  });
  it('requires declared100kg units and rejects mixed units', () => {
    for (const html of [
      fixture.replace('Rs/100Kg', 'Rs/40Kg'),
      fixture.replace('Rs/100Kg', 'prices'),
      fixture + '<p>PKR/40Kg</p>',
    ])
      expect(() => parseAmisCommodityPage(html, 'Wheat', 'http://www.amis.pk')).toThrow(
        AmisParseError,
      );
  });
  it('rejects invalid and future calendar dates', () => {
    for (const date of ['30-02-2026', '01-01-2099'])
      expect(() =>
        parseAmisCommodityPage(fixture.replace('03-09-2026', date), 'Wheat', 'http://www.amis.pk'),
      ).toThrow(AmisParseError);
  });
  it('does not infer the district from a market name', () =>
    expect(
      parseAmisCommodityPage(
        fixture.replace('Faisalabad</a>', 'Multan Road Lahore</a>'),
        'Wheat',
        'http://www.amis.pk',
      )[0]?.district,
    ).toBe('Unknown'));
});

it('valid no-quote table stays empty instead of fabricating values', () =>
  expect(
    parseAmisCommodityPage(fixture.replace('11,500', '-'), 'Wheat', 'http://www.amis.pk'),
  ).toEqual([]));
it('missing price-table columns is a provider contract failure', () =>
  expect(() =>
    parseAmisCommodityPage(fixture.replace('>FQP<', '>Unknown<'), 'Wheat', 'http://www.amis.pk'),
  ).toThrow(AmisParseError));

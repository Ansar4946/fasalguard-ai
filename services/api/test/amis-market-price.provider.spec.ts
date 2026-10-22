import { ConfigService } from '@nestjs/config';
import { AmisMarketPriceProvider } from '../src/domain/market/providers/amis-market-price.provider';

const fixture = `
<html><body><span id="ctl00_cphPage_lblMsg">Wheat</span><p>Prices are in Rs/100Kg</p><table>
  <tr><td>Dated:03-09-2026</td><td>Graph</td><td>Min</td><td>Max</td><td>FQP</td></tr>
  <tr><td><b>1 <a href="ViewPrices.aspx">Faisalabad</a></b></td><td>Graph</td><td>11,500</td><td>12000</td><td>11750</td></tr>
</table></body></html>`;

const config = (enabled: boolean, baseUrl = 'http://www.amis.pk'): ConfigService =>
  new ConfigService({
    amisSyncEnabled: enabled,
    amisBaseUrl: baseUrl,
    amisTimeoutSeconds: 5,
    amisRequestDelaySeconds: 0,
  });

const htmlResponse = (html: string): Response =>
  new Response(html, { status: 200, headers: { 'content-type': 'text/html; charset=utf-8' } });

describe('AmisMarketPriceProvider', () => {
  it('cannot be used unless an operator explicitly enables AMIS synchronization', async () => {
    const provider = new AmisMarketPriceProvider(config(false), jest.fn());
    await expect(provider.fetchCurrentPrices()).rejects.toMatchObject({
      code: 'AMIS_SYNC_DISABLED',
      retryable: false,
    });
  });

  it('fetches and normalizes AMIS HTML without the Python service', async () => {
    const names: Record<string, string> = {
      '1': 'Wheat',
      '17': 'Maize',
      '4': 'Rice (IRRI)',
      '49': 'Seed Cotton(Phutti)',
      '125': 'sugarcane',
    };
    const fetcher = jest
      .fn()
      .mockImplementation((url: URL) =>
        Promise.resolve(
          htmlResponse(
            fixture.replace(
              '>Wheat</span>',
              '>' + names[url.searchParams.get('commodityId')!] + '</span>',
            ),
          ),
        ),
      );
    const provider = new AmisMarketPriceProvider(config(true), fetcher);

    const records = await provider.fetchCurrentPrices();
    expect(records).toHaveLength(5);
    expect(records[0]).toEqual(
      expect.objectContaining({ crop: 'Wheat', market: 'Faisalabad', averagePrice: 11750 }),
    );
    expect(fetcher).toHaveBeenCalledTimes(5);
    expect(String((fetcher.mock.calls as unknown[][])[0]?.[0])).toBe(
      'http://www.amis.pk/ViewPrices.aspx?searchType=0&commodityId=1',
    );
  });

  it('rejects an unapproved AMIS origin', async () => {
    const provider = new AmisMarketPriceProvider(config(true, 'https://example.com'), jest.fn());
    await expect(provider.fetchCurrentPrices()).rejects.toMatchObject({
      code: 'AMIS_INVALID_ORIGIN',
      retryable: false,
    });
  });

  it('rejects malformed AMIS HTML', async () => {
    const fetcher = jest.fn().mockResolvedValue(htmlResponse('<html><table></table></html>'));
    const provider = new AmisMarketPriceProvider(config(true), fetcher);
    await expect(provider.fetchCurrentPrices()).rejects.toMatchObject({
      code: 'AMIS_INVALID_RESPONSE',
    });
  });
});

describe('AMIS provider outages', () => {
  const fresh = (url: URL): Response => {
    const names: Record<string, string> = {
      '1': 'Wheat',
      '17': 'Maize',
      '4': 'Rice (IRRI)',
      '49': 'Seed Cotton(Phutti)',
      '125': 'sugarcane',
    };
    return htmlResponse(
      fixture.replace(
        '>Wheat</span>',
        '>' + names[url.searchParams.get('commodityId')!] + '</span>',
      ),
    );
  };
  it('retries503 and recovers without fabricated observations', async () => {
    const fetcher = jest
      .fn()
      .mockResolvedValueOnce(new Response('unavailable', { status: 503 }))
      .mockImplementation((url: URL) => Promise.resolve(fresh(url)));
    expect(
      await new AmisMarketPriceProvider(config(true), fetcher).fetchCurrentPrices(),
    ).toHaveLength(5);
    expect(fetcher).toHaveBeenCalledTimes(6);
  });
  it('does not retry permanent404 or return fallback prices', async () => {
    const fetcher = jest.fn().mockResolvedValue(new Response('missing', { status: 404 }));
    await expect(
      new AmisMarketPriceProvider(config(true), fetcher).fetchCurrentPrices(),
    ).rejects.toMatchObject({ code: 'AMIS_UPSTREAM_FAILURE', retryable: false });
    expect(fetcher).toHaveBeenCalledTimes(1);
  });
  it('bounds chunked responses', async () => {
    const fetcher = jest.fn().mockResolvedValue(htmlResponse('x'.repeat(2000001)));
    await expect(
      new AmisMarketPriceProvider(config(true), fetcher).fetchCurrentPrices(),
    ).rejects.toMatchObject({ code: 'AMIS_INVALID_RESPONSE' });
  });
  it('timeouts abort and exhaust a bounded retry policy', async () => {
    const fetcher = jest.fn().mockImplementation(
      (_url: URL, init: RequestInit) =>
        new Promise((_resolve, reject) =>
          init.signal!.addEventListener('abort', () => reject(new Error('abort')), {
            once: true,
          }),
        ),
    );
    const cfg = config(true);
    cfg.set('amisTimeoutSeconds', 0.01);
    await expect(
      new AmisMarketPriceProvider(cfg, fetcher).fetchCurrentPrices(),
    ).rejects.toMatchObject({ code: 'AMIS_UPSTREAM_FAILURE' });
    expect(fetcher).toHaveBeenCalledTimes(3);
  });
});

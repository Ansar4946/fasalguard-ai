import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { ConfigService } from '@nestjs/config';
import type { DataSource } from 'typeorm';
import { CopernicusSentinelHubProvider } from '../src/domain/satellite/providers/copernicus-sentinel-hub.provider';
const fixture = JSON.parse(
  readFileSync(join(__dirname, 'fixtures/sentinel-hub-catalog.json'), 'utf8'),
) as unknown;
const polygon = {
  type: 'Polygon' as const,
  coordinates: [
    [
      [71.45, 30.15],
      [71.46, 30.15],
      [71.46, 30.16],
      [71.45, 30.16],
      [71.45, 30.15],
    ],
  ],
};
function config(): ConfigService {
  return new ConfigService({
    sentinelHubBaseUrl: 'https://services.sentinel-hub.com',
    sentinelHubClientId: 'test-client',
    sentinelHubClientSecret: 'test-secret',
  });
}
describe('CopernicusSentinelHubProvider', () => {
  it('authenticates once, searches the recorded Catalog fixture, and removes asset URLs', async () => {
    const calls: string[] = [];
    const fetcher = jest.fn((input: string | URL | Request) => {
      const url = typeof input === 'string' ? input : input instanceof URL ? input.href : input.url;
      calls.push(url);
      if (url.includes('/token'))
        return Promise.resolve(
          new Response(JSON.stringify({ access_token: 'sanitized-token', expires_in: 3600 }), {
            status: 200,
            headers: { 'content-type': 'application/json' },
          }),
        );
      return Promise.resolve(
        new Response(JSON.stringify(fixture), {
          status: 200,
          headers: { 'content-type': 'application/json', 'x-request-id': 'catalog-fixture-1' },
        }),
      );
    }) as typeof fetch;
    const query = jest.fn().mockResolvedValue([]);
    const db = { query } as unknown as DataSource;
    const provider = new CopernicusSentinelHubProvider(config(), db, fetcher);
    const input = {
      polygon,
      from: new Date('2026-07-01T00:00:00Z'),
      to: new Date('2026-08-02T00:00:00Z'),
      maxCloudCoverage: 20,
    };
    const first = await provider.searchCatalog(input);
    await provider.searchCatalog(input);
    expect(first[0]).toMatchObject({
      id: 'S2B_MSIL2A_20260801T053639_N0511_R005_T43SCT_20260801T082312',
      satellite: 'sentinel-2b',
      cloudCoverage: 8.42,
    });
    expect(first[0]?.rawMetadata).not.toHaveProperty('assets');
    expect(calls.filter((x) => x.includes('/token'))).toHaveLength(1);
    expect(calls.filter((x) => x.includes('/catalog/'))).toHaveLength(2);
    expect(query).toHaveBeenCalled();
  });
  it('normalizes authentication errors without leaking provider response or credentials', async () => {
    const fetcher = jest.fn(() =>
      Promise.resolve(
        new Response(JSON.stringify({ error: 'invalid_client', detail: 'secret' }), {
          status: 401,
        }),
      ),
    ) as typeof fetch;
    const db = { query: jest.fn().mockResolvedValue([]) } as unknown as DataSource;
    const provider = new CopernicusSentinelHubProvider(config(), db, fetcher);
    await expect(
      provider.searchCatalog({
        polygon,
        from: new Date('2026-07-01'),
        to: new Date('2026-08-01'),
        maxCloudCoverage: 30,
      }),
    ).rejects.toMatchObject({ code: 'PROVIDER_AUTH_FAILED', retryable: false, statusCode: 401 });
  });
  it('returns Process API imagery as binary rather than deriving statistics from rendered colors', async () => {
    const tiff = Buffer.from([0x49, 0x49, 0x2a, 0x00]);
    const fetcher = jest.fn((input: string | URL | Request) => {
      const url = typeof input === 'string' ? input : input instanceof URL ? input.href : input.url;
      if (url.includes('/token'))
        return Promise.resolve(
          new Response(JSON.stringify({ access_token: 'token', expires_in: 60 }), { status: 200 }),
        );
      return Promise.resolve(
        new Response(tiff, { status: 200, headers: { 'content-type': 'image/tiff' } }),
      );
    }) as typeof fetch;
    const provider = new CopernicusSentinelHubProvider(
      config(),
      { query: jest.fn().mockResolvedValue([]) } as unknown as DataSource,
      fetcher,
    );
    const rendered = await provider.render({ evalscript: 'sanitized-test-script' });
    expect(rendered.contentType).toBe('image/tiff');
    expect(rendered.body).toEqual(tiff);
  });
});

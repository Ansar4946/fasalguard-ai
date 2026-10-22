import { ConfigService } from '@nestjs/config';
import { JwtService } from '@nestjs/jwt';
import { Reflector } from '@nestjs/core';
import { ClientThrottlerGuard } from '../src/common/guards/client-throttler.guard';
import { parseTrustProxy } from '../src/config/configuration';

const secret = 's'.repeat(48);
const claimsConfig: Record<string, string> = {
  jwtAccessSecret: secret,
  jwtIssuer: 'iss',
  jwtAudience: 'aud',
};

describe('ClientThrottlerGuard tracker', () => {
  const jwt = new JwtService({});
  const config = { getOrThrow: (key: string) => claimsConfig[key] } as unknown as ConfigService;
  const guard = new ClientThrottlerGuard(
    { throttlers: [{ ttl: 60_000, limit: 5 }] },
    {} as never,
    new Reflector(),
    jwt,
    config,
  );
  const track = (req: Record<string, unknown>): Promise<string> =>
    (guard as unknown as { getTracker(r: Record<string, unknown>): Promise<string> }).getTracker(
      req,
    );
  const token = (extra: Record<string, unknown> = {}, signWith = secret): Promise<string> =>
    jwt.signAsync(
      { sub: 'user-1', type: 'access', ...extra },
      { secret: signWith, issuer: 'iss', audience: 'aud' },
    );

  it('keys on a verified bearer user id so users behind one IP get separate buckets', async () => {
    const headers = { authorization: `Bearer ${await token()}` };
    expect(await track({ headers, ip: '10.0.0.1' })).toBe('user:user-1');
  });
  it('prefers an already-attached request user', async () => {
    expect(await track({ headers: {}, user: { userId: 'u9' }, ip: '10.0.0.1' })).toBe('user:u9');
  });
  it('falls back to req.ip for anonymous, forged, or wrong-type tokens', async () => {
    expect(await track({ headers: {}, ip: '203.0.113.7' })).toBe('ip:203.0.113.7');
    const forged = { authorization: `Bearer ${await token({}, 'z'.repeat(48))}` };
    expect(await track({ headers: forged, ip: '203.0.113.7' })).toBe('ip:203.0.113.7');
    const refresh = { authorization: `Bearer ${await token({ type: 'refresh' })}` };
    expect(await track({ headers: refresh, ip: '203.0.113.7' })).toBe('ip:203.0.113.7');
  });
  it('ignores a spoofed X-Forwarded-For unless Express resolved it into req.ip', async () => {
    const headers = { 'x-forwarded-for': '1.2.3.4' };
    expect(await track({ headers, ip: '10.0.0.1' })).toBe('ip:10.0.0.1');
  });
});

describe('parseTrustProxy', () => {
  it('defaults off and accepts hop counts', () => {
    expect(parseTrustProxy(undefined)).toBe(false);
    expect(parseTrustProxy('false')).toBe(false);
    expect(parseTrustProxy('true')).toBe(true);
    expect(parseTrustProxy('2')).toBe(2);
    expect(parseTrustProxy('junk')).toBe(false);
  });
});

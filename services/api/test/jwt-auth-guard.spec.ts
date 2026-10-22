import {
  ServiceUnavailableException,
  UnauthorizedException,
  type ExecutionContext,
} from '@nestjs/common';
import type { Reflector } from '@nestjs/core';
import type { ConfigService } from '@nestjs/config';
import type { JwtService } from '@nestjs/jwt';
import type { DataSource } from 'typeorm';
import { JwtAuthGuard } from '../src/domain/auth/guards/jwt-auth.guard';

function build(options: {
  claims?: object;
  verifyFails?: boolean;
  queryResult?: unknown[];
  queryFails?: boolean;
}): JwtAuthGuard {
  const reflector = { getAllAndOverride: () => false } as unknown as Reflector;
  const jwt = {
    verifyAsync: () =>
      options.verifyFails
        ? Promise.reject(new Error('bad token'))
        : Promise.resolve(
            options.claims ?? { sub: 'u1', sid: 's1', role: 'FARMER', type: 'access' },
          ),
  } as unknown as JwtService;
  const config = { getOrThrow: () => 'x' } as unknown as ConfigService;
  const dataSource = {
    query: () =>
      options.queryFails
        ? Promise.reject(new Error('connection refused'))
        : Promise.resolve(options.queryResult ?? [{ user_id: 'u1', role: 'FARMER' }]),
  } as unknown as DataSource;
  return new JwtAuthGuard(reflector, jwt, config, dataSource);
}

function context(): ExecutionContext {
  const req = { headers: { authorization: 'Bearer token' } };
  return {
    getHandler: () => undefined,
    getClass: () => undefined,
    switchToHttp: () => ({ getRequest: () => req }),
  } as unknown as ExecutionContext;
}

describe('JwtAuthGuard failure mapping', () => {
  it('accepts a valid token with an active session', async () => {
    await expect(build({}).canActivate(context())).resolves.toBe(true);
  });
  it('returns 401 for a bad signature or expired token', async () => {
    await expect(build({ verifyFails: true }).canActivate(context())).rejects.toBeInstanceOf(
      UnauthorizedException,
    );
  });
  it('returns 401 for a refresh token used as an access token', async () => {
    await expect(
      build({ claims: { sub: 'u1', sid: 's1', role: 'FARMER', type: 'refresh' } }).canActivate(
        context(),
      ),
    ).rejects.toBeInstanceOf(UnauthorizedException);
  });
  it('returns 401 when the session is revoked or the user inactive', async () => {
    await expect(build({ queryResult: [] }).canActivate(context())).rejects.toBeInstanceOf(
      UnauthorizedException,
    );
  });
  it('returns 503, not 401, when the database is down', async () => {
    await expect(build({ queryFails: true }).canActivate(context())).rejects.toBeInstanceOf(
      ServiceUnavailableException,
    );
  });
});

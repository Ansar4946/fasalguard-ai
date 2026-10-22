import { Injectable } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { JwtService } from '@nestjs/jwt';
import { Reflector } from '@nestjs/core';
import { ThrottlerGuard, ThrottlerModuleOptions, ThrottlerStorage } from '@nestjs/throttler';

interface TrackedRequest {
  headers?: { authorization?: unknown };
  user?: { userId?: unknown };
  ip?: string;
  socket?: { remoteAddress?: string };
}
/**
 * Rate-limit bucket selection.
 *  1. Authenticated user id (bearer token whose signature, issuer, audience and type verify).
 *     This guard runs before JwtAuthGuard, so the token is verified here without a DB lookup;
 *     a forged or expired token simply falls through to the IP bucket.
 *  2. Client IP from `req.ip`. Express derives it from X-Forwarded-For only when TRUST_PROXY
 *     is configured; otherwise it is the socket address.
 * Storage is the default in-memory store: limits are per API instance, not shared across replicas.
 */
@Injectable()
export class ClientThrottlerGuard extends ThrottlerGuard {
  constructor(
    options: ThrottlerModuleOptions,
    storageService: ThrottlerStorage,
    reflector: Reflector,
    private readonly jwt: JwtService,
    private readonly config: ConfigService,
  ) {
    super(options, storageService, reflector);
  }
  // eslint-disable-next-line @typescript-eslint/no-explicit-any -- signature mandated by ThrottlerGuard
  protected override async getTracker(request: Record<string, any>): Promise<string> {
    const req = request as TrackedRequest;
    const userId = req.user?.userId ?? (await this.verifiedUserId(req));
    if (typeof userId === 'string' && userId) return `user:${userId}`;
    return `ip:${req.ip ?? req.socket?.remoteAddress ?? 'unknown'}`;
  }
  private async verifiedUserId(req: TrackedRequest): Promise<string | null> {
    const header = req.headers?.authorization;
    if (typeof header !== 'string' || !header.startsWith('Bearer ')) return null;
    try {
      const claims = await this.jwt.verifyAsync<{ sub?: string; type?: string }>(header.slice(7), {
        secret: this.config.getOrThrow<string>('jwtAccessSecret'),
        issuer: this.config.getOrThrow<string>('jwtIssuer'),
        audience: this.config.getOrThrow<string>('jwtAudience'),
      });
      return claims.type === 'access' && typeof claims.sub === 'string' ? claims.sub : null;
    } catch {
      return null;
    }
  }
}

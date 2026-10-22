import { createHash, timingSafeEqual } from 'node:crypto';
import {
  type CanActivate,
  type ExecutionContext,
  ForbiddenException,
  Injectable,
  ServiceUnavailableException,
  UnauthorizedException,
} from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import type { Request } from 'express';

/**
 * Service-to-service authentication for `/internal/*` routes (platform-api -> core). Compares the
 * `x-internal-token` header with INTERNAL_SERVICE_TOKEN in constant time (both sides are hashed to
 * equal-length digests first so neither the value nor its length leaks through timing). Fails closed
 * when the token is not configured. The presented value is never logged or echoed.
 */
@Injectable()
export class InternalServiceTokenGuard implements CanActivate {
  constructor(private readonly config: ConfigService) {}

  canActivate(context: ExecutionContext): boolean {
    const expected =
      this.config.get<string>('INTERNAL_SERVICE_TOKEN') ?? process.env.INTERNAL_SERVICE_TOKEN;
    if (!expected)
      throw new ServiceUnavailableException({
        code: 'INTERNAL_ENDPOINT_DISABLED',
        message: 'Internal service calls are not configured.',
      });
    const header = context.switchToHttp().getRequest<Request>().headers['x-internal-token'];
    const presented = Array.isArray(header) ? header[0] : header;
    if (!presented)
      throw new UnauthorizedException({
        code: 'INTERNAL_TOKEN_REQUIRED',
        message: 'A service token is required.',
      });
    const a = createHash('sha256').update(presented).digest();
    const b = createHash('sha256').update(expected).digest();
    if (!timingSafeEqual(a, b))
      throw new ForbiddenException({
        code: 'INTERNAL_TOKEN_INVALID',
        message: 'The service token is not valid.',
      });
    return true;
  }
}

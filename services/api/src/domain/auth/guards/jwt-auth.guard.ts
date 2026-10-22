import {
  CanActivate,
  ExecutionContext,
  Injectable,
  ServiceUnavailableException,
  UnauthorizedException,
} from '@nestjs/common';
import { JwtService } from '@nestjs/jwt';
import { Reflector } from '@nestjs/core';
import type { Request } from 'express';
import { DataSource } from 'typeorm';
import { ConfigService } from '@nestjs/config';
import { IS_PUBLIC_KEY } from '../decorators/public.decorator';
import type { AuthPrincipal } from '../auth.types';
import { UserRole } from '../../identity/identity.enums';
interface Claims {
  sub: string;
  sid: string;
  role: UserRole;
  type: string;
}
@Injectable()
export class JwtAuthGuard implements CanActivate {
  constructor(
    private readonly reflector: Reflector,
    private readonly jwt: JwtService,
    private readonly config: ConfigService,
    private readonly dataSource: DataSource,
  ) {}
  async canActivate(context: ExecutionContext): Promise<boolean> {
    if (
      this.reflector.getAllAndOverride<boolean>(IS_PUBLIC_KEY, [
        context.getHandler(),
        context.getClass(),
      ])
    )
      return true;
    const req = context.switchToHttp().getRequest<Request & { user?: AuthPrincipal }>();
    const header = req.headers.authorization;
    if (!header?.startsWith('Bearer '))
      throw new UnauthorizedException({
        code: 'AUTHENTICATION_REQUIRED',
        message: 'A valid bearer token is required.',
      });
    const invalid = (): UnauthorizedException =>
      new UnauthorizedException({
        code: 'INVALID_ACCESS_TOKEN',
        message: 'The access token is invalid or expired.',
      });
    let claims: Claims;
    try {
      claims = await this.jwt.verifyAsync<Claims>(header.slice(7), {
        secret: this.config.getOrThrow<string>('jwtAccessSecret'),
        issuer: this.config.getOrThrow<string>('jwtIssuer'),
        audience: this.config.getOrThrow<string>('jwtAudience'),
      });
    } catch {
      throw invalid();
    }
    if (claims.type !== 'access') throw invalid();
    let rows: Array<{ user_id: string; role: UserRole }>;
    try {
      rows = await this.dataSource.query(
        `SELECT s.user_id,u.role FROM auth_sessions s JOIN users u ON u.id=s.user_id WHERE s.id=$1 AND s.user_id=$2 AND s.revoked_at IS NULL AND s.expires_at>now() AND u.status='active' AND u.deleted_at IS NULL`,
        [claims.sid, claims.sub],
      );
    } catch {
      // A database failure is not an invalid credential: report it as unavailable
      // so clients keep the session instead of signing the user out.
      throw new ServiceUnavailableException({
        code: 'SESSION_STORE_UNAVAILABLE',
        message: 'Authentication is temporarily unavailable. Please retry.',
      });
    }
    const active = rows[0];
    if (!active) throw invalid();
    req.user = { userId: active.user_id, sessionId: claims.sid, role: active.role };
    return true;
  }
}

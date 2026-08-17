import { CanActivate, ExecutionContext, ForbiddenException, Injectable } from '@nestjs/common';
import { Reflector } from '@nestjs/core';
import type { Request } from 'express';
import type { AuthPrincipal } from '../auth.types';
import { ROLES_KEY } from '../decorators/roles.decorator';
import type { UserRole } from '../../identity/identity.enums';
@Injectable()
export class RolesGuard implements CanActivate {
  constructor(private readonly reflector: Reflector) {}
  canActivate(context: ExecutionContext): boolean {
    const roles = this.reflector.getAllAndOverride<UserRole[]>(ROLES_KEY, [
      context.getHandler(),
      context.getClass(),
    ]);
    if (!roles?.length) return true;
    const principal = context.switchToHttp().getRequest<Request & { user?: AuthPrincipal }>().user;
    if (!principal || !roles.includes(principal.role))
      throw new ForbiddenException({
        code: 'INSUFFICIENT_ROLE',
        message: 'Your role does not permit this action.',
      });
    return true;
  }
}

import { createParamDecorator, type ExecutionContext } from '@nestjs/common';
import type { Request } from 'express';
import type { AuthPrincipal } from '../auth.types';
export const CurrentPrincipal = createParamDecorator(
  (_data: unknown, context: ExecutionContext): AuthPrincipal =>
    context.switchToHttp().getRequest<Request & { user: AuthPrincipal }>().user,
);

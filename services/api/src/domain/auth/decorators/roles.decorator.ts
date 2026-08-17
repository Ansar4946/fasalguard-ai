import { SetMetadata } from '@nestjs/common';
import type { UserRole } from '../../identity/identity.enums';
export const ROLES_KEY = 'roles';
export const Roles = (...roles: UserRole[]): MethodDecorator & ClassDecorator =>
  SetMetadata(ROLES_KEY, roles);

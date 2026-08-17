import type { UserRole, UserStatus } from '../identity/identity.enums';
export interface AuthPrincipal {
  userId: string;
  sessionId: string;
  role: UserRole;
}
export interface SessionContext {
  ipAddress: string | null;
  userAgent: string | null;
}
export interface TokenPair {
  accessToken: string;
  refreshToken: string;
  tokenType: 'Bearer';
  expiresIn: number;
}
export interface CurrentUser {
  id: string;
  email: string | null;
  phone: string | null;
  role: UserRole;
  status: UserStatus;
}

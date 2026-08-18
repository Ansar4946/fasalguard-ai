import 'server-only';
import { cookies } from 'next/headers';
import type { ApiErrorBody, CurrentUser } from '@/features/auth/types';
export const ACCESS_COOKIE = 'fg_access'; export const REFRESH_COOKIE = 'fg_refresh';
const apiBase = () => (process.env.FASALGUARD_API_URL ?? 'http://localhost:4000/api/v1').replace(/\/$/, '');
interface Tokens { accessToken: string; refreshToken: string; expiresIn: number }
export async function backendJson<T>(path: string, init: RequestInit = {}): Promise<{ response: Response; body: T & ApiErrorBody }> { const response = await fetch(`${apiBase()}${path}`, { ...init, cache: 'no-store', headers: { 'content-type': 'application/json', ...init.headers }, signal: AbortSignal.timeout(12_000) }); return { response, body: (await response.json().catch(() => ({}))) as T & ApiErrorBody } }
export async function readTokens() { const store = await cookies(); return { access: store.get(ACCESS_COOKIE)?.value, refresh: store.get(REFRESH_COOKIE)?.value } }
export async function setSessionCookies(tokens: Tokens) { const store = await cookies(); const secure = process.env.NODE_ENV === 'production'; store.set(ACCESS_COOKIE, tokens.accessToken, { httpOnly: true, secure, sameSite: 'lax', path: '/', maxAge: Math.max(60, tokens.expiresIn) }); store.set(REFRESH_COOKIE, tokens.refreshToken, { httpOnly: true, secure, sameSite: 'lax', path: '/', maxAge: 30 * 86400 }) }
export async function clearSessionCookies() { const store = await cookies(); const secure = process.env.NODE_ENV === 'production'; store.set(ACCESS_COOKIE, '', { httpOnly: true, secure, sameSite: 'lax', path: '/', maxAge: 0 }); store.set(REFRESH_COOKIE, '', { httpOnly: true, secure, sameSite: 'lax', path: '/', maxAge: 0 }) }
export async function refreshSession(refreshToken: string): Promise<Tokens | null> { const { response, body } = await backendJson<Tokens>('/auth/refresh', { method: 'POST', body: JSON.stringify({ refreshToken }) }); if (!response.ok) return null; await setSessionCookies(body); return body }
export async function fetchCurrentUser(accessToken: string): Promise<CurrentUser | null> { const { response, body } = await backendJson<CurrentUser>('/auth/me', { headers: { authorization: `Bearer ${accessToken}` } }); return response.ok ? body : null }
export function safeBackendError(body: ApiErrorBody, status: number) { return { error: { code: body.error?.code ?? 'AUTHENTICATION_FAILED', message: status === 401 ? 'No account found for that email or phone number.' : body.error?.message ?? 'Authentication is temporarily unavailable.' } } }
export function mutationOriginAllowed(request: Request): boolean { const origin = request.headers.get('origin'); if (!origin) return process.env.NODE_ENV !== 'production'; return origin === new URL(request.url).origin }
export function apiError(body: ApiErrorBody, status: number) { return { error: { code: body.error?.code ?? 'REQUEST_FAILED', message: body.error?.message ?? 'Something went wrong. Try again.' }, status } }
export async function authenticatedJson<T>(path: string, init: RequestInit = {}): Promise<{ response: Response; body: T & ApiErrorBody }> {
  const { access, refresh } = await readTokens();
  if (!access) return { response: new Response(null, { status: 401 }), body: { error: { code: 'UNAUTHENTICATED', message: 'Sign in required.' } } as T & ApiErrorBody };
  let attempt = await backendJson<T>(path, { ...init, headers: { ...init.headers, authorization: `Bearer ${access}` } });
  if (attempt.response.status === 401 && refresh) {
    const renewed = await refreshSession(refresh);
    if (renewed) attempt = await backendJson<T>(path, { ...init, headers: { ...init.headers, authorization: `Bearer ${renewed.accessToken}` } });
  }
  return attempt;
}

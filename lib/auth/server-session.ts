import 'server-only';
import { cookies, headers } from 'next/headers';
import type { ApiErrorBody, CurrentUser } from '@/features/auth/types';
export const ACCESS_COOKIE = 'fg_access'; export const REFRESH_COOKIE = 'fg_refresh';
export type BackendService = 'core' | 'platform';
const apiBase = (service: BackendService = 'core') => ((service === 'platform' ? process.env.PLATFORM_API_URL : undefined) || process.env.FASALGUARD_API_URL || 'http://localhost:4000/api/v1').replace(/\/$/, '');
interface Tokens { accessToken: string; refreshToken: string; expiresIn: number }
// Forward the end-user address so the API can rate-limit per client instead of per web server.
// The API only honours it when TRUST_PROXY is set to the real number of proxy hops.
async function clientForwardHeaders(): Promise<Record<string, string>> { try { const incoming = await headers(); const forwarded = incoming.get('x-forwarded-for')?.slice(0, 512); return forwarded ? { 'x-forwarded-for': forwarded } : {} } catch { return {} } }
export async function backendJson<T>(path: string, init: RequestInit = {}, service: BackendService = 'core'): Promise<{ response: Response; body: T & ApiErrorBody }> { const response = await fetch(`${apiBase(service)}${path}`, { ...init, cache: 'no-store', headers: { 'content-type': 'application/json', ...(await clientForwardHeaders()), ...init.headers }, signal: AbortSignal.timeout(12_000) }); return { response, body: (await response.json().catch(() => ({}))) as T & ApiErrorBody } }
export async function readTokens() { const store = await cookies(); return { access: store.get(ACCESS_COOKIE)?.value, refresh: store.get(REFRESH_COOKIE)?.value } }
export async function setSessionCookies(tokens: Tokens) { const store = await cookies(); const secure = process.env.NODE_ENV === 'production'; store.set(ACCESS_COOKIE, tokens.accessToken, { httpOnly: true, secure, sameSite: 'lax', path: '/', maxAge: Math.max(60, tokens.expiresIn) }); store.set(REFRESH_COOKIE, tokens.refreshToken, { httpOnly: true, secure, sameSite: 'lax', path: '/', maxAge: 30 * 86400 }) }
export async function clearSessionCookies() { const store = await cookies(); const secure = process.env.NODE_ENV === 'production'; store.set(ACCESS_COOKIE, '', { httpOnly: true, secure, sameSite: 'lax', path: '/', maxAge: 0 }); store.set(REFRESH_COOKIE, '', { httpOnly: true, secure, sameSite: 'lax', path: '/', maxAge: 0 }) }
export async function refreshSession(refreshToken: string): Promise<Tokens | null> { const { response, body } = await backendJson<Tokens>('/auth/refresh', { method: 'POST', body: JSON.stringify({ refreshToken }) }); if (!response.ok) return null; await setSessionCookies(body); return body }
export async function fetchCurrentUser(accessToken: string): Promise<CurrentUser | null> { const { response, body } = await backendJson<CurrentUser>('/auth/me', { headers: { authorization: `Bearer ${accessToken}` } }); if (response.ok) return body; if (response.status === 401 || response.status === 403) return null; throw new Error(`Session lookup unavailable (${response.status})`) }
export function safeBackendError(body: ApiErrorBody, status: number) { return { error: { code: body.error?.code ?? 'AUTHENTICATION_FAILED', message: status === 401 ? 'The email, phone number or password is incorrect.' : body.error?.message ?? 'Authentication is temporarily unavailable.' } } }
export { mutationOriginAllowed } from './origin-policy';
export function apiError(body: ApiErrorBody, status: number) { return { error: { code: body.error?.code ?? 'REQUEST_FAILED', message: body.error?.message ?? 'Something went wrong. Try again.' }, status } }
export async function authenticatedJson<T>(path: string, init: RequestInit = {}, service: BackendService = 'core'): Promise<{ response: Response; body: T & ApiErrorBody }> {
  const { access, refresh } = await readTokens();
  if (!access) return { response: new Response(null, { status: 401 }), body: { error: { code: 'UNAUTHENTICATED', message: 'Sign in required.' } } as T & ApiErrorBody };
  let attempt = await backendJson<T>(path, { ...init, headers: { ...init.headers, authorization: `Bearer ${access}` } }, service);
  if (attempt.response.status === 401 && refresh) {
    const renewed = await refreshSession(refresh);
    if (renewed) attempt = await backendJson<T>(path, { ...init, headers: { ...init.headers, authorization: `Bearer ${renewed.accessToken}` } }, service);
  }
  return attempt;
}

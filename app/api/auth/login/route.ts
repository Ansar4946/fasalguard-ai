import { randomUUID } from 'node:crypto'; import { NextResponse } from 'next/server'; import { z } from 'zod';
import { backendJson, mutationOriginAllowed, safeBackendError, setSessionCookies } from '@/lib/auth/server-session'; import type { CurrentUser } from '@/features/auth/types';
const schema = z.object({ identifier: z.string().trim().min(5).max(320) }).strict();
interface LoginResponse { user: CurrentUser; tokens: { accessToken: string; refreshToken: string; expiresIn: number } }
export async function POST(request: Request): Promise<Response> {
  if (!mutationOriginAllowed(request)) return NextResponse.json({ error: { code: 'INVALID_ORIGIN', message: 'Request origin was rejected.' } }, { status: 403 });
  const parsed = schema.safeParse(await request.json().catch(() => null)); if (!parsed.success) return NextResponse.json({ error: { code: 'INVALID_REQUEST', message: 'Enter a valid email or phone number.' } }, { status: 400 });
  try { const { response, body } = await backendJson<LoginResponse>('/auth/login', { method: 'POST', headers: { 'user-agent': request.headers.get('user-agent')?.slice(0, 512) ?? 'FasalGuard Web' }, body: JSON.stringify({ ...parsed.data, device: { deviceIdentifier: `web-${randomUUID()}`, platform: 'web' } }) }); if (!response.ok) return NextResponse.json(safeBackendError(body, response.status), { status: response.status }); await setSessionCookies(body.tokens); return NextResponse.json({ user: body.user }, { headers: { 'cache-control': 'no-store' } }) } catch { return NextResponse.json({ error: { code: 'AUTH_SERVICE_UNAVAILABLE', message: 'Authentication is temporarily unavailable.' } }, { status: 503 }) }
}

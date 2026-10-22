import 'server-only';
import { authenticatedJson, readTokens, refreshSession } from './server-session';

/** Explicit domain cutover; rollback keeps the existing core routes working. */
export async function satelliteJson(path: string, init: RequestInit = {}) {
  try {
    const result = await authenticatedJson(path, init, process.env.SATELLITE_PLATFORM_ENABLED === 'true' ? 'platform' : 'core');
    if (result.response.status === 409 && result.body.error?.code === 'LEGACY_CAPTURE')
      return await authenticatedJson(path, init, 'core');
    return result;
  } catch {
    return { response: new Response(null, { status: 503 }), body: { error: { code: 'SATELLITE_UNAVAILABLE', message: 'Satellite monitoring is temporarily unavailable. Try again shortly.' } } };
  }
}

export async function satelliteContent(path: string): Promise<Response> {
  const { access, refresh } = await readTokens();
  if (!access) return Response.json({ error: { message: 'Sign in required.' } }, { status: 401 });
  const base = process.env.PLATFORM_API_URL;
  if (!base) return Response.json({ error: { message: 'Satellite monitoring is unavailable.' } }, { status: 503 });
  try {
    const read = (token: string) => fetch(`${base.replace(/\/$/, '')}${path}`, {
      headers: { authorization: `Bearer ${token}` }, cache: 'no-store', signal: AbortSignal.timeout(12000), redirect: 'error',
    });
    let response = await read(access);
    if (response.status === 401 && refresh) {
      const renewed = await refreshSession(refresh);
      if (renewed) response = await read(renewed.accessToken);
    }
    if (!response.ok) return Response.json({ error: { message: 'Satellite layer could not be loaded.' } }, { status: response.status });
    const type = response.headers.get('content-type') ?? '';
    if (!['image/png', 'image/tiff'].includes(type) || Number(response.headers.get('content-length') ?? 0) > 64000000)
      return Response.json({ error: { message: 'Satellite layer is unavailable.' } }, { status: 503 });
    return new Response(response.body, { headers: { 'content-type': type, 'cache-control': 'private, no-store', 'x-content-type-options': 'nosniff' } });
  } catch {
    return Response.json({ error: { message: 'Satellite layer is temporarily unavailable.' } }, { status: 503 });
  }
}

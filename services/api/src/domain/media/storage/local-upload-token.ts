import { createHmac, timingSafeEqual } from 'node:crypto';

/**
 * Real presigned-URL semantics without a live DB lookup: possession of a correctly-signed,
 * unexpired token is the authorization, exactly like a real S3/OSS presigned URL. Shared
 * between LocalDiskStorageProvider (which mints tokens) and LocalStorageController (which
 * verifies them) so both always agree on the same secret and payload shape.
 */
interface TokenPayload {
  k: string;
  e: number;
  s: string;
}

export function signLocalUploadToken(
  secret: string,
  objectKey: string,
  method: 'PUT' | 'GET',
  expiresAt: number,
): string {
  const signature = createHmac('sha256', secret)
    .update(`${method}:${objectKey}:${expiresAt}`)
    .digest('hex');
  const payload: TokenPayload = { k: objectKey, e: expiresAt, s: signature };
  return Buffer.from(JSON.stringify(payload)).toString('base64url');
}

export function verifyLocalUploadToken(
  secret: string,
  token: string,
  method: 'PUT' | 'GET',
): string | null {
  let payload: TokenPayload;
  try {
    payload = JSON.parse(Buffer.from(token, 'base64url').toString('utf8')) as TokenPayload;
  } catch {
    return null;
  }
  if (
    typeof payload.k !== 'string' ||
    typeof payload.e !== 'number' ||
    typeof payload.s !== 'string'
  )
    return null;
  if (Date.now() > payload.e) return null;
  const expected = createHmac('sha256', secret)
    .update(`${method}:${payload.k}:${payload.e}`)
    .digest('hex');
  const expectedBuf = Buffer.from(expected, 'hex');
  const actualBuf = Buffer.from(payload.s, 'hex');
  if (expectedBuf.length !== actualBuf.length || !timingSafeEqual(expectedBuf, actualBuf))
    return null;
  return payload.k;
}

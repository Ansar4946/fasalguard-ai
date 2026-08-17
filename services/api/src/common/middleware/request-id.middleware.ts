import { randomUUID } from 'node:crypto';
import type { IncomingMessage, ServerResponse } from 'node:http';
const valid = /^[a-zA-Z0-9._:-]{1,128}$/;
export function createRequestId(req: IncomingMessage, res: ServerResponse): string {
  const header = req.headers['x-request-id'];
  const supplied = Array.isArray(header) ? header[0] : header;
  const id = supplied && valid.test(supplied) ? supplied : randomUUID();
  res.setHeader('x-request-id', id);
  return id;
}

import type { IncomingMessage, ServerResponse } from 'node:http';
import { createRequestId } from '../src/common/middleware/request-id.middleware';
describe('createRequestId', () => {
  it('preserves a valid caller ID', () => {
    const req = { headers: { 'x-request-id': 'mobile-123' } } as unknown as IncomingMessage;
    const setHeader = jest.fn();
    const res = { setHeader } as unknown as ServerResponse;
    const id = createRequestId(req, res);
    expect(id).toBe('mobile-123');
    expect(setHeader).toHaveBeenCalledWith('x-request-id', 'mobile-123');
  });
  it('replaces an unsafe ID', () => {
    const req = { headers: { 'x-request-id': 'bad id' } } as unknown as IncomingMessage;
    const res = { setHeader: jest.fn() } as unknown as ServerResponse;
    expect(createRequestId(req, res)).toMatch(/^[0-9a-f-]{36}$/);
  });
});

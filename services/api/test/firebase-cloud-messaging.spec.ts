/* FCM provider contract tests. The network is stubbed (global fetch) and the service account is a
 * throw-away RSA key generated here, so these prove request shape and error handling only. They do
 * not prove that Google accepts our credentials or that a phone receives a message. */
import { createPublicKey, createVerify, generateKeyPairSync } from 'node:crypto';
import { ServiceUnavailableException } from '@nestjs/common';
import type { ConfigService } from '@nestjs/config';
import { FirebaseCloudMessagingProvider } from '../src/domain/notifications/providers/firebase-cloud-messaging.provider';

const { privateKey, publicKey } = generateKeyPairSync('rsa', {
  modulusLength: 2048,
  privateKeyEncoding: { type: 'pkcs8', format: 'pem' },
  publicKeyEncoding: { type: 'spki', format: 'pem' },
});
const account = (over: Record<string, unknown> = {}): string =>
  Buffer.from(
    JSON.stringify({
      project_id: 'demo-project',
      client_email: 'svc@demo-project.iam.gserviceaccount.com',
      private_key: privateKey,
      ...over,
    }),
  ).toString('base64');
const provider = (encoded = account()): FirebaseCloudMessagingProvider =>
  new FirebaseCloudMessagingProvider({
    get: (key: string, fallback?: unknown) =>
      key === 'firebaseServiceAccountBase64' ? encoded : fallback,
  } as unknown as ConfigService);
const json = (body: unknown, status = 200): Response =>
  new Response(JSON.stringify(body), { status, headers: { 'content-type': 'application/json' } });
const oauth = (): Response => json({ access_token: 'ya29.test-access', expires_in: 3600 });
const message = {
  token: 'device-token-'.padEnd(40, 'x'),
  title: 'Inspect field',
  body: 'Inspection priority is raised.',
  data: { category: 'WEATHER' },
};

describe('FirebaseCloudMessagingProvider (stubbed network)', () => {
  afterEach(() => jest.restoreAllMocks());

  it('authenticates with a signed service-account assertion and sends the message to the right project', async () => {
    const fetchMock = jest
      .spyOn(global, 'fetch')
      .mockResolvedValueOnce(oauth())
      .mockResolvedValueOnce(json({ name: 'projects/demo-project/messages/0:abc' }));
    const result = await provider().send(message);
    expect(result).toEqual({ messageId: 'projects/demo-project/messages/0:abc', status: 'SENT' });

    const [tokenUrl, tokenInit] = fetchMock.mock.calls[0]!;
    expect((tokenUrl as URL).href).toBe('https://oauth2.googleapis.com/token');
    const form = tokenInit!.body as URLSearchParams;
    expect(form.get('grant_type')).toBe('urn:ietf:params:oauth:grant-type:jwt-bearer');
    const [header, claims, signature] = form.get('assertion')!.split('.') as [
      string,
      string,
      string,
    ];
    expect(JSON.parse(Buffer.from(header, 'base64url').toString())).toEqual({
      alg: 'RS256',
      typ: 'JWT',
    });
    const parsed = JSON.parse(Buffer.from(claims, 'base64url').toString()) as Record<
      string,
      unknown
    >;
    expect(parsed).toMatchObject({
      iss: 'svc@demo-project.iam.gserviceaccount.com',
      scope: 'https://www.googleapis.com/auth/firebase.messaging',
      aud: 'https://oauth2.googleapis.com/token',
    });
    const verify = createVerify('RSA-SHA256');
    verify.update(`${header}.${claims}`);
    expect(verify.verify(createPublicKey(publicKey), signature, 'base64url')).toBe(true);

    const [sendUrl, sendInit] = fetchMock.mock.calls[1]!;
    expect(sendUrl).toBe('https://fcm.googleapis.com/v1/projects/demo-project/messages:send');
    expect((sendInit!.headers as Record<string, string>).authorization).toBe(
      'Bearer ya29.test-access',
    );
    expect(JSON.parse(sendInit!.body as string)).toEqual({
      message: {
        token: message.token,
        notification: { title: message.title, body: message.body },
        data: { category: 'WEATHER' },
        android: { notification: { channel_id: 'default' } },
      },
    });
    expect(sendInit!.signal).toBeInstanceOf(AbortSignal);
  });

  it('reuses the access token across sends instead of re-authenticating each time', async () => {
    const fetchMock = jest
      .spyOn(global, 'fetch')
      .mockResolvedValueOnce(oauth())
      .mockResolvedValue(json({ name: 'projects/demo-project/messages/1' }));
    const p = provider();
    await p.send(message);
    await p.send(message);
    await p.send(message);
    expect(
      fetchMock.mock.calls.filter(([url]) =>
        (typeof url === 'string' ? url : (url as URL).href).includes('oauth2'),
      ),
    ).toHaveLength(1);
  });

  it('marks an unregistered token invalid', async () => {
    jest
      .spyOn(global, 'fetch')
      .mockResolvedValueOnce(oauth())
      .mockResolvedValueOnce(
        json({ error: { status: 'NOT_FOUND', details: [{ errorCode: 'UNREGISTERED' }] } }, 404),
      );
    expect(await provider().send(message)).toEqual({ messageId: null, status: 'INVALID_TOKEN' });
  });

  it('marks a malformed token invalid only when Google points at the token field', async () => {
    jest
      .spyOn(global, 'fetch')
      .mockResolvedValueOnce(oauth())
      .mockResolvedValueOnce(
        json(
          {
            error: {
              status: 'INVALID_ARGUMENT',
              details: [
                { errorCode: 'INVALID_ARGUMENT', fieldViolations: [{ field: 'message.token' }] },
              ],
            },
          },
          400,
        ),
      );
    expect(await provider().send(message)).toEqual({ messageId: null, status: 'INVALID_TOKEN' });
  });

  it('does NOT deactivate a healthy token when the payload itself is rejected', async () => {
    jest
      .spyOn(global, 'fetch')
      .mockResolvedValueOnce(oauth())
      .mockResolvedValueOnce(
        json(
          {
            error: {
              status: 'INVALID_ARGUMENT',
              details: [
                { errorCode: 'INVALID_ARGUMENT', fieldViolations: [{ field: 'message.data' }] },
              ],
            },
          },
          400,
        ),
      );
    await expect(provider().send(message)).rejects.toBeInstanceOf(ServiceUnavailableException);
  });

  it.each([429, 500, 503])(
    'reports HTTP %i as a retryable delivery failure, not an invalid token',
    async (status) => {
      jest
        .spyOn(global, 'fetch')
        .mockResolvedValueOnce(oauth())
        .mockResolvedValueOnce(json({ error: { status: 'UNAVAILABLE' } }, status));
      await expect(provider().send(message)).rejects.toThrow(/FCM delivery failed/);
    },
  );

  it('fails closed when credentials are missing, malformed, or the token endpoint is untrusted', async () => {
    const fetchMock = jest.spyOn(global, 'fetch');
    await expect(provider('').send(message)).rejects.toThrow(/not configured/);
    await expect(provider('not-base64-json').send(message)).rejects.toThrow(/invalid/);
    await expect(
      provider(account({ token_uri: 'https://evil.example/token' })).send(message),
    ).rejects.toThrow(/not trusted/);
    await expect(
      provider(account({ token_uri: 'http://oauth2.googleapis.com/token' })).send(message),
    ).rejects.toThrow(/not trusted/);
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it('reports an authentication failure without sending the message', async () => {
    const fetchMock = jest
      .spyOn(global, 'fetch')
      .mockResolvedValueOnce(json({ error: 'invalid_grant' }, 400));
    await expect(provider().send(message)).rejects.toThrow(/Unable to authenticate with FCM/);
    expect(fetchMock).toHaveBeenCalledTimes(1);
  });

  it('propagates a network failure so the queue can retry', async () => {
    jest
      .spyOn(global, 'fetch')
      .mockResolvedValueOnce(oauth())
      .mockRejectedValueOnce(new TypeError('network down'));
    await expect(provider().send(message)).rejects.toThrow('network down');
  });
});

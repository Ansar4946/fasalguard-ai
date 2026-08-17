import { createSign } from 'node:crypto';
import { Injectable, ServiceUnavailableException } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import type {
  PushMessage,
  PushNotificationProvider,
  PushResult,
} from './push-notification.provider';
/* eslint-disable @typescript-eslint/explicit-function-return-type */
interface ServiceAccount {
  project_id: string;
  client_email: string;
  private_key: string;
  token_uri?: string;
}
@Injectable()
export class FirebaseCloudMessagingProvider implements PushNotificationProvider {
  private token: { value: string; expiresAt: number } | null = null;
  constructor(private readonly config: ConfigService) {}
  async send(message: PushMessage): Promise<PushResult> {
    const account = this.account();
    const access = await this.accessToken(account);
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), 10_000);
    try {
      const response = await fetch(
        `https://fcm.googleapis.com/v1/projects/${encodeURIComponent(account.project_id)}/messages:send`,
        {
          method: 'POST',
          headers: { authorization: `Bearer ${access}`, 'content-type': 'application/json' },
          body: JSON.stringify({
            message: {
              token: message.token,
              notification: { title: message.title, body: message.body },
              data: message.data,
            },
          }),
          signal: controller.signal,
        },
      );
      const payload = (await response.json().catch(() => ({}))) as {
        name?: string;
        error?: { status?: string; details?: Array<{ errorCode?: string }> };
      };
      const code =
        payload.error?.details?.find((x) => x.errorCode)?.errorCode ?? payload.error?.status;
      if (code === 'UNREGISTERED' || code === 'INVALID_ARGUMENT')
        return { messageId: null, status: 'INVALID_TOKEN' };
      if (!response.ok)
        throw new ServiceUnavailableException(`FCM delivery failed: ${code ?? response.status}`);
      return { messageId: payload.name ?? null, status: 'SENT' };
    } finally {
      clearTimeout(timer);
    }
  }
  private account(): ServiceAccount {
    const encoded = this.config.get<string>('firebaseServiceAccountBase64', '');
    if (!encoded)
      throw new ServiceUnavailableException('FCM production credentials are not configured.');
    try {
      return JSON.parse(Buffer.from(encoded, 'base64').toString('utf8')) as ServiceAccount;
    } catch {
      throw new ServiceUnavailableException('FCM service account configuration is invalid.');
    }
  }
  private async accessToken(a: ServiceAccount): Promise<string> {
    if (this.token && this.token.expiresAt > Date.now() + 60_000) return this.token.value;
    const tokenUrl = new URL(a.token_uri ?? 'https://oauth2.googleapis.com/token');
    if (tokenUrl.protocol !== 'https:' || tokenUrl.hostname !== 'oauth2.googleapis.com')
      throw new ServiceUnavailableException('FCM token endpoint is not trusted.');
    const now = Math.floor(Date.now() / 1000);
    const enc = (v: unknown) => Buffer.from(JSON.stringify(v)).toString('base64url');
    const unsigned = `${enc({ alg: 'RS256', typ: 'JWT' })}.${enc({ iss: a.client_email, scope: 'https://www.googleapis.com/auth/firebase.messaging', aud: tokenUrl.href, iat: now, exp: now + 3600 })}`;
    const sign = createSign('RSA-SHA256');
    sign.update(unsigned);
    const assertion = `${unsigned}.${sign.sign(a.private_key, 'base64url')}`;
    const response = await fetch(tokenUrl, {
      method: 'POST',
      headers: { 'content-type': 'application/x-www-form-urlencoded' },
      body: new URLSearchParams({
        grant_type: 'urn:ietf:params:oauth:grant-type:jwt-bearer',
        assertion,
      }),
      signal: AbortSignal.timeout(10_000),
    });
    const body = (await response.json()) as { access_token?: string; expires_in?: number };
    if (!response.ok || !body.access_token)
      throw new ServiceUnavailableException('Unable to authenticate with FCM.');
    this.token = {
      value: body.access_token,
      expiresAt: Date.now() + (body.expires_in ?? 3600) * 1000,
    };
    return body.access_token;
  }
}

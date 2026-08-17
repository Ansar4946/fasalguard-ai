import { Injectable } from '@nestjs/common';
import type {
  PushMessage,
  PushNotificationProvider,
  PushResult,
} from './push-notification.provider';
@Injectable()
export class DevelopmentPushProvider implements PushNotificationProvider {
  send(m: PushMessage): Promise<PushResult> {
    if (m.token.startsWith('invalid:'))
      return Promise.resolve({ messageId: null, status: 'INVALID_TOKEN' });
    return Promise.resolve({ messageId: `dev-${Date.now()}`, status: 'SENT' });
  }
}

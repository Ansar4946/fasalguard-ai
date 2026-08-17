export const PUSH_NOTIFICATION_PROVIDER = Symbol('PUSH_NOTIFICATION_PROVIDER');
export interface PushMessage {
  token: string;
  title: string;
  body: string;
  data: Record<string, string>;
}
export interface PushResult {
  messageId: string | null;
  status: 'SENT' | 'DELIVERED' | 'INVALID_TOKEN';
}
export interface PushNotificationProvider {
  send(message: PushMessage): Promise<PushResult>;
}

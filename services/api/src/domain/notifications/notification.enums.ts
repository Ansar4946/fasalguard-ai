export enum TaskSource {
  Manual = 'MANUAL',
  AiActionPlan = 'AI_ACTION_PLAN',
  Satellite = 'SATELLITE',
  Weather = 'WEATHER',
  Expert = 'EXPERT',
  Outbreak = 'OUTBREAK',
}
export enum TaskStatus {
  Pending = 'PENDING',
  Completed = 'COMPLETED',
  Cancelled = 'CANCELLED',
}
export enum NotificationCategory {
  Satellite = 'SATELLITE',
  Weather = 'WEATHER',
  Diagnosis = 'DIAGNOSIS',
  Expert = 'EXPERT',
  Outbreak = 'OUTBREAK',
  Task = 'TASK',
  System = 'SYSTEM',
}
export enum DeliveryStatus {
  Scheduled = 'SCHEDULED',
  Sent = 'SENT',
  Delivered = 'DELIVERED',
  Failed = 'FAILED',
  InvalidToken = 'INVALID_TOKEN',
}
export enum PushPlatform {
  Android = 'ANDROID',
  Ios = 'IOS',
  Web = 'WEB',
}

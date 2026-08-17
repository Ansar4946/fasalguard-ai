import { BullModule } from '@nestjs/bullmq';
import { Module } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { NotificationController } from './notification.controller';
import { NotificationProcessor } from './notification.processor';
import { NotificationSafetyPolicy } from './notification.policy';
import { NOTIFICATION_QUEUE, NotificationService } from './notification.service';
import { DevelopmentPushProvider } from './providers/development-push.provider';
import { FirebaseCloudMessagingProvider } from './providers/firebase-cloud-messaging.provider';
import { PUSH_NOTIFICATION_PROVIDER } from './providers/push-notification.provider';
import { workersEnabled } from '../../infrastructure/execution-role';
/* eslint-disable @typescript-eslint/explicit-function-return-type */
@Module({
  imports: [BullModule.registerQueue({ name: NOTIFICATION_QUEUE })],
  controllers: [NotificationController],
  providers: [
    NotificationService,
    NotificationSafetyPolicy,
    ...(workersEnabled() ? [NotificationProcessor] : []),
    DevelopmentPushProvider,
    FirebaseCloudMessagingProvider,
    {
      provide: PUSH_NOTIFICATION_PROVIDER,
      inject: [ConfigService, DevelopmentPushProvider, FirebaseCloudMessagingProvider],
      useFactory: (
        c: ConfigService,
        d: DevelopmentPushProvider,
        f: FirebaseCloudMessagingProvider,
      ) => (c.get('pushProvider', 'development') === 'firebase' ? f : d),
    },
  ],
  exports: [NotificationService],
})
export class NotificationModule {}

import { Module } from '@nestjs/common';
import { CropScanModule } from '../crop-scans/crop-scan.module';
import { NotificationModule } from '../notifications/notification.module';
import { OutbreakModule } from '../outbreaks/outbreak.module';
import { SyncController } from './sync.controller';
import { SyncService } from './sync.service';
@Module({
  imports: [CropScanModule, NotificationModule, OutbreakModule],
  controllers: [SyncController],
  providers: [SyncService],
})
export class SyncModule {}

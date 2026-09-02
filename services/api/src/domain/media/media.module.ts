import { Module } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { MediaController } from './media.controller';
import { MediaService } from './media.service';
import { AlibabaOssProvider } from './storage/alibaba-oss.provider';
import { LocalDiskStorageProvider } from './storage/local-disk.provider';
import { LocalStorageController } from './storage/local-storage.controller';
import { MockObjectStorageProvider } from './storage/mock-object-storage.provider';
import {
  OBJECT_STORAGE_PROVIDER,
  type ObjectStorageProvider,
} from './storage/object-storage.provider';

@Module({
  controllers: [MediaController, LocalStorageController],
  providers: [
    MediaService,
    {
      provide: OBJECT_STORAGE_PROVIDER,
      inject: [ConfigService],
      useFactory: (config: ConfigService): ObjectStorageProvider => {
        const provider = config.get<string>('objectStorageProvider');
        if (provider === 'alibaba') return new AlibabaOssProvider(config);
        if (config.get<string>('nodeEnv') === 'production')
          throw new Error(`Object storage provider "${provider}" is forbidden in production.`);
        if (provider === 'local-disk') return new LocalDiskStorageProvider(config);
        return new MockObjectStorageProvider();
      },
    },
  ],
  exports: [OBJECT_STORAGE_PROVIDER, MediaService],
})
export class MediaModule {}

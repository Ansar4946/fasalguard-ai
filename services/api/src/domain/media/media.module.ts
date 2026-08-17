import { Module } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { MediaController } from './media.controller';
import { MediaService } from './media.service';
import { AlibabaOssProvider } from './storage/alibaba-oss.provider';
import { MockObjectStorageProvider } from './storage/mock-object-storage.provider';
import {
  OBJECT_STORAGE_PROVIDER,
  type ObjectStorageProvider,
} from './storage/object-storage.provider';

@Module({
  controllers: [MediaController],
  providers: [
    MediaService,
    {
      provide: OBJECT_STORAGE_PROVIDER,
      inject: [ConfigService],
      useFactory: (config: ConfigService): ObjectStorageProvider => {
        if (config.get<string>('objectStorageProvider') === 'alibaba')
          return new AlibabaOssProvider(config);
        if (config.get<string>('nodeEnv') === 'production')
          throw new Error('Mock object storage is forbidden in production.');
        return new MockObjectStorageProvider();
      },
    },
  ],
  exports: [OBJECT_STORAGE_PROVIDER, MediaService],
})
export class MediaModule {}

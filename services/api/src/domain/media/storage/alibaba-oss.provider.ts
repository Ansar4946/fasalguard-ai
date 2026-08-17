import { Injectable, ServiceUnavailableException } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import OSS from 'ali-oss';
import type {
  ObjectStorageProvider,
  StoredObject,
  UploadAuthorization,
} from './object-storage.provider';

@Injectable()
export class AlibabaOssProvider implements ObjectStorageProvider {
  private readonly client: OSS;
  constructor(config: ConfigService) {
    const region = config.get<string>('ossRegion', '');
    const bucket = config.get<string>('ossBucket', '');
    const accessKeyId = config.get<string>('ossAccessKeyId', '');
    const accessKeySecret = config.get<string>('ossAccessKeySecret', '');
    if (!region || !bucket || !accessKeyId || !accessKeySecret)
      throw new Error('Alibaba OSS provider selected without complete OSS configuration.');
    this.client = new OSS({
      region,
      bucket,
      accessKeyId,
      accessKeySecret,
      secure: true,
      timeout: 10_000,
    });
  }
  async getPrivateObject(objectKey: string): Promise<Buffer> {
    try {
      const result = await this.client.get(objectKey);
      return Buffer.isBuffer(result.content)
        ? result.content
        : Buffer.from(result.content as ArrayBuffer);
    } catch {
      throw new ServiceUnavailableException({
        code: 'OBJECT_STORAGE_UNAVAILABLE',
        message: 'Unable to read the private object.',
      });
    }
  }
  async putPrivateObject(input: {
    objectKey: string;
    contentType: string;
    body: Buffer;
    metadata?: Record<string, string>;
  }): Promise<StoredObject> {
    try {
      await this.client.put(input.objectKey, input.body, {
        headers: {
          'Content-Type': input.contentType,
          'x-oss-object-acl': 'private',
          ...Object.fromEntries(
            Object.entries(input.metadata ?? {}).map(([key, value]) => [
              `x-oss-meta-${key}`,
              value,
            ]),
          ),
        },
      });
      return { contentType: input.contentType, sizeBytes: input.body.byteLength, checksum: null };
    } catch {
      throw new ServiceUnavailableException({
        code: 'OBJECT_STORAGE_UNAVAILABLE',
        message: 'Unable to store the private satellite layer.',
      });
    }
  }

  authorizeUpload(input: {
    objectKey: string;
    contentType: string;
    sizeBytes: number;
    checksum: string | null;
    expiresInSeconds: number;
  }): Promise<UploadAuthorization> {
    const headers: Record<string, string> = { 'Content-Type': input.contentType };
    if (input.checksum) headers['x-oss-meta-sha256'] = input.checksum;
    const url = this.client.signatureUrl(input.objectKey, {
      method: 'PUT',
      expires: input.expiresInSeconds,
      'Content-Type': input.contentType,
      ...(input.checksum ? { 'x-oss-meta-sha256': input.checksum } : {}),
    });
    return Promise.resolve({
      url,
      method: 'PUT',
      headers,
      expiresAt: new Date(Date.now() + input.expiresInSeconds * 1000),
    });
  }

  async inspectObject(objectKey: string): Promise<StoredObject> {
    try {
      const result = await this.client.head(objectKey);
      const headers = result.res.headers as Record<string, unknown>;
      const contentType = headers['content-type'];
      const contentLength = headers['content-length'];
      const checksum = headers['x-oss-meta-sha256'];
      return {
        contentType: typeof contentType === 'string' ? contentType : '',
        sizeBytes:
          typeof contentLength === 'string' || typeof contentLength === 'number'
            ? Number(contentLength)
            : 0,
        checksum: typeof checksum === 'string' ? checksum : null,
      };
    } catch {
      throw new ServiceUnavailableException({
        code: 'OBJECT_STORAGE_UNAVAILABLE',
        message: 'Unable to verify the uploaded object.',
      });
    }
  }

  createAccessUrl(
    objectKey: string,
    expiresInSeconds: number,
  ): Promise<{ url: string; expiresAt: Date }> {
    return Promise.resolve({
      url: this.client.signatureUrl(objectKey, { method: 'GET', expires: expiresInSeconds }),
      expiresAt: new Date(Date.now() + expiresInSeconds * 1000),
    });
  }
}

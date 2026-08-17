import { Injectable, NotFoundException } from '@nestjs/common';
import type {
  ObjectStorageProvider,
  StoredObject,
  UploadAuthorization,
} from './object-storage.provider';

@Injectable()
export class MockObjectStorageProvider implements ObjectStorageProvider {
  private readonly objects = new Map<string, StoredObject>();
  private readonly bodies = new Map<string, Buffer>();
  getPrivateObject(objectKey: string): Promise<Buffer> {
    const value = this.bodies.get(objectKey);
    if (!value) throw new NotFoundException('Mock object body is unavailable.');
    return Promise.resolve(value);
  }
  putPrivateObject(input: {
    objectKey: string;
    contentType: string;
    body: Buffer;
  }): Promise<StoredObject> {
    const stored = {
      contentType: input.contentType,
      sizeBytes: input.body.byteLength,
      checksum: null,
    };
    this.objects.set(input.objectKey, stored);
    this.bodies.set(input.objectKey, input.body);
    return Promise.resolve(stored);
  }
  authorizeUpload(input: {
    objectKey: string;
    contentType: string;
    sizeBytes: number;
    checksum: string | null;
    expiresInSeconds: number;
  }): Promise<UploadAuthorization> {
    this.objects.set(input.objectKey, {
      contentType: input.contentType,
      sizeBytes: input.sizeBytes,
      checksum: input.checksum,
    });
    return Promise.resolve({
      url: `https://mock-storage.invalid/upload/${encodeURIComponent(input.objectKey)}?temporary=1`,
      method: 'PUT',
      headers: { 'Content-Type': input.contentType },
      expiresAt: new Date(Date.now() + input.expiresInSeconds * 1000),
    });
  }
  inspectObject(objectKey: string): Promise<StoredObject> {
    const object = this.objects.get(objectKey);
    if (!object) throw new NotFoundException('Mock object was not uploaded.');
    return Promise.resolve(object);
  }
  createAccessUrl(
    objectKey: string,
    expiresInSeconds: number,
  ): Promise<{ url: string; expiresAt: Date }> {
    if (!this.objects.has(objectKey)) throw new NotFoundException('Mock object was not uploaded.');
    return Promise.resolve({
      url: `https://mock-storage.invalid/access/${encodeURIComponent(objectKey)}?temporary=1`,
      expiresAt: new Date(Date.now() + expiresInSeconds * 1000),
    });
  }
}

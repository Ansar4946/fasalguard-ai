import { createHash } from 'node:crypto';
import { mkdir, readFile, writeFile } from 'node:fs/promises';
import * as path from 'node:path';
import { Injectable, NotFoundException } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import type {
  ObjectStorageProvider,
  StoredObject,
  UploadAuthorization,
} from './object-storage.provider';
import { signLocalUploadToken } from './local-upload-token';

interface Sidecar {
  contentType: string;
  sizeBytes: number;
  checksum: string | null;
}

/**
 * A real ObjectStorageProvider backed by local disk instead of a cloud bucket — for
 * environments without real object-storage credentials. Files live under a base directory
 * that must be a Docker volume shared between the api and worker containers, since the
 * worker (not the api process) is what reads uploaded crop-scan/satellite images back out
 * during analysis. Not a production storage backend (single-instance, no redundancy) — see
 * the production guard in media.module.ts.
 */
@Injectable()
export class LocalDiskStorageProvider implements ObjectStorageProvider {
  private readonly baseDir: string;
  private readonly secret: string;
  private readonly publicUrl: string;

  constructor(config: ConfigService) {
    this.baseDir = config.get<string>('mediaLocalDir', '/data/media');
    this.secret = config.getOrThrow<string>('jwtAccessSecret');
    this.publicUrl = config.get<string>('apiPublicUrl', 'http://localhost:4000/api/v1').replace(/\/$/, '');
  }

  private objectPath(objectKey: string): string {
    return path.join(this.baseDir, objectKey);
  }
  private sidecarPath(objectKey: string): string {
    return `${this.objectPath(objectKey)}.meta.json`;
  }

  async getPrivateObject(objectKey: string): Promise<Buffer> {
    try {
      return await readFile(this.objectPath(objectKey));
    } catch {
      throw new NotFoundException('Local object body is unavailable.');
    }
  }

  async putPrivateObject(input: {
    objectKey: string;
    contentType: string;
    body: Buffer;
  }): Promise<StoredObject> {
    const filePath = this.objectPath(input.objectKey);
    await mkdir(path.dirname(filePath), { recursive: true });
    await writeFile(filePath, input.body);
    const sidecar: Sidecar = {
      contentType: input.contentType,
      sizeBytes: input.body.byteLength,
      checksum: createHash('sha256').update(input.body).digest('hex'),
    };
    await writeFile(this.sidecarPath(input.objectKey), JSON.stringify(sidecar));
    return sidecar;
  }

  authorizeUpload(input: {
    objectKey: string;
    contentType: string;
    sizeBytes: number;
    checksum: string | null;
    expiresInSeconds: number;
  }): Promise<UploadAuthorization> {
    const expiresAt = Date.now() + input.expiresInSeconds * 1000;
    const token = signLocalUploadToken(this.secret, input.objectKey, 'PUT', expiresAt);
    return Promise.resolve({
      url: `${this.publicUrl}/media/local-upload/${token}`,
      method: 'PUT',
      headers: { 'content-type': input.contentType },
      expiresAt: new Date(expiresAt),
    });
  }

  async inspectObject(objectKey: string): Promise<StoredObject> {
    try {
      return JSON.parse(await readFile(this.sidecarPath(objectKey), 'utf8')) as StoredObject;
    } catch {
      throw new NotFoundException('Local object was not uploaded.');
    }
  }

  createAccessUrl(
    objectKey: string,
    expiresInSeconds: number,
  ): Promise<{ url: string; expiresAt: Date }> {
    const expiresAt = Date.now() + expiresInSeconds * 1000;
    const token = signLocalUploadToken(this.secret, objectKey, 'GET', expiresAt);
    return Promise.resolve({
      url: `${this.publicUrl}/media/local-access/${token}`,
      expiresAt: new Date(expiresAt),
    });
  }
}

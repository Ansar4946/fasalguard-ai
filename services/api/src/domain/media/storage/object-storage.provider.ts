export const OBJECT_STORAGE_PROVIDER = Symbol('OBJECT_STORAGE_PROVIDER');

export interface UploadAuthorization {
  url: string;
  method: 'PUT';
  headers: Record<string, string>;
  expiresAt: Date;
}

export interface StoredObject {
  contentType: string;
  sizeBytes: number;
  checksum: string | null;
}

export interface ObjectStorageProvider {
  getPrivateObject(objectKey: string): Promise<Buffer>;
  putPrivateObject(input: {
    objectKey: string;
    contentType: string;
    body: Buffer;
    metadata?: Record<string, string>;
  }): Promise<StoredObject>;
  authorizeUpload(input: {
    objectKey: string;
    contentType: string;
    sizeBytes: number;
    checksum: string | null;
    expiresInSeconds: number;
  }): Promise<UploadAuthorization>;
  inspectObject(objectKey: string): Promise<StoredObject>;
  createAccessUrl(
    objectKey: string,
    expiresInSeconds: number,
  ): Promise<{ url: string; expiresAt: Date }>;
}

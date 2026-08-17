import { randomUUID } from 'node:crypto';
import { BadRequestException, Inject, Injectable, NotFoundException } from '@nestjs/common';
import { InjectDataSource } from '@nestjs/typeorm';
import { DataSource } from 'typeorm';
import { ConfigService } from '@nestjs/config';
import type { CompleteUploadDto, PresignUploadDto } from './dto/media.dto';
import { MediaStatus } from './media.enums';
import {
  normalizeFilename,
  validateImageContent,
  validateMediaPolicy,
  validateMetadata,
} from './media-policy';
import {
  OBJECT_STORAGE_PROVIDER,
  type ObjectStorageProvider,
  type UploadAuthorization,
} from './storage/object-storage.provider';

interface MediaRow {
  id: string;
  ownerId: string;
  objectKey: string;
  originalFilename: string;
  contentType: string;
  sizeBytes: string;
  checksum: string | null;
  purpose: string;
  status: MediaStatus;
  metadata: Record<string, unknown>;
  completedAt: Date | null;
  createdAt: Date;
}

@Injectable()
export class MediaService {
  constructor(
    @InjectDataSource() private readonly db: DataSource,
    @Inject(OBJECT_STORAGE_PROVIDER) private readonly storage: ObjectStorageProvider,
    private readonly config: ConfigService,
  ) {}

  async presign(
    ownerId: string,
    dto: PresignUploadDto,
  ): Promise<{ media: Record<string, unknown>; upload: UploadAuthorization }> {
    validateMediaPolicy(dto.purpose, dto.contentType, dto.sizeBytes);
    const filename = normalizeFilename(dto.fileName);
    const metadata = validateMetadata(dto.metadata);
    const date = new Date().toISOString().slice(0, 10);
    const objectKey = `${dto.purpose}/${ownerId}/${date}/${randomUUID()}-${filename}`;
    const rows: Array<{ id: string }> = await this.db.query(
      `INSERT INTO media_assets(owner_id,object_key,original_filename,content_type,size_bytes,checksum,purpose,status,metadata)
       VALUES($1,$2,$3,$4,$5,$6,$7,'pending',$8::jsonb) RETURNING id`,
      [
        ownerId,
        objectKey,
        filename,
        dto.contentType,
        dto.sizeBytes,
        dto.checksum?.toLowerCase() ?? null,
        dto.purpose,
        JSON.stringify(metadata),
      ],
    );
    const id = rows[0]!.id;
    try {
      const upload = await this.storage.authorizeUpload({
        objectKey,
        contentType: dto.contentType,
        sizeBytes: dto.sizeBytes,
        checksum: dto.checksum?.toLowerCase() ?? null,
        expiresInSeconds: this.signedUrlTtl(),
      });
      return { media: await this.publicAsset(ownerId, id), upload };
    } catch (error) {
      await this.db.query(
        `UPDATE media_assets SET status='failed',updated_at=now(),version=version+1 WHERE id=$1`,
        [id],
      );
      throw error;
    }
  }

  async complete(ownerId: string, dto: CompleteUploadDto): Promise<Record<string, unknown>> {
    const asset = await this.requireAsset(ownerId, dto.mediaId);
    if (asset.status === MediaStatus.Ready) return this.toPublic(asset);
    if (asset.status !== MediaStatus.Pending)
      throw new BadRequestException({
        code: 'MEDIA_NOT_PENDING',
        message: 'This upload can no longer be completed.',
      });
    const stored = await this.storage.inspectObject(asset.objectKey);
    const expectedChecksum = dto.checksum?.toLowerCase() ?? asset.checksum;
    const valid =
      stored.contentType === asset.contentType &&
      stored.sizeBytes === Number(asset.sizeBytes) &&
      (!expectedChecksum || stored.checksum === expectedChecksum);
    if (!valid) {
      await this.db.query(
        `UPDATE media_assets SET status='failed',updated_at=now(),version=version+1 WHERE id=$1 AND owner_id=$2`,
        [asset.id, ownerId],
      );
      throw new BadRequestException({
        code: 'MEDIA_VERIFICATION_FAILED',
        message: 'Uploaded object metadata does not match its authorization.',
      });
    }
    if (asset.contentType.startsWith('image/')) {
      try {
        await validateImageContent(
          await this.storage.getPrivateObject(asset.objectKey),
          asset.contentType,
        );
      } catch (error) {
        await this.db.query(
          `UPDATE media_assets SET status='failed',updated_at=now(),version=version+1 WHERE id=$1 AND owner_id=$2`,
          [asset.id, ownerId],
        );
        throw error;
      }
    }
    await this.db.query(
      `UPDATE media_assets SET status='ready',checksum=$3,completed_at=now(),updated_at=now(),version=version+1 WHERE id=$1 AND owner_id=$2 AND status='pending'`,
      [asset.id, ownerId, expectedChecksum ?? stored.checksum],
    );
    return this.publicAsset(ownerId, asset.id);
  }

  async accessUrl(
    ownerId: string,
    mediaId: string,
  ): Promise<{ mediaId: string; url: string; expiresAt: Date }> {
    const asset = await this.requireAsset(ownerId, mediaId);
    if (asset.status !== MediaStatus.Ready)
      throw new BadRequestException({
        code: 'MEDIA_NOT_READY',
        message: 'Media is not available for access.',
      });
    const access = await this.storage.createAccessUrl(asset.objectKey, this.signedUrlTtl());
    return { mediaId: asset.id, ...access };
  }

  private async publicAsset(ownerId: string, id: string): Promise<Record<string, unknown>> {
    return this.toPublic(await this.requireAsset(ownerId, id));
  }

  private async requireAsset(ownerId: string, id: string): Promise<MediaRow> {
    const rows: MediaRow[] = await this.db.query(
      `SELECT id,owner_id AS "ownerId",object_key AS "objectKey",original_filename AS "originalFilename",content_type AS "contentType",size_bytes AS "sizeBytes",checksum,purpose,status,metadata,completed_at AS "completedAt",created_at AS "createdAt" FROM media_assets WHERE id=$1 AND owner_id=$2`,
      [id, ownerId],
    );
    if (!rows[0])
      throw new NotFoundException({ code: 'MEDIA_NOT_FOUND', message: 'Media was not found.' });
    return rows[0];
  }

  private toPublic(asset: MediaRow): Record<string, unknown> {
    return {
      id: asset.id,
      originalFilename: asset.originalFilename,
      contentType: asset.contentType,
      sizeBytes: Number(asset.sizeBytes),
      checksum: asset.checksum,
      purpose: asset.purpose,
      status: asset.status,
      metadata: asset.metadata,
      completedAt: asset.completedAt,
      createdAt: asset.createdAt,
    };
  }
  private signedUrlTtl(): number {
    return Math.min(this.config.get<number>('signedUrlTtlSeconds', 300), 900);
  }
}

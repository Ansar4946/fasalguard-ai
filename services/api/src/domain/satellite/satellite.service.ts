import { BadRequestException, Inject, Injectable, NotFoundException } from '@nestjs/common';
import { InjectQueue } from '@nestjs/bullmq';
import { InjectDataSource } from '@nestjs/typeorm';
import { ConfigService } from '@nestjs/config';
import { Queue } from 'bullmq';
import type { Polygon } from 'geojson';
import { DataSource } from 'typeorm';
import {
  OBJECT_STORAGE_PROVIDER,
  type ObjectStorageProvider,
} from '../media/storage/object-storage.provider';
import type { CreateSatelliteScanDto } from './dto/satellite.dto';
import { SatelliteProcessingStatus } from './satellite.enums';
export const SATELLITE_QUEUE = 'satellite-scans';
export interface SatelliteJob {
  captureId: string;
  fieldId: string;
  polygon: Polygon;
  from: string;
  to: string;
  maxCloudCoverage: number;
}
export interface SatelliteScanView {
  id: string;
  fieldId: string;
  processingStatus: SatelliteProcessingStatus;
  [key: string]: unknown;
}
@Injectable()
export class SatelliteService {
  constructor(
    @InjectDataSource() private readonly db: DataSource,
    @InjectQueue(SATELLITE_QUEUE) private readonly queue: Queue<SatelliteJob>,
    private readonly config: ConfigService,
    @Inject(OBJECT_STORAGE_PROVIDER) private readonly storage: ObjectStorageProvider,
  ) {}
  async enqueue(
    userId: string,
    fieldId: string,
    dto: CreateSatelliteScanDto,
  ): Promise<SatelliteScanView> {
    const field = await this.ownedField(userId, fieldId);
    const to = dto.to ? new Date(dto.to) : new Date();
    const from = dto.from ? new Date(dto.from) : new Date(to.getTime() - 30 * 86400000);
    if (from >= to)
      throw new BadRequestException({
        code: 'INVALID_DATE_RANGE',
        message: 'from must be earlier than to.',
      });
    const max = dto.maxCloudCoverage ?? this.config.get<number>('satelliteMaxCloudCoverage', 30);
    const rows: Array<{ id: string; created_at: Date }> = await this.db.query(
      `INSERT INTO satellite_captures(field_id,provider,processing_status,requested_from,requested_to) VALUES($1,'COPERNICUS_SENTINEL_HUB',$2,$3,$4) RETURNING id,created_at`,
      [fieldId, SatelliteProcessingStatus.Queued, from, to],
    );
    const capture = rows[0]!;
    try {
      await this.queue.add(
        'satellite:discover',
        {
          captureId: capture.id,
          fieldId,
          polygon: field.boundary,
          from: from.toISOString(),
          to: to.toISOString(),
          maxCloudCoverage: max,
        },
        {
          jobId: capture.id,
          attempts: 3,
          backoff: { type: 'exponential', delay: 1000 },
          removeOnComplete: 1000,
          removeOnFail: 5000,
        },
      );
    } catch (error) {
      await this.db.query(
        `UPDATE satellite_captures SET processing_status='FAILED',updated_at=now() WHERE id=$1`,
        [capture.id],
      );
      throw error;
    }
    return {
      id: capture.id,
      fieldId,
      processingStatus: SatelliteProcessingStatus.Queued,
      createdAt: capture.created_at,
    };
  }
  async list(userId: string, fieldId: string): Promise<SatelliteScanView[]> {
    await this.ownedField(userId, fieldId);
    const rows: SatelliteScanView[] = await this.db.query(this.select(`sc.field_id=$2`), [
      userId,
      fieldId,
    ]);
    return rows;
  }
  async get(userId: string, id: string): Promise<SatelliteScanView> {
    const rows: SatelliteScanView[] = await this.db.query(this.select(`sc.id=$2`), [userId, id]);
    if (!rows[0])
      throw new NotFoundException({
        code: 'SATELLITE_SCAN_NOT_FOUND',
        message: 'Satellite scan not found.',
      });
    return rows[0];
  }
  async layers(userId: string, id: string): Promise<unknown[]> {
    await this.get(userId, id);
    const rows: Array<{
      id: string;
      type: string;
      contentType: string;
      sizeBytes: string;
      objectKey: string;
      metadata: Record<string, unknown>;
    }> = await this.db.query(
      `SELECT sl.id,sl.type,ma.content_type "contentType",ma.size_bytes "sizeBytes",ma.object_key "objectKey",sl.metadata FROM satellite_layers sl JOIN media_assets ma ON ma.id=sl.media_asset_id WHERE sl.capture_id=$1 ORDER BY sl.type`,
      [id],
    );
    return Promise.all(
      rows.map(async ({ objectKey, ...row }) => ({
        ...row,
        sizeBytes: Number(row.sizeBytes),
        access: await this.storage.createAccessUrl(objectKey, 300),
      })),
    );
  }
  async statistics(userId: string, id: string): Promise<unknown[]> {
    await this.get(userId, id);
    return this.db.query(
      `SELECT index,statistics,created_at "createdAt" FROM satellite_statistics WHERE capture_id=$1 ORDER BY index`,
      [id],
    );
  }
  async stressZones(userId: string, id: string): Promise<unknown[]> {
    await this.get(userId, id);
    return this.db.query(
      `SELECT id,label,severity,score,area_hectares "areaHectares",evidence,ST_AsGeoJSON(geometry)::json geometry,created_at "createdAt" FROM satellite_stress_zones WHERE capture_id=$1 ORDER BY score DESC`,
      [id],
    );
  }
  async comparison(userId: string, fieldId: string): Promise<unknown> {
    await this.ownedField(userId, fieldId);
    const observations: Array<Record<string, unknown>> = await this.db.query(
      `SELECT sc.id "captureId",sc.acquisition_date "acquisitionDate",fhs.score "healthScore",jsonb_object_agg(ss.index,ss.statistics) statistics FROM satellite_captures sc LEFT JOIN satellite_statistics ss ON ss.capture_id=sc.id LEFT JOIN field_health_scores fhs ON fhs.capture_id=sc.id WHERE sc.field_id=$1 AND sc.processing_status='COMPLETED' GROUP BY sc.id,fhs.score ORDER BY sc.acquisition_date DESC LIMIT 12`,
      [fieldId],
    );
    return {
      fieldId,
      comparisonBasis:
        observations.length >= 3
          ? 'ROLLING_FIELD_BASELINE'
          : observations.length >= 2
            ? 'PREVIOUS_VALID_OBSERVATION'
            : 'INSUFFICIENT_HISTORY',
      observations,
    };
  }
  private async ownedField(userId: string, id: string): Promise<{ id: string; boundary: Polygon }> {
    const rows: Array<{ id: string; boundary: Polygon }> = await this.db.query(
      `SELECT fi.id,ST_AsGeoJSON(fi.boundary)::json AS boundary FROM fields fi JOIN farms fa ON fa.id=fi.farm_id JOIN farmer_profiles fp ON fp.id=fa.farmer_id WHERE fi.id=$1 AND fp.user_id=$2 AND fi.deleted_at IS NULL AND fa.deleted_at IS NULL`,
      [id, userId],
    );
    if (!rows[0])
      throw new NotFoundException({ code: 'FIELD_NOT_FOUND', message: 'Field not found.' });
    return rows[0];
  }
  private select(where: string): string {
    return `SELECT sc.id,sc.field_id AS "fieldId",sc.provider,sc.provider_scene_id AS "providerSceneId",sc.satellite,sc.acquisition_date AS "acquisitionDate",sc.processed_date AS "processedDate",sc.cloud_coverage AS "cloudCoverage",sc.usable_pixel_percentage AS "usablePixelPercentage",sc.data_quality AS "dataQuality",sc.processing_status AS "processingStatus",sc.requested_from AS "requestedFrom",sc.requested_to AS "requestedTo",sc.created_at AS "createdAt",sc.updated_at AS "updatedAt" FROM satellite_captures sc JOIN fields fi ON fi.id=sc.field_id JOIN farms fa ON fa.id=fi.farm_id JOIN farmer_profiles fp ON fp.id=fa.farmer_id WHERE fp.user_id=$1 AND ${where} ORDER BY sc.created_at DESC`;
  }
}

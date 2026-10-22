import { satelliteLayers, indexScript, type SpectralIndex } from './spectral-indices';
import { Inject } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { Processor, WorkerHost } from '@nestjs/bullmq';
import { InjectDataSource } from '@nestjs/typeorm';
import { InjectQueue } from '@nestjs/bullmq';
import type { Job, Queue } from 'bullmq';
import type { Polygon } from 'geojson';
import { DataSource } from 'typeorm';
import { createHash } from 'node:crypto';
import {
  OBJECT_STORAGE_PROVIDER,
  type ObjectStorageProvider,
} from '../media/storage/object-storage.provider';
import { SATELLITE_PROVIDER, type SatelliteProvider } from './providers/satellite.provider';
import { StressAnalysisClient } from './stress-analysis.client';
import { SATELLITE_QUEUE, type SatelliteJob } from './satellite.service';
import { RiskAssessmentService } from '../risk/risk.service';
import { RiskTrigger } from '../risk/risk.enums';
import { MetricsService } from '../../observability/metrics.service';

type Stage =
  | 'satellite:discover'
  | 'satellite:process'
  | 'satellite:statistics'
  | 'satellite:stress-analysis'
  | 'satellite:finalize';
interface CaptureContext extends SatelliteJob {
  providerSceneId?: string;
  acquisitionDate?: string;
}
interface CaptureRow {
  id: string;
  field_id: string;
  provider_scene_id: string | null;
  acquisition_date: Date | null;
  processing_status: string;
  boundary: Polygon;
  owner_id: string;
  metric_boundary: Polygon;
  metric_crs: number;
}
const layers = satelliteLayers;

@Processor(SATELLITE_QUEUE, { concurrency: 2, lockDuration: 120_000 })
export class SatelliteProcessor extends WorkerHost {
  constructor(
    @InjectDataSource() private readonly db: DataSource,
    @InjectQueue(SATELLITE_QUEUE) private readonly queue: Queue<CaptureContext>,
    @Inject(SATELLITE_PROVIDER) private readonly provider: SatelliteProvider,
    @Inject(OBJECT_STORAGE_PROVIDER) private readonly storage: ObjectStorageProvider,
    private readonly stress: StressAnalysisClient,
    private readonly fieldRisk: RiskAssessmentService,
    private readonly config: ConfigService,
    private readonly metrics: MetricsService = new MetricsService(),
  ) {
    super();
  }
  async process(job: Job<CaptureContext>): Promise<void> {
    const stage = job.name as Stage;
    const started = Date.now();
    this.metrics.observe(
      'fasalguard_queue_latency_seconds',
      Math.max(0, started - job.timestamp) / 1000,
      { queue: SATELLITE_QUEUE, stage },
    );
    try {
      await job.updateProgress({ stage, startedAt: new Date().toISOString() });
      if (stage === 'satellite:discover') await this.discover(job.data);
      else if (stage === 'satellite:process') await this.render(job.data);
      else if (stage === 'satellite:statistics') await this.statistics(job.data);
      else if (stage === 'satellite:stress-analysis') await this.analyse(job.data);
      else if (stage === 'satellite:finalize') await this.finalize(job.data);
      else throw new Error(`Unknown satellite job ${job.name}`);
      await job.updateProgress({ stage, completedAt: new Date().toISOString() });
    } catch (error) {
      this.metrics.increment('fasalguard_queue_failed_jobs_total', {
        queue: SATELLITE_QUEUE,
        stage,
      });
      this.metrics.increment('fasalguard_external_api_failures_total', {
        provider: 'satellite',
        operation: stage,
      });
      await this.db.query(
        `UPDATE satellite_captures SET processing_status='FAILED',processed_date=now(),raw_metadata=raw_metadata||jsonb_build_object('lastFailedStage',$2::text,'lastFailureReason',$3::text),updated_at=now() WHERE id=$1`,
        [job.data.captureId, stage, error instanceof Error ? error.message : String(error)],
      );
      throw error;
    } finally {
      const duration = (Date.now() - started) / 1000;
      this.metrics.observe('fasalguard_queue_job_duration_seconds', duration, {
        queue: SATELLITE_QUEUE,
        stage,
      });
      this.metrics.observe('fasalguard_satellite_processing_duration_seconds', duration, { stage });
    }
  }
  private async discover(x: CaptureContext): Promise<void> {
    const current = await this.capture(x.captureId);
    if (current.provider_scene_id) {
      await this.next('satellite:process', {
        ...x,
        providerSceneId: current.provider_scene_id,
        acquisitionDate: current.acquisition_date?.toISOString(),
      });
      return;
    }
    await this.db.query(
      `UPDATE satellite_captures SET processing_status='SEARCHING_SCENE',updated_at=now() WHERE id=$1`,
      [x.captureId],
    );
    const scenes = await this.provider.searchCatalog({
      polygon: x.polygon,
      from: new Date(x.from),
      to: new Date(x.to),
      maxCloudCoverage: x.maxCloudCoverage,
    });
    if (!scenes.length) {
      await this.db.query(
        `UPDATE satellite_captures SET processing_status='NO_VALID_SCENE',processed_date=now(),updated_at=now() WHERE id=$1`,
        [x.captureId],
      );
      return;
    }
    const scene = scenes.sort((a, b) => b.acquiredAt.getTime() - a.acquiredAt.getTime())[0]!;
    const deduplicated = await this.db.transaction(async (manager) => {
      await manager.query(`SELECT pg_advisory_xact_lock(hashtext($1))`, [
        `${x.fieldId}:${scene.id}`,
      ]);
      const duplicate: Array<{ id: string }> = await manager.query(
        `SELECT id FROM satellite_captures WHERE field_id=$1 AND provider='COPERNICUS_SENTINEL_HUB' AND provider_scene_id=$2 AND id<>$3 AND processing_status='COMPLETED' LIMIT 1`,
        [x.fieldId, scene.id, x.captureId],
      );
      if (duplicate[0]) {
        await manager.query(
          `UPDATE satellite_captures SET processing_status='COMPLETED',raw_metadata=jsonb_build_object('deduplicatedTo',$2::text),processed_date=now(),updated_at=now() WHERE id=$1`,
          [x.captureId, duplicate[0].id],
        );
        return true;
      }
      await manager.query(
        `UPDATE satellite_captures SET provider_scene_id=$2,satellite=$3,acquisition_date=$4,cloud_coverage=$5,raw_metadata=$6,processing_status='PROCESSING',updated_at=now() WHERE id=$1`,
        [
          x.captureId,
          scene.id,
          scene.satellite,
          scene.acquiredAt,
          scene.cloudCoverage,
          scene.rawMetadata,
        ],
      );
      return false;
    });
    if (deduplicated) return;
    await this.next('satellite:process', {
      ...x,
      providerSceneId: scene.id,
      acquisitionDate: scene.acquiredAt.toISOString(),
    });
  }
  private async render(x: CaptureContext): Promise<void> {
    const existing: Array<{ count: string }> = await this.db.query(
      `SELECT count(*)::text count FROM satellite_layers WHERE capture_id=$1`,
      [x.captureId],
    );
    if (Number(existing[0]?.count ?? 0) < layers.length) {
      const c = await this.capture(x.captureId);
      for (const layer of layers) {
        const found: Array<{ id: string }> = await this.db.query(
          `SELECT id FROM satellite_layers WHERE capture_id=$1 AND type=$2`,
          [x.captureId, layer.type],
        );
        if (found[0]) continue;
        const rendered = await this.provider.render(
          this.processPayload(c.metric_boundary, x, layer.evalscript, layer.format, c.metric_crs),
        );
        const extension = layer.format === 'image/png' ? 'png' : 'tiff';
        const key = `satellite/${x.fieldId}/${x.captureId}/${layer.type.toLowerCase()}.${extension}`;
        const stored = await this.storage.putPrivateObject({
          objectKey: key,
          contentType: rendered.contentType,
          body: rendered.body,
          metadata: { capture: x.captureId, layer: layer.type },
        });
        const checksum = createHash('sha256').update(rendered.body).digest('hex');
        const media: Array<{ id: string }> = await this.db.query(
          `INSERT INTO media_assets(owner_id,object_key,original_filename,content_type,size_bytes,checksum,purpose,status,metadata,completed_at) VALUES($1,$2,$3,$4,$5,$6,'satellite','ready',$7,now()) ON CONFLICT(object_key) DO UPDATE SET updated_at=now() RETURNING id`,
          [
            c.owner_id,
            key,
            `${layer.type.toLowerCase()}.${extension}`,
            rendered.contentType,
            stored.sizeBytes,
            checksum,
            { captureId: x.captureId, layerType: layer.type },
          ],
        );
        await this.db.query(
          `INSERT INTO satellite_layers(capture_id,type,media_asset_id,metadata) VALUES($1,$2,$3,$4) ON CONFLICT(capture_id,type) DO NOTHING`,
          [x.captureId, layer.type, media[0]!.id, { source: 'SENTINEL_2_L2A' }],
        );
      }
    }
    await this.next('satellite:statistics', x);
  }
  private async statistics(x: CaptureContext): Promise<void> {
    const c = await this.capture(x.captureId);
    for (const index of ['NDVI', 'EVI', 'NDWI', 'NDMI'] as const) {
      const found: Array<{ id: string }> = await this.db.query(
        `SELECT id FROM satellite_statistics WHERE capture_id=$1 AND index=$2`,
        [x.captureId, index],
      );
      if (found[0]) continue;
      const raw = await this.provider.statistics<Record<string, unknown>>(
        this.statisticsPayload(c.metric_boundary, x, index, c.metric_crs),
      );
      const normalized = this.normalizeStatistics(raw);
      await this.db.query(
        `INSERT INTO satellite_statistics(capture_id,index,statistics) VALUES($1,$2,$3) ON CONFLICT(capture_id,index) DO NOTHING`,
        [x.captureId, index, normalized],
      );
    }
    const quality: Array<{ valid: number }> = await this.db.query(
      `SELECT COALESCE((statistics->>'validPixelPercentage')::float,0) valid FROM satellite_statistics WHERE capture_id=$1 AND index='NDVI'`,
      [x.captureId],
    );
    const valid = quality[0]?.valid ?? 0;
    const minimum = this.config.get<number>('satelliteMinValidPixelPercentage', 20);
    if (valid < minimum) {
      const capture = await this.capture(x.captureId);
      await this.db.transaction(async (manager) => {
        await manager.query(
          `INSERT INTO satellite_anomaly_assessments(capture_id,field_id,baseline_method,status,engine_version,observed_at,source_identifier,evidence)
           VALUES($1,$2,'INSUFFICIENT_HISTORY','QUALITY_BLOCKED','satellite-anomaly-v1',$3,$4,$5)
           ON CONFLICT(capture_id) DO UPDATE SET status=EXCLUDED.status,evidence=EXCLUDED.evidence,updated_at=now()`,
          [
            x.captureId,
            x.fieldId,
            capture.acquisition_date,
            capture.provider_scene_id,
            {
              conclusionScope: 'SATELLITE_STRESS_ANOMALY',
              diagnosticCapability: 'NONE',
              validPixelPercentage: valid,
              minimumValidPixelPercentage: minimum,
              reason: 'INSUFFICIENT_CLEAR_PIXELS',
            },
          ],
        );
        await manager.query(
          `UPDATE satellite_captures SET processing_status='CLOUD_BLOCKED',processed_date=now(),usable_pixel_percentage=$2,data_quality='POOR',updated_at=now() WHERE id=$1`,
          [x.captureId, valid],
        );
      });
      return;
    }
    await this.db.query(
      `UPDATE satellite_captures SET processing_status='ANALYSING',usable_pixel_percentage=$2,updated_at=now() WHERE id=$1`,
      [x.captureId, valid],
    );
    await this.next('satellite:stress-analysis', x);
  }
  private async analyse(x: CaptureContext): Promise<void> {
    const assessment: Array<{ id: string }> = await this.db.query(
      `SELECT id FROM satellite_anomaly_assessments WHERE capture_id=$1`,
      [x.captureId],
    );
    if (!assessment[0]) {
      const c = await this.capture(x.captureId);
      const stats: Array<{ index: string; statistics: Record<string, unknown> }> =
        await this.db.query(
          `SELECT index,statistics FROM satellite_statistics WHERE capture_id=$1`,
          [x.captureId],
        );
      const history: Array<{
        captureId: string;
        index: string;
        statistics: Record<string, unknown>;
        acquisition_date: Date;
      }> = await this.db.query(
        `SELECT sc.id AS "captureId",ss.index,ss.statistics,sc.acquisition_date FROM satellite_statistics ss JOIN satellite_captures sc ON sc.id=ss.capture_id WHERE sc.field_id=$1 AND sc.processing_status='COMPLETED' AND sc.data_quality IN ('GOOD','PARTIAL') AND sc.id<>$2 ORDER BY sc.acquisition_date DESC LIMIT 12`,
        [x.fieldId, x.captureId],
      );
      const ndvi: Array<{ object_key: string }> = await this.db.query(
        `SELECT ma.object_key FROM satellite_layers sl JOIN media_assets ma ON ma.id=sl.media_asset_id WHERE sl.capture_id=$1 AND sl.type='NDVI'`,
        [x.captureId],
      );
      const access = ndvi[0] ? await this.storage.createAccessUrl(ndvi[0].object_key, 300) : null;
      const result = await this.stress.analyse({
        captureId: x.captureId,
        fieldBoundary: c.boundary,
        ndviRasterUrl: access?.url,
        currentStatistics: stats,
        previousObservations: history,
        minimumAreaHectares: 0.02,
      });
      await this.db.transaction(async (manager) => {
        await manager.query(
          `INSERT INTO satellite_anomaly_assessments(capture_id,field_id,baseline_method,baseline_capture_ids,status,engine_version,observed_at,source_identifier,evidence)
           VALUES($1,$2,$3,$4,$5,'satellite-anomaly-v1',$6,$7,$8)`,
          [
            x.captureId,
            x.fieldId,
            result.baseline.method,
            result.baseline.captureIds,
            result.baseline.method === 'INSUFFICIENT_HISTORY'
              ? 'INSUFFICIENT_HISTORY'
              : 'COMPLETED',
            c.acquisition_date,
            c.provider_scene_id,
            {
              conclusionScope: 'SATELLITE_STRESS_ANOMALY',
              diagnosticCapability: 'NONE',
              methodology: result.methodology,
              metricReferences: stats.map((item) => ({
                index: item.index,
                captureId: x.captureId,
              })),
              observationCount: result.baseline.observationCount,
            },
          ],
        );
        for (const zone of result.zones)
          await manager.query(
            `INSERT INTO satellite_stress_zones(capture_id,geometry,severity,score,label,area_hectares,evidence) VALUES($1,ST_SetSRID(ST_GeomFromGeoJSON($2),4326),$3,$4,$5,$6,$7)`,
            [
              x.captureId,
              JSON.stringify(zone.geometry),
              zone.severity,
              zone.score,
              zone.label,
              zone.areaHectares,
              zone.evidence,
            ],
          );
      });
    }
    await this.next('satellite:finalize', x);
  }
  private async finalize(x: CaptureContext): Promise<void> {
    const metrics: Array<{ valid: number; masked: number; mean: number | null }> =
      await this.db.query(
        `SELECT COALESCE((statistics->>'validPixelPercentage')::float,0) valid,COALESCE((statistics->>'maskedCloudPercentage')::float,100) masked,(statistics->>'mean')::float mean FROM satellite_statistics WHERE capture_id=$1 AND index='NDVI'`,
        [x.captureId],
      );
    const m = metrics[0];
    if (!m) throw new Error('NDVI statistics missing');
    if (m.valid < 20) {
      await this.db.query(
        `UPDATE satellite_captures SET processing_status='CLOUD_BLOCKED',processed_date=now(),usable_pixel_percentage=$2,data_quality='POOR',updated_at=now() WHERE id=$1`,
        [x.captureId, m.valid],
      );
      return;
    }
    const baseline: Array<{ mean: number }> = await this.db.query(
      `SELECT (ss.statistics->>'mean')::float mean FROM satellite_statistics ss JOIN satellite_captures sc ON sc.id=ss.capture_id WHERE sc.field_id=$1 AND sc.id<>$2 AND ss.index='NDVI' AND sc.processing_status='COMPLETED' ORDER BY sc.acquisition_date DESC LIMIT 6`,
      [x.fieldId, x.captureId],
    );
    const baselineMean = baseline.length
      ? baseline.reduce((s, v) => s + v.mean, 0) / baseline.length
      : null;
    const score =
      m.mean === null || baselineMean === null
        ? null
        : Math.max(0, Math.min(100, 75 + (m.mean - baselineMean) * 100));
    await this.db.transaction(async (manager) => {
      if (score !== null)
        await manager.query(
          `INSERT INTO field_health_scores(field_id,capture_id,score,components) VALUES($1,$2,$3,$4) ON CONFLICT(capture_id) DO UPDATE SET score=EXCLUDED.score,components=EXCLUDED.components,updated_at=now()`,
          [
            x.fieldId,
            x.captureId,
            score,
            {
              source: 'STATISTICAL_API',
              ndviMean: m.mean,
              rollingBaselineMean: baselineMean,
              historyCount: baseline.length,
            },
          ],
        );
      await manager.query(
        `UPDATE satellite_captures SET processing_status='COMPLETED',processed_date=now(),usable_pixel_percentage=$2,data_quality=CASE WHEN $2>=80 THEN 'GOOD' WHEN $2>=50 THEN 'PARTIAL' ELSE 'POOR' END,updated_at=now(),version=version+1 WHERE id=$1`,
        [x.captureId, m.valid],
      );
      await manager.query(
        `UPDATE fields SET last_successful_capture_at=(SELECT acquisition_date FROM satellite_captures WHERE id=$2),updated_at=now() WHERE id=$1`,
        [x.fieldId, x.captureId],
      );
    });
    await this.fieldRisk.enqueue(x.fieldId, RiskTrigger.Satellite);
  }
  private async next(stage: Stage, data: CaptureContext): Promise<void> {
    await this.queue.add(stage, data, {
      // BullMQ rejects ':' in a custom jobId ("Custom Id cannot contain :") â€” stage names
      // like 'satellite:process' must be sanitized here even though they're valid job names.
      jobId: `${data.captureId}-${stage.replace(/:/g, '_')}`,
      attempts: 4,
      backoff: { type: 'exponential', delay: 1500 },
      removeOnComplete: 1000,
      removeOnFail: 5000,
    });
  }
  private async capture(id: string): Promise<CaptureRow> {
    const rows: CaptureRow[] = await this.db.query(
      `SELECT sc.*,ST_AsGeoJSON(fi.boundary)::json boundary,u.id owner_id,utm.epsg metric_crs,ST_AsGeoJSON(ST_Transform(fi.boundary,utm.epsg))::json metric_boundary FROM satellite_captures sc JOIN fields fi ON fi.id=sc.field_id JOIN farms f ON f.id=fi.farm_id JOIN farmer_profiles fp ON fp.id=f.farmer_id JOIN users u ON u.id=fp.user_id CROSS JOIN LATERAL (SELECT (CASE WHEN ST_Y(ST_Centroid(fi.boundary))<0 THEN 32700 ELSE 32600 END)+LEAST(60,GREATEST(1,FLOOR((ST_X(ST_Centroid(fi.boundary))+180)/6)::int+1)) epsg) utm WHERE sc.id=$1`,
      [id],
    );
    if (!rows[0]) throw new Error('Capture not found');
    return rows[0];
  }
  private processPayload(
    polygon: Polygon,
    x: CaptureContext,
    evalscript: string,
    format: string,
    epsg: number,
  ): Record<string, unknown> {
    const range = this.sceneRange(x.acquisitionDate);
    return {
      input: {
        bounds: {
          geometry: polygon,
          properties: { crs: `http://www.opengis.net/def/crs/EPSG/0/${epsg}` },
        },
        data: [
          {
            type: 'sentinel-2-l2a',
            processing: { harmonizeValues: false, upsampling: 'NEAREST', downsampling: 'NEAREST' },
            dataFilter: {
              timeRange: range,
              mosaickingOrder: 'leastCC',
            },
          },
        ],
      },
      output: {
        width: 512,
        height: 512,
        responses: [{ identifier: 'default', format: { type: format } }],
      },
      evalscript,
    };
  }
  private statisticsPayload(
    polygon: Polygon,
    x: CaptureContext,
    index: SpectralIndex,
    epsg: number,
  ): Record<string, unknown> {
    const range = this.sceneRange(x.acquisitionDate);
    return {
      input: {
        bounds: {
          geometry: polygon,
          properties: { crs: `http://www.opengis.net/def/crs/EPSG/0/${epsg}` },
        },
        data: [
          {
            type: 'sentinel-2-l2a',
            processing: { harmonizeValues: false, upsampling: 'NEAREST', downsampling: 'NEAREST' },
            dataFilter: { timeRange: range },
          },
        ],
      },
      aggregation: {
        timeRange: range,
        aggregationInterval: { of: 'P1D' },
        resx: 10,
        resy: 10,
        evalscript: indexScript(index, true),
      },
      calculations: {
        index: {
          statistics: { default: { percentiles: { k: [5, 10, 25, 50, 75, 90, 95] } } },
          histograms: { default: { nBins: 20, lowEdge: -1, highEdge: 1 } },
        },
      },
    };
  }
  private sceneRange(acquisitionDate?: string): { from: string; to: string } {
    if (!acquisitionDate) throw new Error('Acquisition date missing');
    const at = new Date(acquisitionDate).getTime();
    return { from: new Date(at - 1000).toISOString(), to: new Date(at + 1000).toISOString() };
  }
  private normalizeStatistics(raw: Record<string, unknown>): Record<string, unknown> {
    const data = Array.isArray(raw.data) ? raw.data : [];
    const output = (
      data[0] as
        | {
            outputs?: Record<
              string,
              { bands?: Record<string, { stats?: Record<string, unknown>; histogram?: unknown }> }
            >;
          }
        | undefined
    )?.outputs?.index?.bands?.B0;
    const stats = output?.stats ?? {};
    const sampleCount = Number(stats.sampleCount ?? 0);
    const noDataCount = Number(stats.noDataCount ?? 0);
    return {
      mean: stats.mean ?? null,
      min: stats.min ?? null,
      max: stats.max ?? null,
      percentiles: stats.percentiles ?? {},
      histogram: output?.histogram ?? null,
      validPixelPercentage: sampleCount ? ((sampleCount - noDataCount) / sampleCount) * 100 : 0,
      maskedPixelPercentage: sampleCount ? (noDataCount / sampleCount) * 100 : 100,
      maskedCloudPercentage: null, // Provider aggregate does not distinguish cloud from other masks.
      providerResponse: raw,
    };
  }
}

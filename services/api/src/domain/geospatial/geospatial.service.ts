import type { Point, Polygon } from 'geojson';
import { BadRequestException, Injectable } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { InjectDataSource } from '@nestjs/typeorm';
import type { DataSource, EntityManager } from 'typeorm';
import { InvalidPolygonError, validateGeoJsonPolygon } from './geojson-polygon';
export interface PolygonMetrics {
  isValid: true;
  areaHectares: number;
  centroid: Point;
  boundingBox: [number, number, number, number];
}
interface MetricsRow {
  valid: boolean;
  reason: string | null;
  area_hectares: number;
  centroid: Point;
  xmin: number;
  ymin: number;
  xmax: number;
  ymax: number;
}
@Injectable()
export class GeospatialService {
  constructor(
    @InjectDataSource() private readonly dataSource: DataSource,
    private readonly config: ConfigService,
  ) {}
  async inspectPolygon(
    polygon: Polygon,
    manager: EntityManager = this.dataSource.manager,
  ): Promise<PolygonMetrics> {
    try {
      validateGeoJsonPolygon(polygon);
    } catch (error) {
      if (error instanceof InvalidPolygonError)
        throw new BadRequestException({ code: 'INVALID_POLYGON', message: error.message });
      throw error;
    }
    const rows: MetricsRow[] = await manager.query(
      `WITH geom AS (SELECT ST_SetSRID(ST_GeomFromGeoJSON($1),4326) AS value), detail AS (SELECT value,(ST_IsValidDetail(value)).* FROM geom) SELECT valid,reason,ST_Area(value::geography)/10000.0 AS area_hectares,ST_AsGeoJSON(ST_Centroid(value))::json AS centroid,ST_XMin(value) AS xmin,ST_YMin(value) AS ymin,ST_XMax(value) AS xmax,ST_YMax(value) AS ymax FROM detail`,
      [JSON.stringify(polygon)],
    );
    const result = rows[0];
    if (!result?.valid)
      throw new BadRequestException({
        code: 'INVALID_POLYGON',
        message: 'The supplied polygon is not valid.',
        details: { reason: result?.reason ?? 'PostGIS rejected the geometry.' },
      });
    if (!(result.area_hectares > 0))
      throw new BadRequestException({
        code: 'INVALID_POLYGON_AREA',
        message: 'Polygon area must be greater than zero.',
      });
    return {
      isValid: true,
      areaHectares: Number(result.area_hectares),
      centroid: result.centroid,
      boundingBox: [
        Number(result.xmin),
        Number(result.ymin),
        Number(result.xmax),
        Number(result.ymax),
      ],
    };
  }
  async assertFieldContainedByFarm(
    farmId: string,
    fieldBoundary: Polygon,
    manager: EntityManager = this.dataSource.manager,
  ): Promise<void> {
    if (!this.config.get<boolean>('enforceFieldWithinFarm', true)) return;
    validateGeoJsonPolygon(fieldBoundary);
    const rows: Array<{ contained: boolean }> = await manager.query(
      `SELECT ST_CoveredBy(ST_SetSRID(ST_GeomFromGeoJSON($2),4326),boundary) AS contained FROM farms WHERE id=$1 AND deleted_at IS NULL`,
      [farmId, JSON.stringify(fieldBoundary)],
    );
    if (!rows[0])
      throw new BadRequestException({
        code: 'FARM_NOT_FOUND',
        message: 'Parent farm was not found.',
      });
    if (!rows[0].contained)
      throw new BadRequestException({
        code: 'FIELD_OUTSIDE_FARM',
        message: 'Field boundary must be contained within its parent farm boundary.',
      });
  }
}

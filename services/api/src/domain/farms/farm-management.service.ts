import { BadRequestException, Injectable, NotFoundException } from '@nestjs/common';
import { InjectDataSource } from '@nestjs/typeorm';
import type { Feature, Point, Polygon } from 'geojson';
import { DataSource, type EntityManager } from 'typeorm';
import { EntitlementMetric } from '../billing/billing.enums';
import { EntitlementService } from '../billing/entitlement.service';
import { GeospatialService } from '../geospatial/geospatial.service';
import type {
  CreateFarmDto,
  CreateFieldDto,
  CropCycleInputDto,
  UpdateFarmDto,
  UpdateFieldDto,
} from './dto/farm-management.dto';

interface FarmRow {
  id: string;
  name: string;
  province: string | null;
  district: string | null;
  tehsil: string | null;
  soilType: string | null;
  irrigationType: string | null;
  waterSource: string | null;
  boundary: Polygon;
  centroid: Point;
  areaHectares: number;
  createdAt: Date;
  updatedAt: Date;
}

interface FieldRow {
  id: string;
  farmId: string;
  name: string;
  boundary: Polygon;
  centroid: Point;
  areaHectares: number;
  createdAt: Date;
  updatedAt: Date;
  currentCropCycle: unknown;
}

@Injectable()
export class FarmManagementService {
  constructor(
    @InjectDataSource() private readonly db: DataSource,
    private readonly geo: GeospatialService,
    private readonly entitlements: EntitlementService,
  ) {}

  async listFarms(userId: string): Promise<FarmRow[]> {
    return this.db.query(this.farmSelect(`fp.user_id=$1`), [userId]);
  }

  async listFields(userId: string, farmId: string): Promise<FieldRow[]> {
    await this.requireFarm(userId, farmId, this.db.manager);
    return this.db.query(
      `SELECT fi.id,fi.farm_id AS "farmId",fi.name,ST_AsGeoJSON(fi.boundary)::json AS boundary,ST_AsGeoJSON(fi.centroid)::json AS centroid,
       fi.area_hectares AS "areaHectares",fi.created_at AS "createdAt",fi.updated_at AS "updatedAt",
       CASE WHEN cc.id IS NULL THEN NULL ELSE json_build_object('id',cc.id,'cropId',cc.crop_id,'varietyId',cc.crop_variety_id,'sowingDate',cc.sowing_date,'expectedHarvestDate',cc.expected_harvest_date,'growthStage',cc.growth_stage,'status',cc.status) END AS "currentCropCycle"
       FROM fields fi
       LEFT JOIN LATERAL (SELECT * FROM crop_cycles x WHERE x.field_id=fi.id AND x.deleted_at IS NULL AND x.status IN ('planned','active') ORDER BY x.created_at DESC LIMIT 1) cc ON true
       WHERE fi.farm_id=$1 AND fi.deleted_at IS NULL ORDER BY fi.created_at DESC`,
      [farmId],
    );
  }

  async createFarm(userId: string, dto: CreateFarmDto): Promise<FarmRow> {
    return this.db.transaction(async (manager) => {
      const metrics = await this.geo.inspectPolygon(dto.boundary, manager);
      const farmers: Array<{ id: string }> = await manager.query(
        `SELECT id FROM farmer_profiles WHERE user_id=$1`,
        [userId],
      );
      if (!farmers[0]) throw this.notFound('Farmer profile');
      const existingFarms: Array<{ count: string }> = await manager.query(
        `SELECT count(*)::text count FROM farms f JOIN farmer_profiles fp ON fp.id=f.farmer_id WHERE fp.user_id=$1 AND f.deleted_at IS NULL`,
        [userId],
      );
      await this.entitlements.assertWithinLimit(
        userId,
        EntitlementMetric.Farms,
        Number(existingFarms[0]?.count ?? 0),
        manager,
      );
      const rows: Array<{ id: string }> = await manager.query(
        `INSERT INTO farms(farmer_id,name,province,district,tehsil,soil_type,irrigation_type,water_source,boundary,centroid,area_hectares)
         VALUES($1,$2,$3,$4,$5,$6,$7,$8,ST_SetSRID(ST_GeomFromGeoJSON($9),4326),ST_SetSRID(ST_GeomFromGeoJSON($10),4326),$11) RETURNING id`,
        [
          farmers[0].id,
          dto.name,
          dto.province ?? null,
          dto.district ?? null,
          dto.tehsil ?? null,
          dto.soilType ?? null,
          dto.irrigationType ?? null,
          dto.waterSource ?? null,
          JSON.stringify(dto.boundary),
          JSON.stringify(metrics.centroid),
          metrics.areaHectares,
        ],
      );
      return this.requireFarm(userId, rows[0]!.id, manager);
    });
  }

  getFarm(userId: string, id: string): Promise<FarmRow> {
    return this.requireFarm(userId, id, this.db.manager);
  }

  async updateFarm(userId: string, id: string, dto: UpdateFarmDto): Promise<FarmRow> {
    return this.db.transaction(async (manager) => {
      const current = await this.requireFarm(userId, id, manager);
      const boundary = dto.boundary ?? current.boundary;
      const metrics = await this.geo.inspectPolygon(boundary, manager);
      if (dto.boundary) {
        const outside: Array<{ count: string }> = await manager.query(
          `SELECT count(*)::text AS count FROM fields WHERE farm_id=$1 AND deleted_at IS NULL AND NOT ST_CoveredBy(boundary,ST_SetSRID(ST_GeomFromGeoJSON($2),4326))`,
          [id, JSON.stringify(boundary)],
        );
        if (Number(outside[0]?.count ?? 0) > 0)
          throw new BadRequestException({
            code: 'FARM_BOUNDARY_EXCLUDES_FIELDS',
            message: 'The new farm boundary must continue to contain every active field.',
          });
      }
      await manager.query(
        `UPDATE farms SET name=$3,province=$4,district=$5,tehsil=$6,soil_type=$7,irrigation_type=$8,water_source=$9,
         boundary=ST_SetSRID(ST_GeomFromGeoJSON($10),4326),centroid=ST_SetSRID(ST_GeomFromGeoJSON($11),4326),area_hectares=$12,updated_at=now(),version=version+1 WHERE id=$1 AND farmer_id=(SELECT id FROM farmer_profiles WHERE user_id=$2)`,
        [
          id,
          userId,
          dto.name ?? current.name,
          dto.province ?? current.province,
          dto.district ?? current.district,
          dto.tehsil ?? current.tehsil,
          dto.soilType ?? current.soilType,
          dto.irrigationType ?? current.irrigationType,
          dto.waterSource ?? current.waterSource,
          JSON.stringify(boundary),
          JSON.stringify(metrics.centroid),
          metrics.areaHectares,
        ],
      );
      return this.requireFarm(userId, id, manager);
    });
  }

  async deleteFarm(userId: string, id: string): Promise<void> {
    await this.db.transaction(async (manager) => {
      await this.requireFarm(userId, id, manager);
      await manager.query(
        `UPDATE crop_cycles SET deleted_at=now(),updated_at=now(),version=version+1 WHERE field_id IN (SELECT id FROM fields WHERE farm_id=$1 AND deleted_at IS NULL) AND deleted_at IS NULL`,
        [id],
      );
      await manager.query(
        `UPDATE fields SET deleted_at=now(),updated_at=now(),version=version+1 WHERE farm_id=$1 AND deleted_at IS NULL`,
        [id],
      );
      await manager.query(
        `UPDATE farms SET deleted_at=now(),updated_at=now(),version=version+1 WHERE id=$1`,
        [id],
      );
    });
  }

  async createField(userId: string, farmId: string, dto: CreateFieldDto): Promise<FieldRow> {
    return this.db.transaction(async (manager) => {
      await this.requireFarm(userId, farmId, manager);
      const metrics = await this.geo.inspectPolygon(dto.boundary, manager);
      await this.geo.assertFieldContainedByFarm(farmId, dto.boundary, manager);
      const rows: Array<{ id: string }> = await manager.query(
        `INSERT INTO fields(farm_id,name,boundary,centroid,area_hectares) VALUES($1,$2,ST_SetSRID(ST_GeomFromGeoJSON($3),4326),ST_SetSRID(ST_GeomFromGeoJSON($4),4326),$5) RETURNING id`,
        [
          farmId,
          dto.name,
          JSON.stringify(dto.boundary),
          JSON.stringify(metrics.centroid),
          metrics.areaHectares,
        ],
      );
      if (dto.currentCropCycle) {
        const existingSeasons: Array<{ count: string }> = await manager.query(
          `SELECT count(*)::text count FROM crop_cycles cc JOIN fields fi ON fi.id=cc.field_id JOIN farms f ON f.id=fi.farm_id JOIN farmer_profiles fp ON fp.id=f.farmer_id WHERE fp.user_id=$1 AND cc.deleted_at IS NULL AND cc.status IN ('planned','active')`,
          [userId],
        );
        await this.entitlements.assertWithinLimit(
          userId,
          EntitlementMetric.ActiveCropSeasons,
          Number(existingSeasons[0]?.count ?? 0),
          manager,
        );
        await this.replaceCurrentCycle(manager, rows[0]!.id, dto.currentCropCycle);
      }
      return this.requireField(userId, rows[0]!.id, manager);
    });
  }

  getField(userId: string, id: string): Promise<FieldRow> {
    return this.requireField(userId, id, this.db.manager);
  }

  async updateField(userId: string, id: string, dto: UpdateFieldDto): Promise<FieldRow> {
    return this.db.transaction(async (manager) => {
      const current = await this.requireField(userId, id, manager);
      const boundary = dto.boundary ?? current.boundary;
      const metrics = await this.geo.inspectPolygon(boundary, manager);
      if (dto.boundary)
        await this.geo.assertFieldContainedByFarm(current.farmId, dto.boundary, manager);
      await manager.query(
        `UPDATE fields SET name=$3,boundary=ST_SetSRID(ST_GeomFromGeoJSON($4),4326),centroid=ST_SetSRID(ST_GeomFromGeoJSON($5),4326),area_hectares=$6,updated_at=now(),version=version+1
         WHERE id=$1 AND farm_id IN (SELECT f.id FROM farms f JOIN farmer_profiles fp ON fp.id=f.farmer_id WHERE fp.user_id=$2 AND f.deleted_at IS NULL)`,
        [
          id,
          userId,
          dto.name ?? current.name,
          JSON.stringify(boundary),
          JSON.stringify(metrics.centroid),
          metrics.areaHectares,
        ],
      );
      if (dto.currentCropCycle) await this.replaceCurrentCycle(manager, id, dto.currentCropCycle);
      return this.requireField(userId, id, manager);
    });
  }

  async deleteField(userId: string, id: string): Promise<void> {
    await this.db.transaction(async (manager) => {
      await this.requireField(userId, id, manager);
      await manager.query(
        `UPDATE crop_cycles SET deleted_at=now(),updated_at=now(),version=version+1 WHERE field_id=$1 AND deleted_at IS NULL`,
        [id],
      );
      await manager.query(
        `UPDATE fields SET deleted_at=now(),updated_at=now(),version=version+1 WHERE id=$1`,
        [id],
      );
    });
  }

  async fieldSummary(userId: string, id: string): Promise<Record<string, unknown>> {
    const field = await this.requireField(userId, id, this.db.manager);
    return {
      id: field.id,
      farmId: field.farmId,
      name: field.name,
      areaHectares: field.areaHectares,
      currentCropCycle: field.currentCropCycle,
    };
  }

  async farmGeoJson(userId: string, id: string): Promise<Feature<Polygon>> {
    const farm = await this.requireFarm(userId, id, this.db.manager);
    return {
      type: 'Feature',
      id: farm.id,
      geometry: farm.boundary,
      properties: { name: farm.name },
    };
  }

  async fieldGeoJson(userId: string, id: string): Promise<Feature<Polygon>> {
    const field = await this.requireField(userId, id, this.db.manager);
    return {
      type: 'Feature',
      id: field.id,
      geometry: field.boundary,
      properties: { name: field.name, farmId: field.farmId },
    };
  }

  private async replaceCurrentCycle(
    manager: EntityManager,
    fieldId: string,
    cycle: CropCycleInputDto,
  ): Promise<void> {
    if (
      cycle.expectedHarvestDate &&
      cycle.sowingDate &&
      cycle.expectedHarvestDate < cycle.sowingDate
    )
      throw new BadRequestException({
        code: 'INVALID_CROP_CYCLE_DATES',
        message: 'Expected harvest date cannot precede sowing date.',
      });
    const refs: Array<{ crop: boolean; variety_matches: boolean }> = await manager.query(
      `SELECT EXISTS(SELECT 1 FROM crops WHERE id=$1 AND is_active) AS crop,
       ($2::uuid IS NULL OR EXISTS(SELECT 1 FROM crop_varieties WHERE id=$2 AND crop_id=$1 AND is_active)) AS variety_matches`,
      [cycle.cropId, cycle.varietyId ?? null],
    );
    if (!refs[0]?.crop)
      throw new BadRequestException({ code: 'INVALID_CROP', message: 'Crop was not found.' });
    if (!refs[0].variety_matches)
      throw new BadRequestException({
        code: 'INVALID_CROP_VARIETY',
        message: 'Variety does not belong to the selected crop.',
      });
    await manager.query(
      `UPDATE crop_cycles SET status='cancelled',updated_at=now(),version=version+1 WHERE field_id=$1 AND deleted_at IS NULL AND status IN ('planned','active')`,
      [fieldId],
    );
    await manager.query(
      `INSERT INTO crop_cycles(field_id,crop_id,crop_variety_id,sowing_date,expected_harvest_date,growth_stage,status) VALUES($1,$2,$3,$4,$5,$6,$7)`,
      [
        fieldId,
        cycle.cropId,
        cycle.varietyId ?? null,
        cycle.sowingDate ?? null,
        cycle.expectedHarvestDate ?? null,
        cycle.growthStage ?? null,
        cycle.status,
      ],
    );
  }

  private async requireFarm(userId: string, id: string, manager: EntityManager): Promise<FarmRow> {
    const rows: FarmRow[] = await manager.query(this.farmSelect(`f.id=$1 AND fp.user_id=$2`), [
      id,
      userId,
    ]);
    if (!rows[0]) throw this.notFound('Farm');
    return rows[0];
  }

  private async requireField(
    userId: string,
    id: string,
    manager: EntityManager,
  ): Promise<FieldRow> {
    const rows: FieldRow[] = await manager.query(
      `SELECT fi.id,fi.farm_id AS "farmId",fi.name,ST_AsGeoJSON(fi.boundary)::json AS boundary,ST_AsGeoJSON(fi.centroid)::json AS centroid,
       fi.area_hectares AS "areaHectares",fi.created_at AS "createdAt",fi.updated_at AS "updatedAt",
       CASE WHEN cc.id IS NULL THEN NULL ELSE json_build_object('id',cc.id,'cropId',cc.crop_id,'varietyId',cc.crop_variety_id,'sowingDate',cc.sowing_date,'expectedHarvestDate',cc.expected_harvest_date,'growthStage',cc.growth_stage,'status',cc.status) END AS "currentCropCycle"
       FROM fields fi JOIN farms f ON f.id=fi.farm_id JOIN farmer_profiles fp ON fp.id=f.farmer_id
       LEFT JOIN LATERAL (SELECT * FROM crop_cycles WHERE field_id=fi.id AND deleted_at IS NULL AND status IN ('planned','active') ORDER BY created_at DESC LIMIT 1) cc ON true
       WHERE fi.id=$1 AND fp.user_id=$2 AND fi.deleted_at IS NULL AND f.deleted_at IS NULL`,
      [id, userId],
    );
    if (!rows[0]) throw this.notFound('Field');
    return rows[0];
  }

  private farmSelect(predicate: string): string {
    return `SELECT f.id,f.name,f.province,f.district,f.tehsil,f.soil_type AS "soilType",f.irrigation_type AS "irrigationType",f.water_source AS "waterSource",
      ST_AsGeoJSON(f.boundary)::json AS boundary,ST_AsGeoJSON(f.centroid)::json AS centroid,f.area_hectares AS "areaHectares",f.created_at AS "createdAt",f.updated_at AS "updatedAt"
      FROM farms f JOIN farmer_profiles fp ON fp.id=f.farmer_id WHERE ${predicate} AND f.deleted_at IS NULL ORDER BY f.created_at DESC`;
  }

  private notFound(resource: string): NotFoundException {
    return new NotFoundException({
      code: `${resource.toUpperCase()}_NOT_FOUND`,
      message: `${resource} was not found.`,
    });
  }
}

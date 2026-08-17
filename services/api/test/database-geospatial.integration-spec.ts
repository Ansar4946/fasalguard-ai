import type { Polygon } from 'geojson';
import { ConfigService } from '@nestjs/config';
import type { DataSource, QueryRunner } from 'typeorm';
import { GeospatialService } from '../src/domain/geospatial/geospatial.service';
const farmBoundary: Polygon = {
  type: 'Polygon',
  coordinates: [
    [
      [71.4, 30.1],
      [71.5, 30.1],
      [71.5, 30.2],
      [71.4, 30.2],
      [71.4, 30.1],
    ],
  ],
};
const inside: Polygon = {
  type: 'Polygon',
  coordinates: [
    [
      [71.42, 30.12],
      [71.45, 30.12],
      [71.45, 30.15],
      [71.42, 30.15],
      [71.42, 30.12],
    ],
  ],
};
const outside: Polygon = {
  type: 'Polygon',
  coordinates: [
    [
      [71.49, 30.19],
      [71.53, 30.19],
      [71.53, 30.23],
      [71.49, 30.23],
      [71.49, 30.19],
    ],
  ],
};
const selfIntersecting: Polygon = {
  type: 'Polygon',
  coordinates: [
    [
      [71.4, 30.1],
      [71.5, 30.2],
      [71.5, 30.1],
      [71.4, 30.2],
      [71.4, 30.1],
    ],
  ],
};
const integration = process.env.DATABASE_URL ? describe : describe.skip;
integration('PostgreSQL/PostGIS foundation', () => {
  let source: DataSource;
  let runner: QueryRunner;
  let service: GeospatialService;
  let farmId: string;
  beforeAll(async () => {
    const imported = await import('../src/infrastructure/database/data-source');
    source = imported.default;
    await source.initialize();
    await source.runMigrations();
    runner = source.createQueryRunner();
    await runner.connect();
    await runner.startTransaction();
    service = new GeospatialService(source, new ConfigService({ enforceFieldWithinFarm: true }));
    const user = (await runner.query(
      `INSERT INTO users(email,role,status) VALUES($1,'FARMER','active') RETURNING id`,
      [`spatial-${Date.now()}@test.invalid`],
    )) as Array<{ id: string }>;
    const farmer = (await runner.query(
      `INSERT INTO farmer_profiles(user_id,full_name) VALUES($1,'Spatial Test Farmer') RETURNING id`,
      [user[0]?.id],
    )) as Array<{ id: string }>;
    const metrics = await service.inspectPolygon(farmBoundary, runner.manager);
    const farm = (await runner.query(
      `INSERT INTO farms(farmer_id,name,boundary,centroid,area_hectares) VALUES($1,'Integration Farm',ST_SetSRID(ST_GeomFromGeoJSON($2),4326),ST_SetSRID(ST_GeomFromGeoJSON($3),4326),$4) RETURNING id`,
      [
        farmer[0]?.id,
        JSON.stringify(farmBoundary),
        JSON.stringify(metrics.centroid),
        metrics.areaHectares,
      ],
    )) as Array<{ id: string }>;
    farmId = farm[0]!.id;
  });
  afterAll(async () => {
    if (runner) {
      await runner.rollbackTransaction();
      await runner.release();
    }
    if (source?.isInitialized) await source.destroy();
  });
  it('enables PostGIS and uses SRID 4326', async () => {
    const rows = (await runner.query(
      `SELECT PostGIS_Version() AS version,ST_SRID(boundary) AS srid FROM farms WHERE id=$1`,
      [farmId],
    )) as Array<{ version: string; srid: number }>;
    expect(rows[0]?.version).toBeTruthy();
    expect(rows[0]?.srid).toBe(4326);
  });
  it('calculates area, a centroid, and a bounding box', async () => {
    const result = await service.inspectPolygon(inside, runner.manager);
    expect(result.areaHectares).toBeGreaterThan(900);
    expect(result.centroid.type).toBe('Point');
    expect(result.boundingBox).toEqual([71.42, 30.12, 71.45, 30.15]);
  });
  it('checks parent-farm containment', async () => {
    await expect(
      service.assertFieldContainedByFarm(farmId, inside, runner.manager),
    ).resolves.toBeUndefined();
    await expect(
      service.assertFieldContainedByFarm(farmId, outside, runner.manager),
    ).rejects.toMatchObject({ response: { code: 'FIELD_OUTSIDE_FARM' } });
  });
  it('uses ST_IsValid to reject a self-intersecting polygon', async () => {
    await expect(service.inspectPolygon(selfIntersecting, runner.manager)).rejects.toMatchObject({
      response: { code: 'INVALID_POLYGON' },
    });
  });
  it('supports indexed spatial intersection queries', async () => {
    const rows = (await runner.query(
      `SELECT id FROM farms WHERE ST_Intersects(boundary,ST_SetSRID(ST_GeomFromGeoJSON($1),4326))`,
      [JSON.stringify(inside)],
    )) as Array<{ id: string }>;
    expect(rows.map((x) => x.id)).toContain(farmId);
    const indexes = (await runner.query(
      `SELECT indexname FROM pg_indexes WHERE indexname IN ('idx_farms_boundary_gist','idx_farms_centroid_gist','idx_fields_boundary_gist','idx_fields_centroid_gist')`,
    )) as Array<{ indexname: string }>;
    expect(indexes).toHaveLength(4);
  });
  it('seeds only the approved reference crop names', async () => {
    const rows = (await runner.query(`SELECT name FROM crops ORDER BY name`)) as Array<{
      name: string;
    }>;
    expect(rows.map((x) => x.name)).toEqual(['Cotton', 'Maize', 'Rice', 'Sugarcane', 'Wheat']);
  });
  it('keeps demo weather rules visibly unverified and enforces expert approval metadata', async () => {
    const rules = (await runner.query(
      `SELECT validation_status,approved_by_expert_id,approved_at,source FROM crop_weather_rules`,
    )) as Array<{
      validation_status: string;
      approved_by_expert_id: string | null;
      approved_at: Date | null;
      source: string;
    }>;
    expect(rules).toHaveLength(2);
    expect(
      rules.every(
        (x) =>
          x.validation_status === 'DEMO_UNVERIFIED' &&
          x.approved_by_expert_id === null &&
          x.approved_at === null &&
          x.source.startsWith('DEMO ONLY'),
      ),
    ).toBe(true);
    const crop = (await runner.query(`SELECT id FROM crops WHERE name='Cotton'`)) as Array<{
      id: string;
    }>;
    await runner.query('SAVEPOINT invalid_weather_rule');
    await expect(
      runner.query(
        `INSERT INTO crop_weather_rules(crop_id,category,suitability,conditions,message,source,validation_status) VALUES($1,'HEAT_STRESS','CRITICAL','{}','invalid','test','EXPERT_APPROVED')`,
        [crop[0]?.id],
      ),
    ).rejects.toBeDefined();
    await runner.query('ROLLBACK TO SAVEPOINT invalid_weather_rule');
  });
  it('prevents AI screening rows from becoming firm diagnoses', async () => {
    const user = (await runner.query(`SELECT id FROM users LIMIT 1`)) as Array<{ id: string }>;
    const scan = (await runner.query(
      `INSERT INTO crop_scans(owner_id,status,confidence_policy) VALUES($1,'DIAGNOSED','{}') RETURNING id`,
      [user[0]?.id],
    )) as Array<{ id: string }>;
    await runner.query('SAVEPOINT firm_diagnosis');
    await expect(
      runner.query(
        `INSERT INTO diagnoses(scan_id,screened_condition,confidence,disposition,is_firm_diagnosis,disclaimer) VALUES($1,'test',0.99,'SCREENING_COMPLETE',true,'test')`,
        [scan[0]?.id],
      ),
    ).rejects.toBeDefined();
    await runner.query('ROLLBACK TO SAVEPOINT firm_diagnosis');
  });
  it('seeds only an explicitly unverified demo severity ruleset', async () => {
    const rows = (await runner.query(
      `SELECT key,engine_version,status,source FROM severity_rulesets`,
    )) as Array<{ key: string; engine_version: string; status: string; source: string }>;
    expect(rows).toHaveLength(1);
    expect(rows[0]).toMatchObject({
      key: 'DEMO_RULESET',
      engine_version: 'demo-severity-v1.0.0',
      status: 'DEMO_UNVERIFIED',
    });
    expect(rows[0]?.source).toContain('not agronomist-approved');
  });
});

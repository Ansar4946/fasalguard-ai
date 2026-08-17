import type { DataSource, QueryRunner } from 'typeorm';
const integration = process.env.DATABASE_URL ? describe : describe.skip;
integration('Privacy-safe PostGIS outbreak foundation', () => {
  let source: DataSource;
  let runner: QueryRunner;
  beforeAll(async () => {
    const imported = await import('../src/infrastructure/database/data-source');
    source = imported.default;
    await source.initialize();
    await source.runMigrations();
    runner = source.createQueryRunner();
    await runner.connect();
    await runner.startTransaction();
  });
  afterAll(async () => {
    if (runner) {
      await runner.rollbackTransaction();
      await runner.release();
    }
    if (source?.isInitialized) await source.destroy();
  });
  it('uses geography distance and exposes a regional polygon rather than the exact point', async () => {
    const rows = (await runner.query(
      `WITH p AS(SELECT ST_SetSRID(ST_MakePoint(71.5249,30.1575),4326) exact_point,0.05::float8 grid),a AS(SELECT exact_point,ST_MakeEnvelope(floor(ST_X(exact_point)/grid)*grid,floor(ST_Y(exact_point)/grid)*grid,(floor(ST_X(exact_point)/grid)+1)*grid,(floor(ST_Y(exact_point)/grid)+1)*grid,4326) public_area FROM p)SELECT ST_GeometryType(public_area) "publicType",ST_Contains(public_area,exact_point) contains,ST_DWithin(exact_point::geography,ST_SetSRID(ST_MakePoint(71.53,30.16),4326)::geography,10000) nearby,ST_DWithin(exact_point::geography,ST_SetSRID(ST_MakePoint(72.5,31.0),4326)::geography,10000) far FROM a`,
    )) as Array<{ publicType: string; contains: boolean; nearby: boolean; far: boolean }>;
    expect(rows[0]).toEqual({ publicType: 'ST_Polygon', contains: true, nearby: true, far: false });
  });
  it('prevents duplicate farmer verification at database level', async () => {
    const farmer = (await runner.query(
      `INSERT INTO users(email,role,status)VALUES($1,'FARMER','active')RETURNING id`,
      [`outbreak-${Date.now()}@test.invalid`],
    )) as Array<{ id: string }>;
    const crop = (await runner.query(`SELECT id FROM crops WHERE name='Cotton' LIMIT 1`)) as Array<{
      id: string;
    }>;
    const profile = (await runner.query(
      `INSERT INTO farmer_profiles(user_id,full_name)VALUES($1,'Outbreak Farmer')RETURNING id`,
      [farmer[0]!.id],
    )) as Array<{ id: string }>;
    const farm = (await runner.query(
      `INSERT INTO farms(farmer_id,name,boundary,centroid,area_hectares)VALUES($1,'Outbreak Farm',ST_GeomFromText('POLYGON((71.50 30.14,71.55 30.14,71.55 30.18,71.50 30.18,71.50 30.14))',4326),ST_SetSRID(ST_MakePoint(71.525,30.16),4326),1)RETURNING id`,
      [profile[0]!.id],
    )) as Array<{ id: string }>;
    const field = (await runner.query(
      `INSERT INTO fields(farm_id,name,boundary,centroid,area_hectares)VALUES($1,'Outbreak Field',ST_GeomFromText('POLYGON((71.51 30.15,71.54 30.15,71.54 30.17,71.51 30.17,71.51 30.15))',4326),ST_SetSRID(ST_MakePoint(71.525,30.16),4326),1)RETURNING id`,
      [farm[0]!.id],
    )) as Array<{ id: string }>;
    const report = (await runner.query(
      `INSERT INTO community_reports(reporter_id,field_id,source,crop_id,condition_family,private_location,public_area)VALUES($1,$2,'FARMER_MANUAL',$3,'LEAF CURL',ST_SetSRID(ST_MakePoint(71.525,30.16),4326),ST_GeomFromText('POLYGON((71.5 30.15,71.55 30.15,71.55 30.2,71.5 30.2,71.5 30.15))',4326))RETURNING id`,
      [farmer[0]!.id, field[0]!.id, crop[0]!.id],
    )) as Array<{ id: string }>;
    const verifier = (await runner.query(
      `INSERT INTO users(email,role,status)VALUES($1,'FARMER','active')RETURNING id`,
      [`verifier-${Date.now()}@test.invalid`],
    )) as Array<{ id: string }>;
    await runner.query(
      `INSERT INTO community_verifications(report_id,verifier_id,answer)VALUES($1,$2,'YES')`,
      [report[0]!.id, verifier[0]!.id],
    );
    await runner.query('SAVEPOINT duplicate_vote');
    await expect(
      runner.query(
        `INSERT INTO community_verifications(report_id,verifier_id,answer)VALUES($1,$2,'NO')`,
        [report[0]!.id, verifier[0]!.id],
      ),
    ).rejects.toMatchObject({ code: '23505' });
    await runner.query('ROLLBACK TO SAVEPOINT duplicate_vote');
  });
});

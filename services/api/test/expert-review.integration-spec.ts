import type { DataSource, QueryRunner } from 'typeorm';
const integration = process.env.DATABASE_URL ? describe : describe.skip;
integration('Expert review authorization audit schema', () => {
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
  it('makes case status history immutable', async () => {
    const farmer = (await runner.query(
      `INSERT INTO users(email,role,status)VALUES($1,'FARMER','active')RETURNING id`,
      [`phase14-${Date.now()}@test.invalid`],
    )) as Array<{ id: string }>;
    const scan = (await runner.query(
      `INSERT INTO crop_scans(owner_id,status,confidence_policy)VALUES($1,'EXPERT_REVIEW','{}')RETURNING id`,
      [farmer[0]!.id],
    )) as Array<{ id: string }>;
    const review = (await runner.query(
      `INSERT INTO expert_reviews(scan_id,status)VALUES($1,'PENDING')RETURNING id`,
      [scan[0]!.id],
    )) as Array<{ id: string }>;
    const history = (await runner.query(
      `INSERT INTO case_status_history(review_id,from_status,to_status,reason)VALUES($1,NULL,'PENDING','created')RETURNING id`,
      [review[0]!.id],
    )) as Array<{ id: string }>;
    await runner.query('SAVEPOINT immutable_case_history');
    await expect(
      runner.query(`DELETE FROM case_status_history WHERE id=$1`, [history[0]!.id]),
    ).rejects.toThrow('case status history is immutable');
    await runner.query('ROLLBACK TO SAVEPOINT immutable_case_history');
  });
});

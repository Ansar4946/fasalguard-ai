import { randomUUID } from 'node:crypto';
import type { DataSource, QueryRunner } from 'typeorm';
/* QueryRunner raw results are cast to the explicit projections used by this integration test. */
/* eslint-disable @typescript-eslint/no-unsafe-assignment, @typescript-eslint/no-unsafe-member-access */
const integration = process.env.DATABASE_URL ? describe : describe.skip;
integration('Offline mutation receipts and optimistic synchronization', () => {
  let source: DataSource, runner: QueryRunner, userId: string, deviceId: string;
  beforeAll(async () => {
    const imported = await import('../src/infrastructure/database/data-source');
    source = imported.default;
    await source.initialize();
    await source.runMigrations();
    runner = source.createQueryRunner();
    await runner.connect();
    await runner.startTransaction();
    const user = (await runner.query(
      `INSERT INTO users(email,role,status)VALUES($1,'FARMER','active')RETURNING id`,
      [`sync-${Date.now()}@test.invalid`],
    )) as Array<{ id: string }>;
    userId = user[0]!.id;
    const device = (await runner.query(
      `INSERT INTO devices(user_id,device_identifier,platform)VALUES($1,$2,'android')RETURNING id`,
      [userId, `sync-device-${Date.now()}`],
    )) as Array<{ id: string }>;
    deviceId = device[0]!.id;
  }, 30_000);
  afterAll(async () => {
    if (runner) {
      await runner.rollbackTransaction();
      await runner.release();
    }
    if (source?.isInitialized) await source.destroy();
  });
  it('stores one receipt for repeated delivery of the same client mutation', async () => {
    const clientMutationId = randomUUID(),
      hash = 'a'.repeat(64);
    await runner.query(
      `INSERT INTO mutation_receipts(user_id,device_id,client_mutation_id,type,status,request_hash)VALUES($1,$2,$3,'TASK_COMPLETION','APPLIED',$4)`,
      [userId, deviceId, clientMutationId, hash],
    );
    const duplicate = await runner.query(
      `INSERT INTO mutation_receipts(user_id,device_id,client_mutation_id,type,status,request_hash)VALUES($1,$2,$3,'TASK_COMPLETION','PROCESSING',$4)ON CONFLICT(user_id,device_id,client_mutation_id)DO NOTHING RETURNING id`,
      [userId, deviceId, clientMutationId, hash],
    );
    expect(duplicate).toHaveLength(0);
    const count = (await runner.query(
      `SELECT count(*)::integer count FROM mutation_receipts WHERE user_id=$1 AND device_id=$2 AND client_mutation_id=$3`,
      [userId, deviceId, clientMutationId],
    )) as Array<{ count: number }>;
    expect(count[0]!.count).toBe(1);
  });
  it('allows a failed receipt to be claimed for retry without another receipt', async () => {
    const id = randomUUID(),
      hash = 'b'.repeat(64);
    await runner.query(
      `INSERT INTO mutation_receipts(user_id,device_id,client_mutation_id,type,status,request_hash,error_code)VALUES($1,$2,$3,'FIELD_INSPECTION','FAILED',$4,'TEMPORARY')`,
      [userId, deviceId, id, hash],
    );
    const retried = (await runner.query(
      `UPDATE mutation_receipts SET status='PROCESSING',attempt_count=attempt_count+1,error_code=NULL WHERE user_id=$1 AND device_id=$2 AND client_mutation_id=$3 AND status='FAILED' RETURNING attempt_count "attemptCount",status`,
      [userId, deviceId, id],
    )) as Array<{ attemptCount: number; status: string }>;
    const retryRows = Array.isArray(retried[0]) ? retried[0] : retried;
    expect(retryRows[0]).toEqual({ attemptCount: 2, status: 'PROCESSING' });
  });
  it('returns no updated row when an editable task has a stale version', async () => {
    const task = (await runner.query(
      `INSERT INTO farmer_tasks(user_id,title,source,status)VALUES($1,'Offline inspection','MANUAL','PENDING')RETURNING id,version`,
      [userId],
    )) as Array<{ id: string; version: number }>;
    const applied = await runner.query(
      `UPDATE farmer_tasks SET status='COMPLETED',version=version+1 WHERE id=$1 AND user_id=$2 AND version=$3 RETURNING version`,
      [task[0]!.id, userId, task[0]!.version],
    );
    const appliedRows = Array.isArray(applied[0]) ? applied[0] : applied;
    expect(appliedRows).toHaveLength(1);
    const stale = await runner.query(
      `UPDATE farmer_tasks SET status='COMPLETED',version=version+1 WHERE id=$1 AND user_id=$2 AND version=$3 RETURNING version`,
      [task[0]!.id, userId, task[0]!.version],
    );
    const staleRows = Array.isArray(stale[0]) ? stale[0] : stale;
    expect(staleRows).toHaveLength(0);
  });
  it('supports monotonic cursor reads without binary payloads', async () => {
    const resourceId = randomUUID();
    await runner.query(
      `INSERT INTO sync_changes(user_id,resource_type,resource_id,operation,data,changed_at)VALUES($1,'FIELD_INSPECTION',$2,'CREATED','{"notes":"checked"}',now())`,
      [userId, resourceId],
    );
    const rows = (await runner.query(
      `SELECT sequence::text,resource_type "resourceType",data FROM sync_changes WHERE user_id=$1 AND sequence>$2 ORDER BY sequence`,
      [userId, '0'],
    )) as Array<{ sequence: string; resourceType: string; data: Record<string, unknown> }>;
    expect(
      rows.some((x) => x.resourceType === 'FIELD_INSPECTION' && x.data.notes === 'checked'),
    ).toBe(true);
    expect(rows.every((x) => !('binary' in x.data) && !('raster' in x.data))).toBe(true);
  });
});

import { ConfigService } from '@nestjs/config';
import { DataSource } from 'typeorm';
import { CropScanRecoveryService } from '../src/domain/crop-scans/crop-scan-recovery.service';

const integration = process.env.DATABASE_URL ? describe : describe.skip;

integration('Crop scan lease recovery against PostgreSQL (D4)', () => {
  let db: DataSource;
  let userId: string;
  const ids: Record<string, string> = {};

  beforeAll(async () => {
    db = new DataSource({ type: 'postgres', url: process.env.DATABASE_URL });
    await db.initialize();
    const user: Array<{ id: string }> = await db.query(
      `INSERT INTO users(email,role,status) VALUES($1,'FARMER','active') RETURNING id`,
      [`recovery-${Date.now()}@test.invalid`],
    );
    userId = user[0]!.id;
    const make = async (key: string, status: string, ageSeconds: number): Promise<void> => {
      const rows: Array<{ id: string }> = await db.query(
        `INSERT INTO crop_scans(owner_id,status,confidence_policy,updated_at) VALUES($1,$2,'{}', now() - make_interval(secs => $3)) RETURNING id`,
        [userId, status, ageSeconds],
      );
      ids[key] = rows[0]!.id;
    };
    await make('staleAnalysing', 'ANALYSING', 1800);
    await make('staleValidation', 'IMAGE_VALIDATION', 1800);
    await make('freshAnalysing', 'ANALYSING', 30);
    await make('oldDiagnosed', 'DIAGNOSED', 99999);
    await make('oldUploading', 'UPLOADING', 99999);
  }, 60_000);

  afterAll(async () => {
    if (db?.isInitialized) {
      await db.query(`DELETE FROM crop_scans WHERE owner_id=$1`, [userId]);
      await db.query(`DELETE FROM users WHERE id=$1`, [userId]);
      await db.destroy();
    }
  });

  it('recovers only stale in-flight scans, with a typed code, and is idempotent', async () => {
    const service = new CropScanRecoveryService(db, {
      get: (_k: string, d: number) => d,
    } as unknown as ConfigService);
    expect(await service.recoverStale()).toBe(2);
    const rows: Array<{ id: string; status: string; failure_code: string | null }> = await db.query(
      `SELECT id,status,failure_code FROM crop_scans WHERE owner_id=$1`,
      [userId],
    );
    const by = Object.fromEntries(rows.map((r) => [r.id, r]));
    expect(by[ids.staleAnalysing!]).toMatchObject({
      status: 'NEEDS_FOLLOW_UP',
      failure_code: 'ANALYSIS_TIMED_OUT',
    });
    expect(by[ids.staleValidation!]!.status).toBe('NEEDS_FOLLOW_UP');
    expect(by[ids.freshAnalysing!]!.status).toBe('ANALYSING');
    expect(by[ids.oldDiagnosed!]!.status).toBe('DIAGNOSED');
    expect(by[ids.oldUploading!]!.status).toBe('UPLOADING');
    expect(await service.recoverStale()).toBe(0);
  });
});

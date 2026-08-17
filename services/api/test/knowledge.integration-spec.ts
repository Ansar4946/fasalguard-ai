import type { DataSource, QueryRunner } from 'typeorm';

const integration = process.env.DATABASE_URL ? describe : describe.skip;

integration('Expert-controlled agricultural knowledge', () => {
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

  it('seeds only safe, non-chemical generic hackathon guidance', async () => {
    const rows = (await runner.query(
      `SELECT immediate_actions,preventive_actions,monitoring_actions,expert_escalation_criteria,chemical_guidance,chemical_guidance_approved,status FROM treatment_guidelines WHERE condition='GENERIC_CROP_HEALTH_CONCERN'`,
    )) as Array<Record<string, unknown>>;
    expect(rows).toHaveLength(1);
    expect(rows[0]).toMatchObject({
      immediate_actions: ['Inspect nearby plants', 'Photograph the affected area'],
      preventive_actions: ['Maintain field hygiene'],
      monitoring_actions: ['Monitor spread'],
      expert_escalation_criteria: ['Request expert review'],
      chemical_guidance: null,
      chemical_guidance_approved: false,
      status: 'APPROVED',
    });
  });

  it('prevents approval audit history from being changed or deleted', async () => {
    const approvals = (await runner.query(
      `SELECT id FROM guideline_approvals WHERE actor_type='SYSTEM_SEED' LIMIT 1`,
    )) as Array<{ id: string }>;
    await runner.query('SAVEPOINT immutable_history');
    await expect(
      runner.query(`UPDATE guideline_approvals SET notes='tampered' WHERE id=$1`, [
        approvals[0]!.id,
      ]),
    ).rejects.toThrow('guideline approval history is immutable');
    await runner.query('ROLLBACK TO SAVEPOINT immutable_history');
  });
});

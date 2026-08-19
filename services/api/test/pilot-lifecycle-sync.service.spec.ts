import { PilotLifecycleSyncService } from '../src/domain/growth/pilot-lifecycle-sync.service';

function fakeDb(): { query: jest.Mock<Promise<unknown>, [string, unknown[]?]> } {
  const query = jest.fn<Promise<unknown>, [string, unknown[]?]>();
  return { query };
}

describe('PilotLifecycleSyncService', () => {
  it('advances REGISTERED enrollments with a real farm+field+active crop cycle to ONBOARDED', async () => {
    const db = fakeDb();
    // DataSource.query() for an UPDATE...RETURNING returns a [rows, affectedCount] tuple.
    db.query.mockResolvedValueOnce([[{ id: 'enrollment-1' }], 1]); // onboarded advance
    db.query.mockResolvedValueOnce([[], 0]); // no activations this run
    const service = new PilotLifecycleSyncService(db as never);
    const result = await service.sync();
    expect(result).toEqual({ onboarded: 1, activated: 0 });
    const [onboardedSql] = db.query.mock.calls[0] as [string, unknown[]];
    expect(onboardedSql).toContain("status='active'");
  });

  it('advances ONBOARDED enrollments with a real recent login to ACTIVE', async () => {
    const db = fakeDb();
    db.query.mockResolvedValueOnce([[], 0]); // no onboarding advances
    db.query.mockResolvedValueOnce([[{ id: 'enrollment-2' }], 1]); // activated advance
    const service = new PilotLifecycleSyncService(db as never);
    const result = await service.sync();
    expect(result).toEqual({ onboarded: 0, activated: 1 });
  });

  it('never touches COMPLETED or DROPPED enrollments (WHERE clause scopes only REGISTERED/ONBOARDED)', async () => {
    const db = fakeDb();
    db.query.mockResolvedValueOnce([[], 0]);
    db.query.mockResolvedValueOnce([[], 0]);
    const service = new PilotLifecycleSyncService(db as never);
    await service.sync();
    const [onboardedSql] = db.query.mock.calls[0] as [string, unknown[]];
    const [activatedSql] = db.query.mock.calls[1] as [string, unknown[]];
    expect(onboardedSql).toContain('status=$2');
    expect(activatedSql).toContain('status=$2');
    expect(onboardedSql).not.toContain('COMPLETED');
    expect(onboardedSql).not.toContain('DROPPED');
  });
});

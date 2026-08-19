import { BadRequestException, ForbiddenException, NotFoundException } from '@nestjs/common';
import { IncidentLifecycleService } from '../src/domain/impact/incident-lifecycle.service';
import { IncidentState, VerificationStatus } from '../src/domain/digital-twin/digital-twin.enums';

function fakeDb(): {
  query: jest.Mock<Promise<unknown[]>, [string, unknown[]?]>;
  transaction: jest.Mock;
} {
  const query = jest.fn<Promise<unknown[]>, [string, unknown[]?]>().mockResolvedValue([]);
  const transaction = jest.fn((callback: (manager: { query: typeof query }) => unknown) =>
    callback({ query }),
  );
  return { query, transaction };
}

const ownedIncidentRow = {
  id: 'incident-1',
  fieldId: null,
  state: IncidentState.Investigating,
  confidence: 0.7,
  resolvedAt: null,
};

describe('IncidentLifecycleService', () => {
  it('confirms an incident and sets farmer_confirmed/farmer_confirmed_at', async () => {
    const db = fakeDb();
    db.query.mockResolvedValueOnce([ownedIncidentRow]); // ownedIncident
    // DataSource.query() for an UPDATE...RETURNING returns a [rows, affectedCount] tuple.
    db.query.mockResolvedValueOnce([
      [{ id: 'incident-1', farmerConfirmed: true, farmerConfirmedAt: new Date() }],
      1,
    ]); // UPDATE
    const service = new IncidentLifecycleService(db as never);
    const result = (await service.confirmIncident('user-1', 'farm-1', 'incident-1', {
      confirmed: true,
    })) as { farmerConfirmed: boolean };
    expect(result.farmerConfirmed).toBe(true);
    const [, updateParams] = db.query.mock.calls[1] as [string, unknown[]];
    expect(updateParams).toEqual([true, 'incident-1']);
  });

  it('throws NotFoundException when the incident does not belong to the caller', async () => {
    const db = fakeDb();
    db.query.mockResolvedValueOnce([]); // ownedIncident finds nothing
    const service = new IncidentLifecycleService(db as never);
    await expect(
      service.confirmIncident('user-1', 'farm-1', 'incident-1', { confirmed: true }),
    ).rejects.toBeInstanceOf(NotFoundException);
  });

  it('sets expert_confirmed fields for an admin/expert review', async () => {
    const db = fakeDb();
    // DataSource.query() for an UPDATE...RETURNING returns a [rows, affectedCount] tuple.
    db.query.mockResolvedValueOnce([
      [{ id: 'incident-1', expertConfirmed: false, expertConfirmedAt: new Date() }],
      1,
    ]);
    const service = new IncidentLifecycleService(db as never);
    const result = (await service.expertConfirmIncident('admin-1', 'incident-1', {
      confirmed: false,
      notes: 'Does not match satellite evidence',
    })) as { expertConfirmed: boolean };
    expect(result.expertConfirmed).toBe(false);
  });

  it('rejects a follow-up with no real evidence reference', async () => {
    const db = fakeDb();
    db.query.mockResolvedValueOnce([ownedIncidentRow]); // ownedIncident
    const service = new IncidentLifecycleService(db as never);
    await expect(
      service.recordFollowUp('user-1', 'farm-1', 'incident-1', {
        status: VerificationStatus.Improved,
      }),
    ).rejects.toBeInstanceOf(BadRequestException);
  });

  it('rejects a follow-up whose evidence id does not belong to the caller', async () => {
    const db = fakeDb();
    db.query.mockResolvedValueOnce([ownedIncidentRow]); // ownedIncident
    db.query.mockResolvedValueOnce([]); // crop scan ownership check fails
    const service = new IncidentLifecycleService(db as never);
    await expect(
      service.recordFollowUp('user-1', 'farm-1', 'incident-1', {
        status: VerificationStatus.Improved,
        cropScanId: 'scan-1',
      }),
    ).rejects.toBeInstanceOf(ForbiddenException);
  });

  it('resolves the incident and sets resolved_at when a follow-up reports IMPROVED', async () => {
    const db = fakeDb();
    db.query.mockResolvedValueOnce([ownedIncidentRow]); // ownedIncident
    db.query.mockResolvedValueOnce([{ id: 'insp-1' }]); // field inspection ownership check
    db.query.mockResolvedValueOnce([{ id: 'verification-1', status: 'IMPROVED' }]); // INSERT farm_verifications (via tx)
    db.query.mockResolvedValueOnce([]); // UPDATE farm_incidents (via tx)
    const service = new IncidentLifecycleService(db as never);
    await service.recordFollowUp('user-1', 'farm-1', 'incident-1', {
      status: VerificationStatus.Improved,
      fieldInspectionId: 'insp-1',
    });
    const updateCall = db.query.mock.calls[3] as [string, unknown[]];
    expect(updateCall[0]).toContain('UPDATE farm_incidents');
    const [, , , state, resolvedAt] = updateCall[1];
    expect(state).toBe(IncidentState.Resolved);
    expect(resolvedAt).toBeInstanceOf(Date);
  });

  it('escalates without setting resolved_at when a follow-up reports WORSENED', async () => {
    const db = fakeDb();
    db.query.mockResolvedValueOnce([ownedIncidentRow]); // ownedIncident
    db.query.mockResolvedValueOnce([{ id: 'insp-1' }]); // field inspection ownership check
    db.query.mockResolvedValueOnce([{ id: 'verification-1', status: 'WORSENED' }]); // INSERT
    db.query.mockResolvedValueOnce([]); // UPDATE
    const service = new IncidentLifecycleService(db as never);
    await service.recordFollowUp('user-1', 'farm-1', 'incident-1', {
      status: VerificationStatus.Worsened,
      fieldInspectionId: 'insp-1',
    });
    const updateCall = db.query.mock.calls[3] as [string, unknown[]];
    const [, , , state, resolvedAt] = updateCall[1];
    expect(state).toBe(IncidentState.Escalated);
    expect(resolvedAt).toBeNull();
  });
});

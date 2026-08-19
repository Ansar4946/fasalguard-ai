import { BadRequestException, ConflictException, NotFoundException } from '@nestjs/common';
import { PilotEnrollmentService } from '../src/domain/growth/pilot-enrollment.service';
import { PilotEnrollmentStatus } from '../src/domain/growth/growth.enums';

function fakeDb(): {
  query: jest.Mock<Promise<unknown>, [string, unknown[]?]>;
  transaction: jest.Mock;
} {
  const query = jest.fn<Promise<unknown>, [string, unknown[]?]>().mockResolvedValue([]);
  const transaction = jest.fn((callback: (manager: { query: typeof query }) => unknown) =>
    callback({ query }),
  );
  return { query, transaction };
}

describe('PilotEnrollmentService', () => {
  it('rejects inviting a user who is not a real, active farmer', async () => {
    const db = fakeDb();
    db.query.mockResolvedValueOnce([]); // target lookup finds nothing
    const service = new PilotEnrollmentService(db as never);
    await expect(service.invite('admin-1', 'user-1')).rejects.toBeInstanceOf(NotFoundException);
  });

  it('rejects a duplicate active enrollment for the same user', async () => {
    const db = fakeDb();
    db.query.mockResolvedValueOnce([{ id: 'user-1', source: 'DIRECT' }]); // target
    db.query.mockResolvedValueOnce([{ id: 'existing-enrollment' }]); // existing check
    const service = new PilotEnrollmentService(db as never);
    await expect(service.invite('admin-1', 'user-1')).rejects.toBeInstanceOf(ConflictException);
  });

  it('invites a real farmer and copies their acquisition source onto the enrollment', async () => {
    const db = fakeDb();
    db.query.mockResolvedValueOnce([{ id: 'user-1', source: 'REFERRAL' }]); // target
    db.query.mockResolvedValueOnce([]); // no existing enrollment
    db.query.mockResolvedValueOnce([{ id: 'enrollment-1', status: PilotEnrollmentStatus.Invited }]); // INSERT (flat array)
    const service = new PilotEnrollmentService(db as never);
    const result = (await service.invite('admin-1', 'user-1')) as { status: string };
    expect(result.status).toBe(PilotEnrollmentStatus.Invited);
    const [, insertParams] = db.query.mock.calls[2] as [string, unknown[]];
    expect(insertParams).toEqual([
      null,
      'user-1',
      PilotEnrollmentStatus.Invited,
      'admin-1',
      'REFERRAL',
    ]);
  });

  it('throws when responding to an invite that does not exist', async () => {
    const db = fakeDb();
    db.query.mockResolvedValueOnce([]); // no enrollment found
    const service = new PilotEnrollmentService(db as never);
    await expect(service.respondToInvite('user-1', true)).rejects.toBeInstanceOf(NotFoundException);
  });

  it('throws when the invitation has already been responded to', async () => {
    const db = fakeDb();
    db.query.mockResolvedValueOnce([
      { id: 'enrollment-1', status: PilotEnrollmentStatus.Registered },
    ]);
    const service = new PilotEnrollmentService(db as never);
    await expect(service.respondToInvite('user-1', true)).rejects.toBeInstanceOf(
      BadRequestException,
    );
  });

  it('accepting an invite writes a real consent row and transitions to REGISTERED', async () => {
    const db = fakeDb();
    db.query.mockResolvedValueOnce([{ id: 'enrollment-1', status: PilotEnrollmentStatus.Invited }]); // lookup
    db.query.mockResolvedValueOnce(undefined); // INSERT consents (no RETURNING, result unused)
    // DataSource.query() for an UPDATE...RETURNING returns a [rows, affectedCount] tuple.
    db.query.mockResolvedValueOnce([
      [{ id: 'enrollment-1', status: PilotEnrollmentStatus.Registered, registeredAt: new Date() }],
      1,
    ]);
    const service = new PilotEnrollmentService(db as never);
    const result = (await service.respondToInvite('user-1', true)) as { status: string };
    expect(result.status).toBe(PilotEnrollmentStatus.Registered);
    const [consentSql, consentParams] = db.query.mock.calls[1] as [string, unknown[]];
    expect(consentSql).toContain('INSERT INTO consents');
    expect(consentParams).toEqual(['user-1', 'RESEARCH_DATA_USE', 'PILOT-1']);
  });

  it('declining an invite sets DROPPED without writing a consent row', async () => {
    const db = fakeDb();
    db.query.mockResolvedValueOnce([{ id: 'enrollment-1', status: PilotEnrollmentStatus.Invited }]); // lookup
    db.query.mockResolvedValueOnce([
      [{ id: 'enrollment-1', status: PilotEnrollmentStatus.Dropped, droppedAt: new Date() }],
      1,
    ]);
    const service = new PilotEnrollmentService(db as never);
    const result = (await service.respondToInvite('user-1', false)) as { status: string };
    expect(result.status).toBe(PilotEnrollmentStatus.Dropped);
    expect(db.query.mock.calls.length).toBe(2);
  });

  it('complete() throws when the enrollment is already closed out', async () => {
    const db = fakeDb();
    db.query.mockResolvedValueOnce([[], 0]);
    const service = new PilotEnrollmentService(db as never);
    await expect(service.complete('admin-1', 'enrollment-1')).rejects.toBeInstanceOf(
      NotFoundException,
    );
  });

  it('complete() marks an open enrollment COMPLETED', async () => {
    const db = fakeDb();
    db.query.mockResolvedValueOnce([
      [{ id: 'enrollment-1', status: PilotEnrollmentStatus.Completed, completedAt: new Date() }],
      1,
    ]);
    const service = new PilotEnrollmentService(db as never);
    const result = (await service.complete('admin-1', 'enrollment-1')) as { status: string };
    expect(result.status).toBe(PilotEnrollmentStatus.Completed);
  });
});

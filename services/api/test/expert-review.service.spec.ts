import type { DataSource } from 'typeorm';
import type { AuthPrincipal } from '../src/domain/auth/auth.types';
import { ExpertReviewService } from '../src/domain/expert-review/expert-review.service';
import { UserRole } from '../src/domain/identity/identity.enums';
import { ForbiddenException } from '@nestjs/common';

describe('ExpertReviewService audit and AI evidence boundary', () => {
  it('records an expert correction without updating the original AI diagnosis or prediction', async () => {
    const runnerWrites: string[] = [];
    const runner = {
      connect: jest.fn(),
      startTransaction: jest.fn(),
      commitTransaction: jest.fn(),
      rollbackTransaction: jest.fn(),
      release: jest.fn(),
      query: jest.fn((sql: string) => {
        runnerWrites.push(sql);
        if (sql.includes('SELECT id FROM crop_scans')) return Promise.resolve([{ id: 'scan-id' }]);
        if (sql.includes('INSERT INTO expert_reviews')) return Promise.resolve([]);
        if (sql.includes('SELECT id,status FROM expert_reviews'))
          return Promise.resolve([{ id: 'review-id', status: 'IN_REVIEW' }]);
        return Promise.resolve([]);
      }),
    };
    const db = {
      query: jest.fn((sql: string) => {
        if (sql.includes('JOIN expert_profiles')) return Promise.resolve([{}]);
        if (sql.includes('JOIN expert_assignments')) return Promise.resolve([{}]);
        if (sql.includes('SELECT cs.id "caseId"')) return Promise.resolve([{ caseId: 'scan-id' }]);
        return Promise.resolve([]);
      }),
      createQueryRunner: jest.fn(() => runner),
    } as unknown as DataSource;
    const principal: AuthPrincipal = {
      userId: 'expert-id',
      role: UserRole.AgricultureExpert,
      sessionId: 'session-id',
    };

    await new ExpertReviewService(db).confirm(principal, 'scan-id', {
      condition: 'Cotton leaf curl disease',
      notes: 'Confirmed from visible morphology.',
    });

    expect(runnerWrites.some((sql) => sql.includes('INSERT INTO case_status_history'))).toBe(true);
    expect(runnerWrites.some((sql) => /UPDATE\s+(diagnoses|model_predictions)/i.test(sql))).toBe(
      false,
    );
    expect(runner.commitTransaction).toHaveBeenCalledTimes(1);
  });
  it('blocks an expert from deciding a case that is not assigned to them', async () => {
    const db = {
      query: jest.fn((sql: string) =>
        Promise.resolve(sql.includes('JOIN expert_profiles') ? [{}] : []),
      ),
    } as unknown as DataSource;
    const principal: AuthPrincipal = {
      userId: 'expert-id',
      role: UserRole.AgricultureExpert,
      sessionId: 'session-id',
    };
    await expect(
      new ExpertReviewService(db).reject(principal, 'scan-id', { notes: 'Insufficient evidence.' }),
    ).rejects.toBeInstanceOf(ForbiddenException);
  });
});

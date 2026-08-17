import { NotFoundException } from '@nestjs/common';
import type { DataSource } from 'typeorm';
import { ActionPlanService } from '../src/domain/knowledge/action-plan.service';

describe('ActionPlanService approval boundary', () => {
  it('cannot generate a farmer plan when no approved guideline matches', async () => {
    const queries: string[] = [];
    const db = {
      query: jest.fn((sql: string) => {
        queries.push(sql);
        if (sql.includes('FROM crop_scans'))
          return Promise.resolve([
            {
              cropId: '11111111-1111-4111-8111-111111111111',
              condition: 'Leaf curl',
              severity: 'HIGH',
            },
          ]);
        return Promise.resolve([]);
      }),
    } as unknown as DataSource;

    await expect(new ActionPlanService(db).generate('farmer-id', 'scan-id')).rejects.toEqual(
      expect.objectContaining<Partial<NotFoundException>>({ name: 'NotFoundException' }),
    );
    const selection = queries.find((sql) => sql.includes('FROM treatment_guidelines')) ?? '';
    expect(selection).toContain("status='APPROVED'");
    expect(selection).toContain('approved_at IS NOT NULL');
    expect(queries.some((sql) => sql.includes('INSERT INTO action_plans'))).toBe(false);
  });

  it('does not create chemical steps unless chemical guidance has separate approval', async () => {
    const writes: Array<{ sql: string; values: unknown[] }> = [];
    const runner = {
      connect: jest.fn(),
      startTransaction: jest.fn(),
      commitTransaction: jest.fn(),
      rollbackTransaction: jest.fn(),
      release: jest.fn(),
      query: jest.fn((sql: string, values: unknown[]) => {
        writes.push({ sql, values });
        return Promise.resolve(sql.includes('INSERT INTO action_plans') ? [{ id: 'plan-id' }] : []);
      }),
    };
    const db = {
      query: jest
        .fn()
        .mockResolvedValueOnce([{ cropId: 'crop-id', condition: 'Leaf curl', severity: 'HIGH' }])
        .mockResolvedValueOnce([
          {
            id: 'guideline-id',
            guideline_version: 2,
            immediate_actions: ['Inspect nearby plants'],
            preventive_actions: ['Maintain field hygiene'],
            monitoring_actions: ['Monitor spread'],
            expert_escalation_criteria: ['Request expert review'],
            chemical_guidance: { instruction: 'restricted' },
            chemical_guidance_approved: false,
          },
        ])
        .mockResolvedValueOnce([{ id: 'plan-id', steps: [] }]),
      createQueryRunner: jest.fn(() => runner),
    } as unknown as DataSource;

    await new ActionPlanService(db).generate('farmer-id', 'scan-id');
    const stepWrites = writes.filter((entry) =>
      entry.sql.includes('INSERT INTO action_plan_steps'),
    );
    expect(stepWrites).toHaveLength(4);
    expect(stepWrites.flatMap((entry) => entry.values)).not.toContain('CHEMICAL');
    expect(runner.commitTransaction).toHaveBeenCalledTimes(1);
  });
});

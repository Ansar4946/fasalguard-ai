import { EntitlementMetric } from '../src/domain/billing/billing.enums';
import { EntitlementService } from '../src/domain/billing/entitlement.service';

describe('EntitlementService', () => {
  it('falls back to FREE limits when no subscription exists (own or pilot org)', async () => {
    const db = { query: jest.fn().mockResolvedValue([]) };
    const service = new EntitlementService(db as never);
    const plan = await service.getActivePlan('user-1');
    expect(plan.planCode).toBe('FREE');
    expect(plan.limits.maxFarms).toBe(1);
    expect(plan.limits.satelliteMonitoring).toBe(false);
  });

  it('throws ENTITLEMENT_LIMIT_REACHED when the caller is already at the plan limit', async () => {
    const db = { query: jest.fn().mockResolvedValue([]) };
    const service = new EntitlementService(db as never);
    await expect(
      service.assertWithinLimit('user-1', EntitlementMetric.Farms, 1),
    ).rejects.toMatchObject({
      response: { code: 'ENTITLEMENT_LIMIT_REACHED' },
    });
  });

  it('allows the action when the caller is under the plan limit', async () => {
    const db = { query: jest.fn().mockResolvedValue([]) };
    const service = new EntitlementService(db as never);
    await expect(
      service.assertWithinLimit('user-1', EntitlementMetric.Farms, 0),
    ).resolves.toBeUndefined();
  });

  it('never throws for a null (unlimited) limit', async () => {
    const db = {
      query: jest.fn().mockResolvedValue([
        {
          subscriptionId: 'sub-1',
          planCode: 'COOPERATIVE',
          limits: {
            maxFarms: null,
            maxActiveCropSeasons: null,
            geminiAnalysesPerMonth: 1000,
            satelliteMonitoring: true,
            advancedReports: true,
            maxTeamMembers: null,
          },
        },
      ]),
    };
    const service = new EntitlementService(db as never);
    await expect(
      service.assertWithinLimit('user-1', EntitlementMetric.Farms, 999_999),
    ).resolves.toBeUndefined();
  });

  it('assertFeatureEnabled throws when a boolean plan feature is off', async () => {
    const db = { query: jest.fn().mockResolvedValue([]) };
    const service = new EntitlementService(db as never);
    await expect(
      service.assertFeatureEnabled('user-1', EntitlementMetric.SatelliteMonitoring),
    ).rejects.toMatchObject({
      response: { code: 'ENTITLEMENT_LIMIT_REACHED' },
    });
  });
});

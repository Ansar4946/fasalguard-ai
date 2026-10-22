import {
  averageHealth,
  presentDashboard,
  prioritizeFields,
} from '../src/domain/dashboard/dashboard.presenter';
import type { DashboardFieldRow } from '../src/domain/dashboard/dashboard.types';

const field = (overrides: Partial<DashboardFieldRow>): DashboardFieldRow => ({
  id: 'field',
  name: 'Field',
  farmId: 'farm',
  farmName: 'Farm',
  areaHectares: 1,
  cropName: null,
  growthStage: null,
  healthScore: null,
  healthUpdatedAt: null,
  riskScore: null,
  riskLevel: null,
  riskAssessedAt: null,
  lastScanAt: null,
  ...overrides,
});

describe('dashboard presenter', () => {
  it('averages only fields that have a health score', () => {
    expect(averageHealth([field({ healthScore: 80 }), field({ healthScore: 61 }), field({})])).toBe(
      71,
    );
    expect(averageHealth([field({})])).toBeNull();
  });

  it('orders by risk level, then score, with unassessed fields last', () => {
    const ordered = prioritizeFields([
      field({ id: 'none' }),
      field({ id: 'low', riskLevel: 'LOW', riskScore: 20 }),
      field({ id: 'high-a', riskLevel: 'HIGH', riskScore: 70 }),
      field({ id: 'high-b', riskLevel: 'HIGH', riskScore: 78 }),
      field({ id: 'critical', riskLevel: 'CRITICAL', riskScore: 90 }),
    ]);
    expect(ordered.map((x) => x.id)).toEqual(['critical', 'high-b', 'high-a', 'low', 'none']);
  });

  it('reports windowed totals and strips them from list items', () => {
    const now = new Date('2026-10-02T06:00:00Z');
    const result = presentDashboard({
      farmer: { fullName: 'Test Farmer', district: 'Multan', province: 'Punjab' },
      fields: [field({ healthScore: 50 })],
      farms: [{ id: 'farm', name: 'Farm', latitude: 30.2, longitude: 71.5 }],
      tasks: [
        { id: 't1', title: 'Inspect', source: 'MANUAL', dueAt: null, fieldName: null, total: 7 },
      ],
      scans: [],
      alerts: [
        { id: 'a1', category: 'WEATHER', title: 'Rain', body: 'Rain', createdAt: now, total: 4 },
      ],
      outbreaks: [],
      outbreakRadiusKm: 25,
      now,
    });
    expect(result.summary).toEqual({
      farmCount: 1,
      fieldCount: 1,
      averageHealthScore: 50,
      nearbyOutbreakCount: 0,
      pendingTaskCount: 7,
      unreadAlertCount: 4,
    });
    expect(result.tasks[0]).not.toHaveProperty('total');
    expect(result.alerts[0]).not.toHaveProperty('total');
    expect(result.generatedAt).toBe(now.toISOString());
  });

  it('returns an empty, zeroed summary for a user without farms', () => {
    const result = presentDashboard({
      farmer: null,
      fields: [],
      farms: [],
      tasks: [],
      scans: [],
      alerts: [],
      outbreaks: [],
      outbreakRadiusKm: 25,
      now: new Date(),
    });
    expect(result.summary.pendingTaskCount).toBe(0);
    expect(result.summary.averageHealthScore).toBeNull();
  });
});

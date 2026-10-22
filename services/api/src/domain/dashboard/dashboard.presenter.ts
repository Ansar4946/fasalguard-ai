import type {
  DashboardAlertRow,
  DashboardFarmPoint,
  DashboardFieldRow,
  DashboardOutbreakRow,
  DashboardResponse,
  DashboardScanRow,
  DashboardTaskRow,
  RiskLevel,
} from './dashboard.types';

const riskRank: Record<RiskLevel, number> = {
  CRITICAL: 4,
  HIGH: 3,
  MODERATE: 2,
  LOW: 1,
  VERY_LOW: 0,
};

export interface DashboardSource {
  farmer: DashboardResponse['farmer'];
  fields: DashboardFieldRow[];
  farms: DashboardFarmPoint[];
  tasks: DashboardTaskRow[];
  scans: DashboardScanRow[];
  alerts: DashboardAlertRow[];
  outbreaks: DashboardOutbreakRow[];
  outbreakRadiusKm: number;
  now: Date;
}

/** Highest current risk first; fields with no valid assessment sort after assessed ones. */
export function prioritizeFields(fields: DashboardFieldRow[]): DashboardFieldRow[] {
  return [...fields].sort((a, b) => {
    const rankA = a.riskLevel ? riskRank[a.riskLevel] : -1;
    const rankB = b.riskLevel ? riskRank[b.riskLevel] : -1;
    if (rankA !== rankB) return rankB - rankA;
    return (b.riskScore ?? -1) - (a.riskScore ?? -1);
  });
}

/** Mean of each field's latest satellite health score; null when no field has been scored yet. */
export function averageHealth(fields: DashboardFieldRow[]): number | null {
  const scores = fields
    .map((field) => field.healthScore)
    .filter((score): score is number => typeof score === 'number' && Number.isFinite(score));
  if (!scores.length) return null;
  return Math.round(scores.reduce((sum, score) => sum + score, 0) / scores.length);
}

export function presentDashboard(source: DashboardSource): DashboardResponse {
  const { fields, tasks, alerts } = source;
  return {
    farmer: source.farmer,
    summary: {
      farmCount: source.farms.length,
      fieldCount: fields.length,
      averageHealthScore: averageHealth(fields),
      nearbyOutbreakCount: source.outbreaks.length,
      pendingTaskCount: tasks[0]?.total ?? 0,
      unreadAlertCount: alerts[0]?.total ?? 0,
    },
    fields: prioritizeFields(fields),
    farms: source.farms,
    tasks: tasks.map(withoutTotal),
    recentScans: source.scans,
    alerts: alerts.map(withoutTotal),
    nearbyOutbreaks: source.outbreaks,
    outbreakRadiusKm: source.outbreakRadiusKm,
    generatedAt: source.now.toISOString(),
  };
}

/** Window-function totals ride along on every row; the list items themselves don't carry them. */
function withoutTotal<T extends { total: number }>(row: T): Omit<T, 'total'> {
  const copy: Partial<T> = { ...row };
  delete copy.total;
  return copy as Omit<T, 'total'>;
}

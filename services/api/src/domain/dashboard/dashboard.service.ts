import { Injectable } from '@nestjs/common';
import { InjectDataSource } from '@nestjs/typeorm';
import { DataSource } from 'typeorm';
import { CropScanStatus } from '../crop-scans/crop-scan.enums';
import { CropCycleStatus, FarmStatus, FieldStatus } from '../farms/farm.enums';
import { presentDashboard } from './dashboard.presenter';
import type {
  DashboardAlertRow,
  DashboardFarmPoint,
  DashboardFieldRow,
  DashboardOutbreakRow,
  DashboardResponse,
  DashboardScanRow,
  DashboardTaskRow,
} from './dashboard.types';

/** Outbreak clusters whose public (privacy-coarsened) area lies within this distance of a field. */
export const NEARBY_OUTBREAK_RADIUS_METERS = 25_000;
const ALERT_CATEGORIES = ['WEATHER', 'SATELLITE', 'OUTBREAK', 'DIAGNOSIS', 'EXPERT'];
const ALERT_LOOKBACK_DAYS = 14;

@Injectable()
export class DashboardService {
  constructor(@InjectDataSource() private readonly db: DataSource) {}

  /**
   * One ownership-scoped read model for the farmer home screen. Every query is filtered by the
   * caller's user or farmer-profile ID, and nothing here triggers provider calls or new
   * assessments — the dashboard only reports what the pipelines have already recorded.
   */
  async forUser(userId: string): Promise<DashboardResponse> {
    const profiles = await this.db.query<
      Array<{ id: string; fullName: string; district: string | null; province: string | null }>
    >(`SELECT id,full_name "fullName",district,province FROM farmer_profiles WHERE user_id=$1`, [
      userId,
    ]);
    const profile = profiles[0];
    const [fields, farms, tasks, scans, alerts, outbreaks] = await Promise.all([
      profile ? this.fields(profile.id, userId) : Promise.resolve([]),
      profile ? this.farms(profile.id) : Promise.resolve([]),
      this.tasks(userId),
      this.scans(userId),
      this.alerts(userId),
      profile ? this.outbreaks(profile.id) : Promise.resolve([]),
    ]);
    return presentDashboard({
      farmer: profile
        ? { fullName: profile.fullName, district: profile.district, province: profile.province }
        : null,
      fields,
      farms,
      tasks,
      scans,
      alerts,
      outbreaks,
      outbreakRadiusKm: NEARBY_OUTBREAK_RADIUS_METERS / 1000,
      now: new Date(),
    });
  }

  private fields(farmerId: string, userId: string): Promise<DashboardFieldRow[]> {
    return this.db.query<DashboardFieldRow[]>(
      `SELECT fi.id,fi.name,fa.id "farmId",fa.name "farmName",fi.area_hectares "areaHectares",
              c.name "cropName",cc.growth_stage "growthStage",
              hs.score "healthScore",hs.created_at "healthUpdatedAt",
              ra.score "riskScore",ra.level "riskLevel",ra.created_at "riskAssessedAt",
              ls.created_at "lastScanAt"
       FROM fields fi
       JOIN farms fa ON fa.id=fi.farm_id AND fa.deleted_at IS NULL AND fa.status=$3
       LEFT JOIN LATERAL (SELECT crop_id,growth_stage FROM crop_cycles x WHERE x.field_id=fi.id AND x.status=$4 AND x.deleted_at IS NULL ORDER BY x.created_at DESC LIMIT 1) cc ON true
       LEFT JOIN crops c ON c.id=cc.crop_id
       LEFT JOIN LATERAL (SELECT score,created_at FROM field_health_scores h WHERE h.field_id=fi.id ORDER BY h.created_at DESC LIMIT 1) hs ON true
       LEFT JOIN LATERAL (SELECT score,level,created_at FROM field_risk_assessments r WHERE r.field_id=fi.id AND r.valid_until>now() ORDER BY r.created_at DESC LIMIT 1) ra ON true
       LEFT JOIN LATERAL (SELECT created_at FROM crop_scans s WHERE s.field_id=fi.id AND s.owner_id=$2 ORDER BY s.created_at DESC LIMIT 1) ls ON true
       WHERE fa.farmer_id=$1 AND fi.deleted_at IS NULL AND fi.status<>$5
       ORDER BY fa.created_at,fi.created_at LIMIT 200`,
      [farmerId, userId, FarmStatus.Active, CropCycleStatus.Active, FieldStatus.Archived],
    );
  }

  private farms(farmerId: string): Promise<DashboardFarmPoint[]> {
    return this.db.query<DashboardFarmPoint[]>(
      `SELECT id,name,ST_Y(centroid)::float latitude,ST_X(centroid)::float longitude FROM farms
       WHERE farmer_id=$1 AND deleted_at IS NULL AND status=$2 ORDER BY created_at LIMIT 100`,
      [farmerId, FarmStatus.Active],
    );
  }

  private tasks(userId: string): Promise<DashboardTaskRow[]> {
    return this.db.query<DashboardTaskRow[]>(
      `SELECT t.id,t.title,t.source,t.due_at "dueAt",fi.name "fieldName",count(*) OVER()::integer total
       FROM farmer_tasks t LEFT JOIN fields fi ON fi.id=t.field_id AND fi.deleted_at IS NULL
       WHERE t.user_id=$1 AND t.status='PENDING' AND t.deleted_at IS NULL
       ORDER BY t.due_at NULLS LAST,t.created_at DESC LIMIT 5`,
      [userId],
    );
  }

  private scans(userId: string): Promise<DashboardScanRow[]> {
    return this.db.query<DashboardScanRow[]>(
      `SELECT cs.id,cs.status,cs.created_at "createdAt",d.screened_condition "screenedCondition",
              d.confidence,d.disposition,fi.name "fieldName"
       FROM crop_scans cs
       LEFT JOIN diagnoses d ON d.scan_id=cs.id
       LEFT JOIN fields fi ON fi.id=cs.field_id
       WHERE cs.owner_id=$1 AND cs.status<>$2
       ORDER BY cs.created_at DESC LIMIT 3`,
      [userId, CropScanStatus.Created],
    );
  }

  private alerts(userId: string): Promise<DashboardAlertRow[]> {
    return this.db.query<DashboardAlertRow[]>(
      `SELECT id,category,title,body,created_at "createdAt",count(*) OVER()::integer total
       FROM notifications
       WHERE user_id=$1 AND read_at IS NULL AND category=ANY($2::text[])
         AND created_at>=now()-make_interval(days=>$3)
       ORDER BY created_at DESC LIMIT 3`,
      [userId, ALERT_CATEGORIES, ALERT_LOOKBACK_DAYS],
    );
  }

  /** Uses only the cluster's public area — never member report locations. */
  private outbreaks(farmerId: string): Promise<DashboardOutbreakRow[]> {
    return this.db.query<DashboardOutbreakRow[]>(
      `SELECT oc.id,c.name crop,oc.condition_family "conditionFamily",oc.status,
              oc.last_reported_at "lastReportedAt",ST_AsGeoJSON(oc.public_area)::jsonb geometry,
              round((min(ST_Distance(oc.public_area::geography,fi.centroid::geography))/1000)::numeric,1)::float "distanceKm"
       FROM outbreak_clusters oc
       JOIN crops c ON c.id=oc.crop_id
       JOIN fields fi ON fi.deleted_at IS NULL AND ST_DWithin(oc.public_area::geography,fi.centroid::geography,$2)
       JOIN farms fa ON fa.id=fi.farm_id AND fa.deleted_at IS NULL AND fa.farmer_id=$1
       WHERE oc.status<>'RESOLVED'
       GROUP BY oc.id,c.name
       ORDER BY "distanceKm",oc.last_reported_at DESC LIMIT 10`,
      [farmerId, NEARBY_OUTBREAK_RADIUS_METERS],
    );
  }
}

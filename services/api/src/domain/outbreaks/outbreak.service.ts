import {
  BadRequestException,
  ForbiddenException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { InjectDataSource } from '@nestjs/typeorm';
import type { QueryRunner } from 'typeorm';
import { DataSource } from 'typeorm';
import type { AuthPrincipal } from '../auth/auth.types';
import { UserRole } from '../identity/identity.enums';
import { MediaStatus } from '../media/media.enums';
import { RiskAssessmentService } from '../risk/risk.service';
import type { CreateCommunityReportDto, VerifyCommunityReportDto } from './dto/outbreak.dto';
import {
  CommunityReportSource,
  CommunityVerificationAnswer,
  OutbreakClusterStatus,
} from './outbreak.enums';
interface ReportContext {
  reporterId: string;
  fieldId: string;
  scanId: string | null;
  cropId: string;
  conditionFamily: string;
  expertConfirmed: boolean;
}
interface Settings {
  id: string;
  distance_radius_meters: number;
  time_window_hours: number;
  minimum_report_count: number;
  expert_confirmation_required: boolean;
  public_grid_degrees: number;
}
@Injectable()
export class OutbreakService {
  constructor(
    @InjectDataSource() private readonly db: DataSource,
    private readonly fieldRisk: RiskAssessmentService,
  ) {}
  async create(p: AuthPrincipal, d: CreateCommunityReportDto): Promise<unknown> {
    const context = await this.context(p, d);
    await this.assertConsent(context.reporterId);
    const q = this.db.createQueryRunner();
    await q.connect();
    await q.startTransaction();
    try {
      const settings = (await q.query(
        `SELECT * FROM outbreak_settings WHERE active=true FOR SHARE`,
      )) as Settings[];
      if (!settings[0])
        throw new BadRequestException('Outbreak detection settings are not configured.');
      await q.query(`SELECT pg_advisory_xact_lock(hashtext($1))`, [
        `${context.cropId}:${context.conditionFamily}`,
      ]);
      const abuse = (await q.query(
        `SELECT count(*)::integer count FROM community_reports WHERE reporter_id=$1 AND reported_at>now()-interval '24 hours'`,
        [context.reporterId],
      )) as Array<{ count: number }>;
      if (abuse[0]!.count >= 20)
        throw new BadRequestException('Community reporting limit reached.');
      if (d.source === CommunityReportSource.FarmerManual) {
        const recent = (await q.query(
          `SELECT 1 FROM community_reports WHERE reporter_id=$1 AND field_id=$2 AND lower(condition_family)=lower($3) AND reported_at>now()-interval '6 hours'`,
          [context.reporterId, context.fieldId, context.conditionFamily],
        )) as unknown[];
        if (recent.length) throw new BadRequestException('A similar recent report already exists.');
      }
      const rows = (await q.query(
        `INSERT INTO community_reports(reporter_id,field_id,scan_id,source,crop_id,condition_family,private_location,public_area,expert_confirmed,reported_at)SELECT $1,$2,$3,$4,$5,$6,f.centroid,ST_MakeEnvelope(floor(ST_X(f.centroid)/$7)*$7,floor(ST_Y(f.centroid)/$7)*$7,(floor(ST_X(f.centroid)/$7)+1)*$7,(floor(ST_Y(f.centroid)/$7)+1)*$7,4326),$8,now() FROM fields f WHERE f.id=$2 RETURNING id`,
        [
          context.reporterId,
          context.fieldId,
          context.scanId,
          d.source,
          context.cropId,
          context.conditionFamily,
          settings[0].public_grid_degrees,
          context.expertConfirmed,
        ],
      )) as Array<{ id: string }>;
      await this.cluster(q, rows[0]!.id, context, settings[0]);
      await q.commitTransaction();
      try {
        await this.fieldRisk.enqueueNearbyOutbreak(context.fieldId, context.cropId);
      } catch {
        // A committed report remains valid if asynchronous reassessment is temporarily unavailable.
      }
      return {
        id: rows[0]!.id,
        source: d.source,
        cropId: context.cropId,
        conditionFamily: context.conditionFamily,
        reported: true,
        locationPrivacy: 'REGIONAL_GRID_ONLY',
      };
    } catch (e) {
      await q.rollbackTransaction();
      throw e;
    } finally {
      await q.release();
    }
  }
  async verify(p: AuthPrincipal, reportId: string, d: VerifyCommunityReportDto): Promise<unknown> {
    if (p.role !== UserRole.Farmer)
      throw new ForbiddenException('Only farmers may submit community verification.');
    await this.assertConsent(p.userId);
    if (d.answer === CommunityVerificationAnswer.PhotoSubmitted && !d.mediaAssetId)
      throw new BadRequestException('A photo is required.');
    if (d.answer !== CommunityVerificationAnswer.PhotoSubmitted && d.mediaAssetId)
      throw new BadRequestException('Photos are accepted only with PHOTO_SUBMITTED.');
    if (d.mediaAssetId) {
      const media = await this.db.query<Array<{ status: MediaStatus; content_type: string }>>(
        `SELECT status,content_type FROM media_assets WHERE id=$1 AND owner_id=$2`,
        [d.mediaAssetId, p.userId],
      );
      if (
        !media[0] ||
        media[0].status !== MediaStatus.Ready ||
        !media[0].content_type.startsWith('image/')
      )
        throw new BadRequestException('A completed image owned by the verifier is required.');
    }
    try {
      const rows = await this.db.query<unknown[]>(
        `INSERT INTO community_verifications(report_id,verifier_id,answer,media_asset_id)SELECT id,$2,$3,$4 FROM community_reports WHERE id=$1 AND reporter_id<>$2 AND abuse_status='ACCEPTED' RETURNING id,answer,created_at "createdAt"`,
        [reportId, p.userId, d.answer, d.mediaAssetId ?? null],
      );
      if (!rows[0]) throw new NotFoundException('Eligible community report was not found.');
      return rows[0];
    } catch (e: unknown) {
      if (this.isUniqueViolation(e))
        throw new BadRequestException('You have already verified this report.');
      throw e;
    }
  }
  list(): Promise<unknown[]> {
    return this.db.query<unknown[]>(
      `SELECT oc.id,c.name crop,oc.condition_family "conditionFamily",oc.status,oc.first_reported_at "firstReportedAt",oc.last_reported_at "lastReportedAt",count(DISTINCT om.report_id)::integer "reportCount",count(DISTINCT cr.reporter_id)::integer "anonymousFarmerCount",count(*)FILTER(WHERE cr.expert_confirmed)::integer "expertConfirmedCount" FROM outbreak_clusters oc JOIN crops c ON c.id=oc.crop_id LEFT JOIN outbreak_members om ON om.cluster_id=oc.id LEFT JOIN community_reports cr ON cr.id=om.report_id GROUP BY oc.id,c.name ORDER BY oc.last_reported_at DESC LIMIT 100`,
    );
  }
  async detail(id: string): Promise<unknown> {
    const rows = await this.db.query<unknown[]>(
      `SELECT oc.id,c.name crop,oc.condition_family "conditionFamily",oc.status,oc.first_reported_at "firstReportedAt",oc.last_reported_at "lastReportedAt",ST_AsGeoJSON(oc.public_area)::jsonb "sanitizedArea",count(DISTINCT om.report_id)::integer "reportCount",count(DISTINCT cr.reporter_id)::integer "anonymousFarmerCount",count(*)FILTER(WHERE cr.expert_confirmed)::integer "expertConfirmedCount",COALESCE((SELECT jsonb_agg(jsonb_build_object('id',ra.id,'title',ra.title,'message',ra.message,'language',ra.language,'publishedAt',ra.published_at))FROM regional_advisories ra WHERE ra.cluster_id=oc.id AND ra.published_at IS NOT NULL),'[]') advisories FROM outbreak_clusters oc JOIN crops c ON c.id=oc.crop_id LEFT JOIN outbreak_members om ON om.cluster_id=oc.id LEFT JOIN community_reports cr ON cr.id=om.report_id WHERE oc.id=$1 GROUP BY oc.id,c.name`,
      [id],
    );
    if (!rows[0]) throw new NotFoundException('Outbreak was not found.');
    return rows[0];
  }
  map(): Promise<unknown[]> {
    return this.db.query<unknown[]>(
      `SELECT oc.id,c.name crop,oc.condition_family "conditionFamily",oc.status,ST_AsGeoJSON(oc.public_area)::jsonb geometry,count(om.report_id)::integer "reportCount" FROM outbreak_clusters oc JOIN crops c ON c.id=oc.crop_id LEFT JOIN outbreak_members om ON om.cluster_id=oc.id WHERE oc.status<>'RESOLVED' GROUP BY oc.id,c.name ORDER BY oc.updated_at DESC LIMIT 500`,
    );
  }
  private async cluster(
    q: QueryRunner,
    reportId: string,
    c: ReportContext,
    s: Settings,
  ): Promise<void> {
    const nearby = (await q.query(
      `SELECT id,expert_confirmed,reported_at FROM community_reports WHERE crop_id=$1 AND lower(condition_family)=lower($2) AND abuse_status='ACCEPTED' AND reported_at>=now()-make_interval(hours=>$3) AND ST_DWithin(private_location::geography,(SELECT private_location::geography FROM community_reports WHERE id=$4),$5)`,
      [c.cropId, c.conditionFamily, s.time_window_hours, reportId, s.distance_radius_meters],
    )) as Array<{ id: string; expert_confirmed: boolean; reported_at: Date }>;
    if (nearby.length < s.minimum_report_count) return;
    const expert = nearby.some((x) => x.expert_confirmed);
    const status = s.expert_confirmation_required
      ? expert
        ? OutbreakClusterStatus.Confirmed
        : OutbreakClusterStatus.ExpertReview
      : OutbreakClusterStatus.Suspected;
    const existing = (await q.query(
      `SELECT id FROM outbreak_clusters WHERE crop_id=$1 AND lower(condition_family)=lower($2) AND status NOT IN('RESOLVED','DECLINING') AND ST_DWithin(private_centroid::geography,(SELECT private_location::geography FROM community_reports WHERE id=$3),$4) ORDER BY last_reported_at DESC LIMIT 1 FOR UPDATE`,
      [c.cropId, c.conditionFamily, reportId, s.distance_radius_meters],
    )) as Array<{ id: string }>;
    let clusterId = existing[0]?.id;
    if (!clusterId) {
      const cluster = (await q.query(
        `INSERT INTO outbreak_clusters(crop_id,condition_family,status,private_centroid,public_area,first_reported_at,last_reported_at,settings_id)SELECT $1,$2,$3,ST_Centroid(ST_Collect(private_location)),ST_MakeEnvelope(floor(ST_X(ST_Centroid(ST_Collect(private_location)))/$4)*$4,floor(ST_Y(ST_Centroid(ST_Collect(private_location)))/$4)*$4,(floor(ST_X(ST_Centroid(ST_Collect(private_location)))/$4)+1)*$4,(floor(ST_Y(ST_Centroid(ST_Collect(private_location)))/$4)+1)*$4,4326),min(reported_at),max(reported_at),$5 FROM community_reports WHERE id=ANY($6::uuid[]) RETURNING id`,
        [c.cropId, c.conditionFamily, status, s.public_grid_degrees, s.id, nearby.map((x) => x.id)],
      )) as Array<{ id: string }>;
      clusterId = cluster[0]!.id;
    } else
      await q.query(
        `UPDATE outbreak_clusters SET status=$2,last_reported_at=(SELECT max(reported_at)FROM community_reports WHERE id=ANY($3::uuid[])),private_centroid=(SELECT ST_Centroid(ST_Collect(private_location))FROM community_reports WHERE id=ANY($3::uuid[])),updated_at=now(),version=version+1 WHERE id=$1`,
        [clusterId, status, nearby.map((x) => x.id)],
      );
    await q.query(
      `INSERT INTO outbreak_members(cluster_id,report_id)SELECT $1,unnest($2::uuid[])ON CONFLICT DO NOTHING`,
      [clusterId, nearby.map((x) => x.id)],
    );
  }
  private async context(p: AuthPrincipal, d: CreateCommunityReportDto): Promise<ReportContext> {
    if (d.source === CommunityReportSource.FarmerManual) {
      if (p.role !== UserRole.Farmer || !d.fieldId || !d.cropId || !d.conditionFamily)
        throw new BadRequestException('Manual reports require field, crop and condition family.');
      const rows = await this.db.query<Array<{ reporterId: string; fieldId: string }>>(
        `SELECT u.id "reporterId",fi.id "fieldId" FROM users u JOIN farmer_profiles fp ON fp.user_id=u.id JOIN farms fa ON fa.farmer_id=fp.id JOIN fields fi ON fi.farm_id=fa.id JOIN LATERAL(SELECT crop_id FROM crop_cycles x WHERE x.field_id=fi.id AND x.status='active' AND x.deleted_at IS NULL ORDER BY x.created_at DESC LIMIT 1)cc ON true WHERE u.id=$1 AND fi.id=$2 AND cc.crop_id=$3 AND fi.deleted_at IS NULL`,
        [p.userId, d.fieldId, d.cropId],
      );
      if (!rows[0]) throw new NotFoundException('Field was not found.');
      return {
        ...rows[0],
        scanId: null,
        cropId: d.cropId,
        conditionFamily: this.normalize(d.conditionFamily),
        expertConfirmed: false,
      };
    }
    if (!d.scanId) throw new BadRequestException('A crop scan is required.');
    const expert = d.source === CommunityReportSource.ExpertConfirmed;
    if (
      expert &&
      ![UserRole.AgricultureExpert, UserRole.Admin, UserRole.SuperAdmin].includes(p.role)
    )
      throw new ForbiddenException();
    if (expert && p.role === UserRole.AgricultureExpert) {
      const verified = await this.db.query<unknown[]>(
        `SELECT 1 FROM expert_profiles WHERE user_id=$1 AND verification_status='verified'`,
        [p.userId],
      );
      if (!verified.length) throw new ForbiddenException('A verified expert is required.');
    }
    const rows = await this.db.query<Array<ReportContext>>(
      `SELECT cs.owner_id "reporterId",cs.field_id "fieldId",cs.id "scanId",cc.crop_id "cropId",COALESCE(er.confirmed_condition,d.screened_condition) "conditionFamily",COALESCE(er.decision='CONFIRMED',false) "expertConfirmed" FROM crop_scans cs JOIN fields fi ON fi.id=cs.field_id JOIN LATERAL(SELECT * FROM crop_cycles x WHERE x.field_id=fi.id AND x.status='active' AND x.deleted_at IS NULL ORDER BY x.created_at DESC LIMIT 1)cc ON true LEFT JOIN diagnoses d ON d.scan_id=cs.id LEFT JOIN expert_reviews er ON er.scan_id=cs.id WHERE cs.id=$1 AND ($2::boolean OR cs.owner_id=$3)`,
      [d.scanId, expert, p.userId],
    );
    const row = rows[0];
    if (!row || !row.conditionFamily || (expert && !row.expertConfirmed))
      throw new BadRequestException('An eligible diagnosed or expert-confirmed scan is required.');
    row.conditionFamily = this.normalize(row.conditionFamily);
    return row;
  }
  private normalize(x: string): string {
    return x.trim().replace(/\s+/g, ' ').toUpperCase();
  }
  private async assertConsent(id: string): Promise<void> {
    const rows = await this.db.query<Array<{ granted: boolean }>>(
      `SELECT granted FROM consents WHERE user_id=$1 AND type='ANONYMOUS_COMMUNITY_REPORTING' ORDER BY recorded_at DESC LIMIT 1`,
      [id],
    );
    if (!rows[0]?.granted)
      throw new ForbiddenException('Anonymous community reporting consent is required.');
  }
  private isUniqueViolation(e: unknown): boolean {
    return (
      typeof e === 'object' &&
      e !== null &&
      'code' in e &&
      (e as { code?: string }).code === '23505'
    );
  }
}

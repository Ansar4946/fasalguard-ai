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
import type {
  AssignExpertDto,
  ExpertDecisionDto,
  MoreInfoDto,
  RecommendationDto,
  ResolveCaseDto,
} from './dto/expert-review.dto';
import { ExpertCaseStatus, ExpertDecision } from './expert-review.enums';

@Injectable()
export class ExpertReviewService {
  constructor(@InjectDataSource() private readonly db: DataSource) {}
  async list(p: AuthPrincipal): Promise<unknown[]> {
    await this.assertVerifiedExpertOrAdmin(p);
    const own =
      p.role === UserRole.AgricultureExpert
        ? 'AND ea.expert_id=$1 AND ea.unassigned_at IS NULL'
        : '';
    return this.db.query<unknown[]>(
      `SELECT cs.id,"caseId",cs.status "scanStatus",cs.created_at "submittedAt",fp.full_name "farmerName",f.name "fieldName",c.name crop,d.screened_condition "aiCondition",d.confidence,sa.severity,COALESCE(er.status,'PENDING') status FROM crop_scans cs JOIN users u ON u.id=cs.owner_id LEFT JOIN farmer_profiles fp ON fp.user_id=u.id LEFT JOIN fields f ON f.id=cs.field_id LEFT JOIN LATERAL(SELECT * FROM crop_cycles x WHERE x.field_id=f.id AND x.status='active' AND x.deleted_at IS NULL ORDER BY x.created_at DESC LIMIT 1)cc ON true LEFT JOIN crops c ON c.id=cc.crop_id LEFT JOIN diagnoses d ON d.scan_id=cs.id LEFT JOIN LATERAL(SELECT * FROM severity_assessments x WHERE x.scan_id=cs.id ORDER BY generated_at DESC LIMIT 1)sa ON true LEFT JOIN expert_reviews er ON er.scan_id=cs.id LEFT JOIN expert_assignments ea ON ea.review_id=er.id WHERE (sa.expert_escalation=true OR cs.status IN('EXPERT_REVIEW','VERIFIED')) ${own} ORDER BY cs.created_at DESC LIMIT 100`,
      own ? [p.userId] : [],
    );
  }
  async detail(p: AuthPrincipal, scanId: string): Promise<unknown> {
    await this.assertCaseAccess(p, scanId, true);
    const rows = await this.db.query<unknown[]>(
      `SELECT cs.id "caseId",cs.status "scanStatus",cs.created_at "submittedAt",jsonb_build_object('id',u.id,'name',fp.full_name,'preferredLanguage',fp.preferred_language,'province',fp.province,'district',fp.district) farmer,jsonb_build_object('id',fa.id,'name',fa.name,'province',fa.province,'district',fa.district) farm,jsonb_build_object('id',fi.id,'name',fi.name,'areaHectares',fi.area_hectares) field,jsonb_build_object('id',cc.id,'crop',c.name,'variety',cv.name,'growthStage',cc.growth_stage,'sowingDate',cc.sowing_date,'expectedHarvestDate',cc.expected_harvest_date) "cropCycle",COALESCE((SELECT jsonb_agg(jsonb_build_object('scanImageId',si.id,'category',si.category,'mediaAssetId',si.media_asset_id,'contentType',ma.content_type,'quality',iq.issues,'acceptable',iq.acceptable) ORDER BY si.created_at) FROM scan_images si JOIN media_assets ma ON ma.id=si.media_asset_id LEFT JOIN image_quality_results iq ON iq.scan_image_id=si.id WHERE si.scan_id=cs.id),'[]') images,COALESCE((SELECT jsonb_agg(jsonb_build_object('condition',mp.predicted_condition,'confidence',mp.confidence,'modelId',mv.model_id,'modelVersion',mv.model_version,'inferenceTimestamp',mp.inference_timestamp) ORDER BY mp.inference_timestamp DESC) FROM model_predictions mp JOIN model_versions mv ON mv.id=mp.model_version_id WHERE mp.scan_id=cs.id),'[]') "modelPredictions",COALESCE((SELECT jsonb_agg(jsonb_build_object('question',q.question_text,'answer',a.answer_text,'answeredAt',a.answered_at) ORDER BY q.display_order) FROM follow_up_questions q LEFT JOIN follow_up_answers a ON a.question_id=q.id WHERE q.scan_id=cs.id),'[]') "followUpAnswers",(SELECT to_jsonb(sa)-'ruleset_id' FROM severity_assessments sa WHERE sa.scan_id=cs.id ORDER BY sa.generated_at DESC LIMIT 1) severity,(SELECT jsonb_build_object('captureId',sc.id,'acquisitionDate',sc.acquisition_date,'dataQuality',sc.data_quality,'healthScore',fh.score,'stressZones',(SELECT count(*) FROM satellite_stress_zones z WHERE z.capture_id=sc.id)) FROM satellite_captures sc LEFT JOIN field_health_scores fh ON fh.capture_id=sc.id WHERE sc.field_id=fi.id ORDER BY sc.acquisition_date DESC NULLS LAST LIMIT 1) satellite,(SELECT jsonb_build_object('observedAt',ws.observed_at,'values',ws.values) FROM weather_snapshots ws WHERE ws.field_id=fi.id ORDER BY ws.observed_at DESC LIMIT 1) weather,COALESCE((SELECT jsonb_agg(to_jsonb(pd) ORDER BY pd.created_at DESC) FROM diagnoses pd JOIN crop_scans pcs ON pcs.id=pd.scan_id WHERE pcs.field_id=fi.id AND pcs.id<>cs.id),'[]') "previousDiagnoses",(SELECT jsonb_build_object('id',ap.id,'guidelineId',ap.guideline_id,'guidelineVersion',ap.guideline_version,'severity',ap.severity,'steps',(SELECT jsonb_agg(jsonb_build_object('type',aps.type,'instruction',aps.instruction) ORDER BY aps.display_order) FROM action_plan_steps aps WHERE aps.action_plan_id=ap.id)) FROM action_plans ap WHERE ap.scan_id=cs.id ORDER BY ap.created_at DESC LIMIT 1) "actionPlan",to_jsonb(er) "expertReview",COALESCE((SELECT jsonb_agg(jsonb_build_object('from',h.from_status,'to',h.to_status,'reason',h.reason,'actorId',h.actor_id,'createdAt',h.created_at)ORDER BY h.created_at)FROM case_status_history h WHERE h.review_id=er.id),'[]') "statusHistory" FROM crop_scans cs JOIN users u ON u.id=cs.owner_id LEFT JOIN farmer_profiles fp ON fp.user_id=u.id LEFT JOIN fields fi ON fi.id=cs.field_id LEFT JOIN farms fa ON fa.id=fi.farm_id LEFT JOIN LATERAL(SELECT * FROM crop_cycles x WHERE x.field_id=fi.id AND x.status='active' AND x.deleted_at IS NULL ORDER BY x.created_at DESC LIMIT 1)cc ON true LEFT JOIN crops c ON c.id=cc.crop_id LEFT JOIN crop_varieties cv ON cv.id=cc.crop_variety_id LEFT JOIN expert_reviews er ON er.scan_id=cs.id WHERE cs.id=$1`,
      [scanId],
    );
    if (!rows[0]) throw new NotFoundException('Expert case was not found.');
    return rows[0];
  }
  async assign(p: AuthPrincipal, scanId: string, dto: AssignExpertDto): Promise<unknown> {
    await this.assertVerifiedExpertOrAdmin(p);
    const expertId = dto.expertId ?? p.userId;
    if (p.role === UserRole.AgricultureExpert && expertId !== p.userId)
      throw new ForbiddenException('Experts may only assign cases to themselves.');
    await this.assertVerifiedExpert(expertId);
    return this.transition(
      p,
      scanId,
      ExpertCaseStatus.Assigned,
      'Case assigned',
      async (q, reviewId) => {
        await q.query(
          `UPDATE expert_assignments SET unassigned_at=now() WHERE review_id=$1 AND unassigned_at IS NULL`,
          [reviewId],
        );
        await q.query(
          `INSERT INTO expert_assignments(review_id,expert_id,assigned_by,assigned_at)VALUES($1,$2,$3,now())`,
          [reviewId, expertId, p.userId],
        );
      },
    );
  }
  confirm(p: AuthPrincipal, id: string, d: ExpertDecisionDto): Promise<unknown> {
    if (!d.condition) throw new BadRequestException('Confirmed condition is required.');
    return this.decision(p, id, ExpertCaseStatus.Confirmed, ExpertDecision.Confirmed, d);
  }
  reject(p: AuthPrincipal, id: string, d: ExpertDecisionDto): Promise<unknown> {
    return this.decision(p, id, ExpertCaseStatus.Rejected, ExpertDecision.Rejected, d);
  }
  requestMoreInfo(p: AuthPrincipal, id: string, d: MoreInfoDto): Promise<unknown> {
    return this.transitionAssigned(p, id, ExpertCaseStatus.MoreInfoRequested, d.request);
  }
  recommendation(p: AuthPrincipal, id: string, d: RecommendationDto): Promise<unknown> {
    return this.transitionAssigned(
      p,
      id,
      ExpertCaseStatus.RecommendationProvided,
      'Expert recommendation provided',
      async (q, reviewId) => {
        if (d.guidelineId) {
          const approved = (await q.query(
            `SELECT 1 FROM treatment_guidelines WHERE id=$1 AND status='APPROVED'`,
            [d.guidelineId],
          )) as unknown[];
          if (!approved.length)
            throw new BadRequestException('Recommendation guideline must be approved.');
        }
        await q.query(
          `UPDATE expert_reviews SET recommendation=$2,recommendation_guideline_id=$3 WHERE id=$1`,
          [reviewId, d.recommendation, d.guidelineId ?? null],
        );
      },
    );
  }
  resolve(p: AuthPrincipal, id: string, d: ResolveCaseDto): Promise<unknown> {
    return this.transitionAssigned(
      p,
      id,
      ExpertCaseStatus.Resolved,
      d.notes ?? 'Case resolved',
      async (q, reviewId) => {
        await q.query(`UPDATE expert_reviews SET resolved_at=now() WHERE id=$1`, [reviewId]);
      },
    );
  }
  private decision(
    p: AuthPrincipal,
    id: string,
    status: ExpertCaseStatus,
    decision: ExpertDecision,
    d: ExpertDecisionDto,
  ): Promise<unknown> {
    return this.transitionAssigned(p, id, status, d.notes, async (q, reviewId) => {
      await q.query(
        `UPDATE expert_reviews SET decision=$2,confirmed_condition=$3,decision_notes=$4 WHERE id=$1`,
        [reviewId, decision, d.condition ?? null, d.notes],
      );
    });
  }
  private async transitionAssigned(
    p: AuthPrincipal,
    id: string,
    to: ExpertCaseStatus,
    reason: string,
    extra?: (q: QueryRunner, id: string) => Promise<void>,
  ): Promise<unknown> {
    await this.assertCaseAccess(p, id, true);
    return this.transition(p, id, to, reason, extra);
  }
  private async transition(
    p: AuthPrincipal,
    scanId: string,
    to: ExpertCaseStatus,
    reason: string,
    extra?: (q: QueryRunner, id: string) => Promise<void>,
  ): Promise<unknown> {
    const q = this.db.createQueryRunner();
    await q.connect();
    await q.startTransaction();
    try {
      const scans = (await q.query(`SELECT id FROM crop_scans WHERE id=$1 FOR UPDATE`, [
        scanId,
      ])) as Array<{ id: string }>;
      if (!scans[0]) throw new NotFoundException('Expert case was not found.');
      const inserted = (await q.query(
        `INSERT INTO expert_reviews(scan_id,status)VALUES($1,$2)ON CONFLICT(scan_id)DO NOTHING RETURNING id,status`,
        [scanId, to],
      )) as Array<{ id: string; status: ExpertCaseStatus }>;
      let review = inserted[0];
      if (!review) {
        const current = (await q.query(
          `SELECT id,status FROM expert_reviews WHERE scan_id=$1 FOR UPDATE`,
          [scanId],
        )) as Array<{ id: string; status: ExpertCaseStatus }>;
        review = current[0]!;
        if (review.status === ExpertCaseStatus.Resolved)
          throw new BadRequestException('Resolved cases cannot transition again.');
        await q.query(
          `UPDATE expert_reviews SET status=$2,updated_at=now(),version=version+1 WHERE id=$1`,
          [review.id, to],
        );
      }
      if (extra) await extra(q, review.id);
      await q.query(
        `INSERT INTO case_status_history(review_id,actor_id,from_status,to_status,reason,metadata)VALUES($1,$2,$3,$4,$5,$6)`,
        [
          review.id,
          p.userId,
          inserted[0] ? null : review.status,
          to,
          reason,
          JSON.stringify({ actorRole: p.role }),
        ],
      );
      await q.commitTransaction();
      return this.detail(p, scanId);
    } catch (e) {
      await q.rollbackTransaction();
      throw e;
    } finally {
      await q.release();
    }
  }
  private async assertCaseAccess(
    p: AuthPrincipal,
    scanId: string,
    mustBeAssigned: boolean,
  ): Promise<void> {
    await this.assertVerifiedExpertOrAdmin(p);
    if (p.role !== UserRole.AgricultureExpert) return;
    const rows = await this.db.query<unknown[]>(
      `SELECT 1 FROM expert_reviews er JOIN expert_assignments ea ON ea.review_id=er.id WHERE er.scan_id=$1 AND ea.expert_id=$2 AND ea.unassigned_at IS NULL`,
      [scanId, p.userId],
    );
    if (mustBeAssigned && !rows.length)
      throw new ForbiddenException('This case is not assigned to you.');
  }
  private async assertVerifiedExpertOrAdmin(p: AuthPrincipal): Promise<void> {
    if (p.role === UserRole.AgricultureExpert) await this.assertVerifiedExpert(p.userId);
    else if (![UserRole.Admin, UserRole.SuperAdmin].includes(p.role))
      throw new ForbiddenException();
  }
  private async assertVerifiedExpert(id: string): Promise<void> {
    const rows = await this.db.query<unknown[]>(
      `SELECT 1 FROM users u JOIN expert_profiles ep ON ep.user_id=u.id WHERE u.id=$1 AND u.role='AGRICULTURE_EXPERT' AND ep.verification_status='verified'`,
      [id],
    );
    if (!rows.length) throw new ForbiddenException('A verified agriculture expert is required.');
  }
}

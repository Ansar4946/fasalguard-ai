import {
  BadRequestException,
  ForbiddenException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { InjectDataSource } from '@nestjs/typeorm';
import { DataSource } from 'typeorm';
import { FeedbackContextType } from './growth.enums';
import type {
  PublishFeedbackDto,
  SubmitEventFeedbackDto,
  SubmitFeedbackDto,
} from './dto/growth.dto';
/* TypeORM raw query results are constrained by each explicit SQL projection below. */
/* eslint-disable @typescript-eslint/no-unsafe-assignment, @typescript-eslint/no-unsafe-return, @typescript-eslint/no-unsafe-member-access, @typescript-eslint/explicit-function-return-type */

/**
 * Activates `user_feedback` (created for the business-viability-evidence report, never
 * written to anywhere until this session). `submitEvent` never trusts the client's claim that
 * a "meaningful event" happened — it validates the real underlying record (run/incident/scan/
 * email-log row) before accepting feedback tied to it, matching the anti-fabrication discipline
 * used across every other feature this session.
 */
@Injectable()
export class FeedbackService {
  constructor(@InjectDataSource() private readonly db: DataSource) {}

  async submit(userId: string, dto: SubmitFeedbackDto) {
    const rows = await this.db.query(
      `INSERT INTO user_feedback(user_id,rating,feedback,context_type,context_id,consent_to_quote)
       VALUES($1,$2,$3,$4,$5,$6) RETURNING id,created_at "createdAt"`,
      [
        userId,
        dto.rating ?? null,
        dto.feedback,
        dto.contextType,
        dto.contextId ?? null,
        dto.consentToQuote ?? false,
      ],
    );
    return rows[0];
  }

  /** Real, event-triggered feedback. Validates (feature, contextId) against the real record. */
  async submitEvent(userId: string, dto: SubmitEventFeedbackDto) {
    const farmId = await this.validateEvent(userId, dto.feature, dto.contextId, dto.farmId);

    const parts: string[] = [];
    if (dto.whatHelped?.trim()) parts.push(`What helped: ${dto.whatHelped.trim()}`);
    if (dto.whatImprove?.trim()) parts.push(`What should improve: ${dto.whatImprove.trim()}`);
    const feedbackText = parts.length ? parts.join('\n\n') : null;

    const rows = await this.db.query(
      `INSERT INTO user_feedback(user_id,farm_id,useful,would_recommend,feedback,context_type,context_id,consent_to_quote)
       VALUES($1,$2,$3,$4,$5,$6,$7,$8) RETURNING id,created_at "createdAt"`,
      [
        userId,
        farmId,
        dto.useful,
        dto.wouldRecommend ?? null,
        feedbackText,
        dto.feature,
        dto.contextId ?? null,
        dto.permissionToQuote ?? false,
      ],
    );
    return rows[0];
  }

  private async validateEvent(
    userId: string,
    feature: FeedbackContextType,
    contextId: string | undefined,
    suppliedFarmId: string | undefined,
  ): Promise<string | null> {
    switch (feature) {
      case FeedbackContextType.RoadmapCompletion: {
        if (!contextId)
          throw new BadRequestException('contextId (the completed investigation) is required.');
        const rows: Array<{ farmId: string }> = await this.db.query(
          `SELECT farm_id "farmId" FROM farm_brain_runs WHERE id=$1 AND user_id=$2 AND status='COMPLETED'`,
          [contextId, userId],
        );
        if (!rows[0])
          throw new NotFoundException(
            'No completed investigation matching this id was found for you.',
          );
        return rows[0].farmId;
      }
      case FeedbackContextType.IncidentResolution: {
        if (!contextId)
          throw new BadRequestException('contextId (the resolved incident) is required.');
        const rows: Array<{ farmId: string }> = await this.db.query(
          `SELECT i.farm_id "farmId" FROM farm_incidents i
           JOIN farms f ON f.id=i.farm_id JOIN farmer_profiles fp ON fp.id=f.farmer_id
           WHERE i.id=$1 AND fp.user_id=$2 AND i.state='RESOLVED'`,
          [contextId, userId],
        );
        if (!rows[0])
          throw new NotFoundException('No resolved incident matching this id was found for you.');
        return rows[0].farmId;
      }
      case FeedbackContextType.CropDiagnosis: {
        if (!contextId)
          throw new BadRequestException('contextId (the diagnosed scan) is required.');
        const rows: Array<{ farmId: string | null }> = await this.db.query(
          `SELECT f.id "farmId" FROM crop_scans cs
           LEFT JOIN fields fi ON fi.id=cs.field_id
           LEFT JOIN farms f ON f.id=fi.farm_id
           WHERE cs.id=$1 AND cs.owner_id=$2 AND cs.status='DIAGNOSED'`,
          [contextId, userId],
        );
        if (!rows[0])
          throw new NotFoundException('No diagnosed crop scan matching this id was found for you.');
        return rows[0].farmId;
      }
      case FeedbackContextType.WeeklyReport: {
        const rows: Array<{ id: string }> = await this.db.query(
          `SELECT id FROM lifecycle_email_log WHERE user_id=$1 AND email_type='WEEKLY_SUMMARY' AND sent_at>=now()-interval '14 days' ORDER BY sent_at DESC LIMIT 1`,
          [userId],
        );
        if (!rows[0]) throw new NotFoundException('No recent weekly summary was found for you.');
        if (suppliedFarmId) {
          const owned: Array<{ id: string }> = await this.db.query(
            `SELECT f.id FROM farms f JOIN farmer_profiles fp ON fp.id=f.farmer_id WHERE f.id=$1 AND fp.user_id=$2 AND f.deleted_at IS NULL`,
            [suppliedFarmId, userId],
          );
          if (!owned[0]) throw new ForbiddenException('That farm does not belong to you.');
          return suppliedFarmId;
        }
        return null;
      }
      default:
        throw new BadRequestException('Unsupported feedback feature.');
    }
  }

  /** Real, org-wide aggregate report — excludes is_test_account, never fabricates. */
  async report() {
    const rows = await this.db.query<Array<Record<string, string | null>>>(`
      WITH real_feedback AS (
        SELECT f.* FROM user_feedback f
        JOIN users u ON u.id=f.user_id
        WHERE u.is_test_account=false
      )
      SELECT
        (SELECT count(*) FROM real_feedback)::text "feedbackCount",
        (SELECT count(*) FILTER (WHERE useful=true) FROM real_feedback)::text "usefulTrue",
        (SELECT count(*) FILTER (WHERE useful IS NOT NULL) FROM real_feedback)::text "usefulAnswered",
        (SELECT COALESCE(jsonb_agg(jsonb_build_object(
            'feature',context_type,'count',cnt,'usefulTrue',useful_true,'usefulAnswered',useful_answered
          ) ORDER BY cnt DESC),'[]'::jsonb) FROM (
          SELECT context_type,count(*) cnt,
            count(*) FILTER (WHERE useful=true) useful_true,
            count(*) FILTER (WHERE useful IS NOT NULL) useful_answered
          FROM real_feedback GROUP BY context_type
        ) x)::text "featureBreakdown",
        (SELECT count(*) FROM real_feedback WHERE consent_to_quote=true AND useful=true AND feedback IS NOT NULL AND published_at IS NULL)::text "testimonialCandidateCount",
        (SELECT count(*) FROM real_feedback WHERE published_at IS NOT NULL)::text "publishedCount"
    `);
    const r = rows[0] ?? {};
    const num = (key: string): number => Number(r[key] ?? 0);
    const feedbackCount = num('feedbackCount');
    const usefulTrue = num('usefulTrue');
    const usefulAnswered = num('usefulAnswered');
    const featureBreakdown = (
      JSON.parse(r.featureBreakdown ?? '[]') as Array<{
        feature: string;
        count: number;
        usefulTrue: number;
        usefulAnswered: number;
      }>
    ).map((row) => ({
      feature: row.feature,
      count: Number(row.count),
      positiveRate:
        Number(row.usefulAnswered) > 0 ? Number(row.usefulTrue) / Number(row.usefulAnswered) : null,
    }));

    return {
      generatedAt: new Date().toISOString(),
      policy: { excludesTestAccounts: true, neverAutoPublishes: true },
      feedbackCount,
      positiveRate: usefulAnswered > 0 ? usefulTrue / usefulAnswered : null,
      featureBreakdown,
      testimonialCandidateCount: num('testimonialCandidateCount'),
      publishedCount: num('publishedCount'),
    };
  }

  /** Rows awaiting admin curation — consented, positive, not yet published. */
  async listTestimonialCandidates() {
    return this.db.query(
      `SELECT f.id,f.feedback,f.context_type "feature",f.created_at "createdAt",
        u.id "userId",fp.full_name "fullName"
       FROM user_feedback f
       JOIN users u ON u.id=f.user_id
       LEFT JOIN farmer_profiles fp ON fp.user_id=u.id
       WHERE u.is_test_account=false AND f.consent_to_quote=true AND f.useful=true
         AND f.feedback IS NOT NULL AND f.published_at IS NULL
       ORDER BY f.created_at DESC LIMIT 200`,
    );
  }

  /** The only path to publication — rejects without real, explicit user consent. */
  async publish(adminUserId: string, feedbackId: string, dto: PublishFeedbackDto) {
    const rows: Array<{ id: string; consentToQuote: boolean }> = await this.db.query(
      `SELECT id,consent_to_quote "consentToQuote" FROM user_feedback WHERE id=$1`,
      [feedbackId],
    );
    const row = rows[0];
    if (!row) throw new NotFoundException('Feedback was not found.');
    if (!row.consentToQuote)
      throw new ForbiddenException('This feedback cannot be published without the user’s consent.');
    const [updated] = await this.db.query<[Array<{ id: string; publishedAt: Date }>, number]>(
      `UPDATE user_feedback SET published_at=now(),published_by=$2,public_reference_url=$3,updated_at=now(),version=version+1
       WHERE id=$1 RETURNING id,published_at "publishedAt"`,
      [feedbackId, adminUserId, dto.publicReferenceUrl ?? null],
    );
    return updated[0];
  }

  async unpublish(_adminUserId: string, feedbackId: string) {
    const [updated] = await this.db.query<[Array<{ id: string }>, number]>(
      `UPDATE user_feedback SET published_at=NULL,published_by=NULL,public_reference_url=NULL,updated_at=now(),version=version+1
       WHERE id=$1 RETURNING id`,
      [feedbackId],
    );
    if (!updated[0]) throw new NotFoundException('Feedback was not found.');
    return updated[0];
  }

  /** Real, public testimonials — only rows an admin has explicitly published. */
  async listPublished() {
    return this.db.query(
      `SELECT f.id,f.feedback,f.context_type "feature",f.public_reference_url "publicReferenceUrl",
        f.published_at "publishedAt",fp.full_name "fullName"
       FROM user_feedback f
       LEFT JOIN farmer_profiles fp ON fp.user_id=f.user_id
       WHERE f.published_at IS NOT NULL
       ORDER BY f.published_at DESC LIMIT 100`,
    );
  }

  async listForAdmin() {
    return this.db.query(
      `SELECT f.id,f.rating,f.useful,f.would_recommend "wouldRecommend",f.feedback,
        f.context_type "contextType",f.context_id "contextId",f.farm_id "farmId",
        f.consent_to_quote "consentToQuote",f.published_at "publishedAt",f.created_at "createdAt",
        u.id "userId",u.email,fp.full_name "fullName"
       FROM user_feedback f
       JOIN users u ON u.id=f.user_id
       LEFT JOIN farmer_profiles fp ON fp.user_id=u.id
       WHERE u.is_test_account=false
       ORDER BY f.created_at DESC LIMIT 500`,
    );
  }
}

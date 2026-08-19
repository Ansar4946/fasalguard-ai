import {
  BadRequestException,
  ForbiddenException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { InjectDataSource } from '@nestjs/typeorm';
import { DataSource } from 'typeorm';
import type { AuthPrincipal } from '../auth/auth.types';
import { UserRole } from '../identity/identity.enums';
import type {
  CreateArticleDto,
  CreateGuidelineDto,
  CreateSourceDto,
  ReviewGuidelineDto,
  UpdateArticleDto,
  UpdateGuidelineDto,
  UpdateSourceDto,
} from './dto/knowledge.dto';
import { GuidelineStatus } from './knowledge.enums';
@Injectable()
export class KnowledgeAdminService {
  constructor(@InjectDataSource() private readonly db: DataSource) {}
  async createSource(p: AuthPrincipal, d: CreateSourceDto): Promise<unknown> {
    const rows = await this.db.query<unknown[]>(
      `INSERT INTO guideline_sources(title,citation,url,published_at,created_by)VALUES($1,$2,$3,$4,$5)RETURNING *`,
      [d.title, d.citation, d.url ?? null, d.publishedAt ?? null, p.userId],
    );
    return rows[0];
  }
  listSources(): Promise<unknown[]> {
    return this.db.query(`SELECT * FROM guideline_sources ORDER BY created_at DESC`);
  }
  async updateSource(id: string, d: UpdateSourceDto): Promise<unknown> {
    // DataSource.query() for an UPDATE...RETURNING (outside an existing transaction/manager)
    // returns a [rows, affectedCount] tuple rather than a flat rows array — unwrap it explicitly.
    const [rows] = await this.db.query<[unknown[], number]>(
      `UPDATE guideline_sources SET title=COALESCE($2,title),citation=COALESCE($3,citation),url=COALESCE($4,url),published_at=COALESCE($5,published_at),updated_at=now(),version=version+1 WHERE id=$1 RETURNING *`,
      [id, d.title ?? null, d.citation ?? null, d.url ?? null, d.publishedAt ?? null],
    );
    if (!rows[0]) throw new NotFoundException('Guideline source was not found.');
    return rows[0];
  }
  async deleteSource(id: string): Promise<void> {
    try {
      const [rows] = await this.db.query<[unknown[], number]>(
        `DELETE FROM guideline_sources WHERE id=$1 RETURNING id`,
        [id],
      );
      if (!rows[0]) throw new NotFoundException('Guideline source was not found.');
    } catch (error: unknown) {
      if (error instanceof NotFoundException) throw error;
      throw new BadRequestException('Sources referenced by guidance cannot be deleted.');
    }
  }
  async createArticle(p: AuthPrincipal, d: CreateArticleDto): Promise<unknown> {
    const rows = await this.db.query<unknown[]>(
      `INSERT INTO knowledge_articles(title,content,language_code,author_id)VALUES($1,$2,$3,$4)RETURNING *`,
      [d.title, d.content, d.languageCode ?? 'en', p.userId],
    );
    return rows[0];
  }
  listArticles(): Promise<unknown[]> {
    return this.db.query(`SELECT * FROM knowledge_articles ORDER BY created_at DESC`);
  }
  async updateArticle(id: string, d: UpdateArticleDto): Promise<unknown> {
    // DataSource.query() for an UPDATE...RETURNING (outside an existing transaction/manager)
    // returns a [rows, affectedCount] tuple rather than a flat rows array — unwrap it explicitly.
    const [rows] = await this.db.query<[unknown[], number]>(
      `UPDATE knowledge_articles SET title=COALESCE($2,title),content=COALESCE($3,content),language_code=COALESCE($4,language_code),updated_at=now(),version=version+1 WHERE id=$1 AND status<>'APPROVED' RETURNING *`,
      [id, d.title ?? null, d.content ?? null, d.languageCode ?? null],
    );
    if (!rows[0]) throw new BadRequestException('Approved articles cannot be edited.');
    return rows[0];
  }
  async deleteArticle(id: string): Promise<void> {
    await this.db.query(
      `DELETE FROM knowledge_articles WHERE id=$1 AND status IN('DRAFT','RETIRED')`,
      [id],
    );
  }
  async createGuideline(p: AuthPrincipal, d: CreateGuidelineDto): Promise<unknown> {
    this.validateActions(d);
    const rows = await this.db.query<unknown[]>(
      `INSERT INTO treatment_guidelines(crop_id,crop_variety_id,condition,region,growth_stage,severity,immediate_actions,preventive_actions,monitoring_actions,expert_escalation_criteria,chemical_guidance,chemical_guidance_approved,source_id,author_id,review_due_at,status)VALUES($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,false,$12,$13,$14,'DRAFT')RETURNING *`,
      [
        d.cropId,
        d.cropVarietyId ?? null,
        d.condition,
        d.region ?? null,
        d.growthStage ?? null,
        d.severity ?? null,
        JSON.stringify(d.immediateActions),
        JSON.stringify(d.preventiveActions),
        JSON.stringify(d.monitoringActions),
        JSON.stringify(d.expertEscalationCriteria),
        d.chemicalGuidance ? JSON.stringify(d.chemicalGuidance) : null,
        d.sourceId,
        p.userId,
        d.reviewDueAt ?? null,
      ],
    );
    return rows[0];
  }
  listGuidelines(): Promise<unknown[]> {
    return this.db.query(`SELECT * FROM treatment_guidelines ORDER BY created_at DESC`);
  }
  async getGuideline(id: string): Promise<unknown> {
    const rows = await this.db.query<unknown[]>(`SELECT * FROM treatment_guidelines WHERE id=$1`, [
      id,
    ]);
    if (!rows[0]) throw new NotFoundException('Guideline was not found.');
    return rows[0];
  }
  async updateGuideline(id: string, d: UpdateGuidelineDto): Promise<unknown> {
    if (Object.keys(d).some((k) => k.endsWith('Actions') || k === 'expertEscalationCriteria'))
      this.validateActions({
        ...d,
        immediateActions: d.immediateActions ?? ['x'],
        preventiveActions: d.preventiveActions ?? ['x'],
        monitoringActions: d.monitoringActions ?? ['x'],
        expertEscalationCriteria: d.expertEscalationCriteria ?? ['x'],
      });
    // DataSource.query() for an UPDATE...RETURNING (outside an existing transaction/manager)
    // returns a [rows, affectedCount] tuple rather than a flat rows array — unwrap it explicitly.
    const [rows] = await this.db.query<[unknown[], number]>(
      `UPDATE treatment_guidelines SET condition=COALESCE($2,condition),region=COALESCE($3,region),growth_stage=COALESCE($4,growth_stage),severity=COALESCE($5,severity),immediate_actions=COALESCE($6,immediate_actions),preventive_actions=COALESCE($7,preventive_actions),monitoring_actions=COALESCE($8,monitoring_actions),expert_escalation_criteria=COALESCE($9,expert_escalation_criteria),chemical_guidance=COALESCE($10,chemical_guidance),chemical_guidance_approved=false,review_due_at=COALESCE($11,review_due_at),guideline_version=guideline_version+1,updated_at=now(),version=version+1 WHERE id=$1 AND status IN('DRAFT','UNDER_REVIEW') RETURNING *`,
      [
        id,
        d.condition ?? null,
        d.region ?? null,
        d.growthStage ?? null,
        d.severity ?? null,
        d.immediateActions ? JSON.stringify(d.immediateActions) : null,
        d.preventiveActions ? JSON.stringify(d.preventiveActions) : null,
        d.monitoringActions ? JSON.stringify(d.monitoringActions) : null,
        d.expertEscalationCriteria ? JSON.stringify(d.expertEscalationCriteria) : null,
        d.chemicalGuidance ? JSON.stringify(d.chemicalGuidance) : null,
        d.reviewDueAt ?? null,
      ],
    );
    if (!rows[0])
      throw new BadRequestException('Only draft or under-review guidance can be edited.');
    return rows[0];
  }
  async removeGuideline(id: string): Promise<void> {
    await this.db.query(`DELETE FROM treatment_guidelines WHERE id=$1 AND status='DRAFT'`, [id]);
  }
  async review(p: AuthPrincipal, id: string, d: ReviewGuidelineDto): Promise<unknown> {
    if (
      ![GuidelineStatus.UnderReview, GuidelineStatus.Approved, GuidelineStatus.Retired].includes(
        d.status,
      )
    )
      throw new BadRequestException('Invalid review transition.');
    if (d.status === GuidelineStatus.Approved) await this.assertApprover(p, id);
    const runner = this.db.createQueryRunner();
    await runner.connect();
    await runner.startTransaction();
    try {
      const currentRows = (await runner.query(
        `SELECT * FROM treatment_guidelines WHERE id=$1 FOR UPDATE`,
        [id],
      )) as Array<Record<string, unknown>>;
      const current = currentRows[0];
      if (!current) throw new NotFoundException('Guideline was not found.');
      if (current.status === GuidelineStatus.Retired)
        throw new BadRequestException('Retired guidance cannot be approved again.');
      const chemical = Boolean(d.approveChemicalGuidance && current.chemical_guidance);
      const reviewer = d.status === GuidelineStatus.Approved ? p.userId : current.reviewer_id;
      const approvedAt = d.status === GuidelineStatus.Approved ? new Date() : current.approved_at;
      // DataSource.query() for an UPDATE...RETURNING (outside an existing transaction/manager)
      // returns a [rows, affectedCount] tuple rather than a flat rows array — unwrap it explicitly.
      const [updatedRows] = (await runner.query(
        `UPDATE treatment_guidelines SET status=$2,reviewer_id=$3,approved_at=$4,chemical_guidance_approved=$5,updated_at=now(),version=version+1 WHERE id=$1 RETURNING *`,
        [id, d.status, reviewer, approvedAt, chemical],
      )) as [Array<Record<string, unknown>>, number];
      const updated = updatedRows[0]!;
      await runner.query(
        `INSERT INTO guideline_approvals(guideline_id,actor_id,actor_type,from_status,to_status,notes,chemical_guidance_approved,guideline_snapshot)VALUES($1,$2,$3,$4,$5,$6,$7,$8)`,
        [
          id,
          p.userId,
          p.role,
          current.status,
          d.status,
          d.notes ?? null,
          chemical,
          JSON.stringify(updated),
        ],
      );
      await runner.commitTransaction();
      return updated;
    } catch (e) {
      await runner.rollbackTransaction();
      throw e;
    } finally {
      await runner.release();
    }
  }
  approvals(id: string): Promise<unknown[]> {
    return this.db.query(
      `SELECT * FROM guideline_approvals WHERE guideline_id=$1 ORDER BY created_at`,
      [id],
    );
  }
  private validateActions(
    d: Pick<
      CreateGuidelineDto,
      'immediateActions' | 'preventiveActions' | 'monitoringActions' | 'expertEscalationCriteria'
    >,
  ): void {
    for (const values of [
      d.immediateActions,
      d.preventiveActions,
      d.monitoringActions,
      d.expertEscalationCriteria,
    ])
      if (values.length > 20 || values.some((x) => !x.trim() || x.length > 1000))
        throw new BadRequestException('Guideline actions are invalid.');
  }
  private async assertApprover(p: AuthPrincipal, id: string): Promise<void> {
    const guideline = (
      await this.db.query<Array<{ author_id: string | null }>>(
        `SELECT author_id FROM treatment_guidelines WHERE id=$1`,
        [id],
      )
    )[0];
    if (!guideline) throw new NotFoundException('Guideline was not found.');
    if (guideline.author_id === p.userId)
      throw new ForbiddenException('Authors cannot approve their own guidance.');
    if (p.role === UserRole.AgricultureExpert) {
      const verified = await this.db.query<unknown[]>(
        `SELECT 1 FROM expert_profiles WHERE user_id=$1 AND verification_status='verified'`,
        [p.userId],
      );
      if (!verified.length)
        throw new ForbiddenException('Only verified agriculture experts may approve guidance.');
    }
  }
}

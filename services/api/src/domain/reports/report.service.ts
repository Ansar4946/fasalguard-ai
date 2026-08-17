import {
  ConflictException,
  ForbiddenException,
  Inject,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { InjectQueue } from '@nestjs/bullmq';
import { InjectDataSource } from '@nestjs/typeorm';
import { createHash, randomUUID } from 'node:crypto';
import type { Queue } from 'bullmq';
import { DataSource } from 'typeorm';
import { ConfigService } from '@nestjs/config';
import type { AuthPrincipal } from '../auth/auth.types';
import { UserRole } from '../identity/identity.enums';
import {
  OBJECT_STORAGE_PROVIDER,
  type ObjectStorageProvider,
} from '../media/storage/object-storage.provider';
import type { CreateReportDto, ReportPageDto } from './dto/report.dto';
import { ReportStatus, ReportType } from './report.enums';
/* eslint-disable @typescript-eslint/explicit-function-return-type */

export const REPORT_QUEUE = 'report-generation';
export interface ReportJob {
  reportId: string;
  ownerId: string;
}
interface ReportRow {
  id: string;
  owner_id: string;
  type: ReportType;
  status: ReportStatus;
  resource_id: string | null;
  parameters: Record<string, unknown>;
  object_key: string | null;
  content_type: string | null;
  size_bytes: string | null;
  failure_code: string | null;
  deduplication_key: string;
  request_hash: string;
  created_at: Date;
  completed_at: Date | null;
}
const regionalRoles = new Set([
  UserRole.AgricultureExpert,
  UserRole.NgoViewer,
  UserRole.GovernmentViewer,
  UserRole.Admin,
  UserRole.SuperAdmin,
]);

@Injectable()
export class ReportService {
  constructor(
    @InjectDataSource() private readonly db: DataSource,
    @InjectQueue(REPORT_QUEUE) private readonly queue: Queue<ReportJob>,
    @Inject(OBJECT_STORAGE_PROVIDER) private readonly storage: ObjectStorageProvider,
    private readonly config: ConfigService,
  ) {}
  async create(p: AuthPrincipal, d: CreateReportDto) {
    await this.assertScope(p, d);
    const parameters = { from: d.from ?? null, to: d.to ?? null };
    const requestHash = createHash('sha256')
      .update(JSON.stringify({ type: d.type, resourceId: d.resourceId ?? null, parameters }))
      .digest('hex');
    const dedup = d.idempotencyKey ?? randomUUID();
    const existing = await this.db.query<ReportRow[]>(
      'SELECT * FROM generated_reports WHERE owner_id=$1 AND deduplication_key=$2',
      [p.userId, dedup],
    );
    if (existing[0]) {
      if (existing[0].request_hash !== requestHash)
        throw new ConflictException('Idempotency key was already used for another report.');
      return this.public(existing[0]);
    }
    const rows = await this.db.query<ReportRow[]>(
      'INSERT INTO generated_reports(owner_id,type,status,resource_id,parameters,deduplication_key,request_hash) VALUES($1,$2,$3,$4,$5,$6,$7) RETURNING *',
      [
        p.userId,
        d.type,
        ReportStatus.Queued,
        d.resourceId ?? null,
        JSON.stringify(parameters),
        dedup,
        requestHash,
      ],
    );
    const created = rows[0];
    if (!created) throw new Error('Report insert did not return a row.');
    await this.queue.add(
      'report:generate',
      { reportId: created.id, ownerId: p.userId },
      {
        jobId: `report-${created.id}`,
        attempts: 3,
        backoff: { type: 'exponential', delay: 2000 },
        removeOnComplete: 100,
        removeOnFail: 500,
      },
    );
    return this.public(created);
  }
  async list(p: AuthPrincipal, page: ReportPageDto) {
    const rows = await this.db.query<ReportRow[]>(
      `SELECT * FROM generated_reports WHERE owner_id=$1 AND ($2::timestamptz IS NULL OR created_at<$2) ORDER BY created_at DESC,id DESC LIMIT $3`,
      [p.userId, page.cursor ?? null, page.limit],
    );
    return {
      items: rows.map((x) => this.public(x)),
      nextCursor:
        rows.length === page.limit ? (rows.at(-1)?.created_at.toISOString() ?? null) : null,
    };
  }
  async get(p: AuthPrincipal, id: string) {
    const rows = await this.db.query<ReportRow[]>(
      'SELECT * FROM generated_reports WHERE id=$1 AND owner_id=$2',
      [id, p.userId],
    );
    const row = rows[0];
    if (!row) throw new NotFoundException('Report not found.');
    const result = this.public(row) as Record<string, unknown>;
    if (row.status === ReportStatus.Completed && row.object_key) {
      const access = await this.storage.createAccessUrl(row.object_key, this.signedUrlTtl());
      result.download = access;
    }
    return result;
  }
  async loadForWorker(id: string, ownerId: string) {
    const rows = await this.db.query<ReportRow[]>(
      'SELECT * FROM generated_reports WHERE id=$1 AND owner_id=$2',
      [id, ownerId],
    );
    if (!rows[0]) throw new NotFoundException('Report job not found.');
    return rows[0];
  }
  async lines(row: ReportRow): Promise<string[]> {
    const generated = `Generated (UTC): ${new Date().toISOString()}`;
    if (row.type === ReportType.OutbreakSummary) {
      const x = await this.db.query<Array<{ status: string; count: string }>>(
        'SELECT status, count(*)::text count FROM outbreak_clusters GROUP BY status ORDER BY status',
      );
      return [
        generated,
        'Privacy: aggregated regional data only.',
        ...x.map((v) => `${v.status}: ${v.count}`),
      ];
    }
    if (row.type === ReportType.WeeklyActionPlan) {
      const x = await this.db.query<Array<{ status: string; count: string }>>(
        'SELECT status,count(*)::text count FROM farmer_tasks WHERE user_id=$1 AND deleted_at IS NULL GROUP BY status',
        [row.owner_id],
      );
      return [generated, 'Weekly action-plan summary.', ...x.map((v) => `${v.status}: ${v.count}`)];
    }
    return [
      generated,
      `Report type: ${row.type}`,
      `Resource reference: ${row.resource_id ?? 'account scope'}`,
      'This report is decision support and does not replace expert agronomic review.',
    ];
  }
  async complete(row: ReportRow, pdf: Buffer) {
    const key = `report/${row.owner_id}/${new Date().toISOString().slice(0, 7)}/${row.id}.pdf`;
    const stored = await this.storage.putPrivateObject({
      objectKey: key,
      contentType: 'application/pdf',
      body: pdf,
      metadata: { reportId: row.id },
    });
    await this.db.query(
      'UPDATE generated_reports SET status=$2,object_key=$3,content_type=$4,size_bytes=$5,completed_at=now(),failure_code=NULL,updated_at=now() WHERE id=$1',
      [row.id, ReportStatus.Completed, key, stored.contentType, stored.sizeBytes],
    );
  }
  async markGenerating(id: string) {
    await this.db.query(
      'UPDATE generated_reports SET status=$2,failure_code=NULL,updated_at=now() WHERE id=$1 AND status<>$3',
      [id, ReportStatus.Generating, ReportStatus.Completed],
    );
  }
  async fail(id: string) {
    await this.db.query(
      'UPDATE generated_reports SET status=$2,failure_code=$3,updated_at=now() WHERE id=$1 AND status<>$4',
      [id, ReportStatus.Failed, 'GENERATION_FAILED', ReportStatus.Completed],
    );
  }
  private async assertScope(p: AuthPrincipal, d: CreateReportDto) {
    if (d.type === ReportType.OutbreakSummary) {
      if (!regionalRoles.has(p.role))
        throw new ForbiddenException('This report requires regional reporting permission.');
      return;
    }
    if ([UserRole.Admin, UserRole.SuperAdmin].includes(p.role)) return;
    if (p.role === UserRole.AgricultureExpert) {
      if (!d.resourceId || ![ReportType.Diagnosis, ReportType.ExpertReview].includes(d.type))
        throw new ForbiddenException('Experts may report only assigned cases.');
      const assigned = await this.db.query<unknown[]>(
        `SELECT 1 FROM crop_scans cs JOIN expert_reviews er ON er.scan_id=cs.id JOIN expert_assignments ea ON ea.review_id=er.id WHERE cs.id=$1 AND ea.expert_id=$2 AND ea.unassigned_at IS NULL`,
        [d.resourceId, p.userId],
      );
      if (!assigned[0]) throw new ForbiddenException('This case is not assigned to the expert.');
      return;
    }
    if (p.role !== UserRole.Farmer)
      throw new ForbiddenException('This role cannot generate resource reports.');
    if (!d.resourceId && d.type !== ReportType.WeeklyActionPlan)
      throw new ConflictException('resourceId is required for this report type.');
    if (!d.resourceId) return;
    const scan = [ReportType.Diagnosis, ReportType.ExpertReview].includes(d.type);
    const sql = scan
      ? `SELECT true ok FROM crop_scans cs WHERE cs.id=$1 AND cs.owner_id=$2`
      : `SELECT true ok FROM fields fi JOIN farms fa ON fa.id=fi.farm_id JOIN farmer_profiles fp ON fp.id=fa.farmer_id WHERE fi.id=$1 AND fp.user_id=$2 AND fi.deleted_at IS NULL AND fa.deleted_at IS NULL`;
    const rows = await this.db.query<Array<{ ok: boolean }>>(sql, [d.resourceId, p.userId]);
    if (!rows[0]) throw new ForbiddenException('Resource is not owned by the authenticated user.');
  }
  private signedUrlTtl(): number {
    return Math.min(this.config.get<number>('signedUrlTtlSeconds', 300), 900);
  }
  private public(r: ReportRow) {
    return {
      id: r.id,
      type: r.type,
      status: r.status,
      resourceId: r.resource_id,
      parameters: r.parameters,
      contentType: r.content_type,
      sizeBytes: r.size_bytes,
      createdAt: r.created_at,
      completedAt: r.completed_at,
      error: r.failure_code,
    };
  }
}

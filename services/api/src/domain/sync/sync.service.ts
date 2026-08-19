import {
  BadRequestException,
  ConflictException,
  ForbiddenException,
  Injectable,
} from '@nestjs/common';
import { InjectDataSource } from '@nestjs/typeorm';
import { createHash } from 'node:crypto';
import { DataSource } from 'typeorm';
import type { AuthPrincipal } from '../auth/auth.types';
import { CropScanService } from '../crop-scans/crop-scan.service';
import { NotificationService } from '../notifications/notification.service';
import { CommunityReportSource } from '../outbreaks/outbreak.enums';
import { OutbreakService } from '../outbreaks/outbreak.service';
import type { SyncMutationDto } from './dto/sync.dto';
import { MutationReceiptStatus, SyncMutationType } from './sync.enums';
interface Receipt {
  id: string;
  status: MutationReceiptStatus;
  requestHash: string;
  result: unknown;
  conflict: unknown;
  errorCode: string | null;
}
/* TypeORM raw query results are constrained by explicit SQL projections. */
/* eslint-disable @typescript-eslint/no-unsafe-assignment, @typescript-eslint/no-unsafe-member-access */
@Injectable()
export class SyncService {
  constructor(
    @InjectDataSource() private readonly db: DataSource,
    private readonly scans: CropScanService,
    private readonly tasks: NotificationService,
    private readonly outbreaks: OutbreakService,
  ) {}
  async apply(p: AuthPrincipal, mutations: SyncMutationDto[]): Promise<unknown> {
    const results = [];
    for (const m of mutations) {
      try {
        results.push(await this.one(p, m));
      } catch (error: unknown) {
        const response = error as {
          response?: { code?: string; message?: string };
          message?: string;
        };
        results.push({
          clientMutationId: m.clientMutationId,
          status: MutationReceiptStatus.Failed,
          retryable: !(error instanceof ConflictException),
          error: {
            code: response.response?.code ?? (error instanceof Error ? error.name : 'SYNC_FAILED'),
            message: response.response?.message ?? response.message ?? 'Mutation failed.',
          },
        });
      }
    }
    return { results };
  }
  async changes(userId: string, cursor?: string): Promise<unknown> {
    const sequence = this.decodeCursor(cursor);
    const rows = await this.db.query<
      Array<{
        sequence: string;
        resourceType: string;
        resourceId: string;
        operation: string;
        data: Record<string, unknown>;
        changedAt: Date;
      }>
    >(
      `SELECT sequence::text,"resource_type" "resourceType",resource_id "resourceId",operation,data,changed_at "changedAt" FROM sync_changes WHERE user_id=$1 AND sequence>$2 ORDER BY sequence LIMIT 200`,
      [userId, sequence],
    );
    const next = rows.length
      ? this.encodeCursor(rows[rows.length - 1]!.sequence)
      : this.encodeCursor(sequence);
    return {
      changes: rows.map((x) => ({
        resourceType: x.resourceType,
        resourceId: x.resourceId,
        operation: x.operation,
        data: x.data,
        changedAt: x.changedAt,
      })),
      cursor: next,
      hasMore: rows.length === 200,
    };
  }
  private async one(p: AuthPrincipal, m: SyncMutationDto): Promise<unknown> {
    await this.device(p.userId, m.deviceId);
    const hash = createHash('sha256')
      .update(this.canonical({ type: m.type, payload: m.payload }))
      .digest('hex');
    const inserted = await this.db.query<Array<{ id: string }>>(
      `INSERT INTO mutation_receipts(user_id,device_id,client_mutation_id,type,status,request_hash)VALUES($1,$2,$3,$4,'PROCESSING',$5)ON CONFLICT(user_id,device_id,client_mutation_id)DO NOTHING RETURNING id`,
      [p.userId, m.deviceId, m.clientMutationId, m.type, hash],
    );
    if (!inserted.length) {
      const receipt = (
        await this.db.query<Receipt[]>(
          `SELECT id,status,request_hash "requestHash",result,conflict,error_code "errorCode" FROM mutation_receipts WHERE user_id=$1 AND device_id=$2 AND client_mutation_id=$3`,
          [p.userId, m.deviceId, m.clientMutationId],
        )
      )[0]!;
      if (receipt.requestHash !== hash)
        throw new ConflictException({
          code: 'IDEMPOTENCY_KEY_REUSED',
          clientMutationId: m.clientMutationId,
          message: 'clientMutationId was already used with different mutation data.',
        });
      if (receipt.status !== MutationReceiptStatus.Failed) return this.receipt(m, receipt);
      await this.db.query(
        `UPDATE mutation_receipts SET status='PROCESSING',attempt_count=attempt_count+1,error_code=NULL,updated_at=now() WHERE id=$1`,
        [receipt.id],
      );
      inserted.push({ id: receipt.id });
    }
    const receiptId = inserted[0]!.id;
    try {
      const outcome = await this.execute(p, m);
      const status = outcome.conflict
        ? MutationReceiptStatus.Conflict
        : MutationReceiptStatus.Applied;
      await this.db.query(
        `UPDATE mutation_receipts SET status=$2,result=$3,conflict=$4,applied_at=$5,updated_at=now() WHERE id=$1`,
        [
          receiptId,
          status,
          JSON.stringify(outcome.result ?? null),
          JSON.stringify(outcome.conflict ?? null),
          status === MutationReceiptStatus.Applied ? new Date() : null,
        ],
      );
      return {
        clientMutationId: m.clientMutationId,
        status,
        result: outcome.result ?? null,
        conflict: outcome.conflict ?? null,
        duplicate: false,
      };
    } catch (e) {
      await this.db.query(
        `UPDATE mutation_receipts SET status='FAILED',error_code=$2,updated_at=now() WHERE id=$1`,
        [receiptId, e instanceof Error ? e.name : 'SYNC_MUTATION_FAILED'],
      );
      throw e;
    }
  }
  private async execute(
    p: AuthPrincipal,
    m: SyncMutationDto,
  ): Promise<{ result?: unknown; conflict?: unknown }> {
    const x = m.payload;
    switch (m.type) {
      case SyncMutationType.TaskCompletion:
        return this.completeTask(p.userId, x);
      case SyncMutationType.FieldInspection:
        return this.inspection(p.userId, x);
      case SyncMutationType.VoiceNoteMetadata:
        return this.voice(p.userId, x);
      case SyncMutationType.CropScanMetadata: {
        const fieldId = this.uuid(x.fieldId, 'fieldId', true);
        const result = await this.scans.create(p.userId, { fieldId });
        return { result };
      }
      case SyncMutationType.FollowUpAnswers: {
        const scanId = this.uuid(x.scanId, 'scanId');
        const answers = x.answers;
        if (!Array.isArray(answers)) throw new BadRequestException('answers must be an array.');
        if (!answers.length || answers.length > 8)
          throw new BadRequestException('Between one and eight answers are required.');
        const validatedAnswers = answers.map((answer, index) => {
          if (!answer || typeof answer !== 'object')
            throw new BadRequestException(`answers[${index}] is invalid.`);
          const value = answer as Record<string, unknown>;
          return {
            questionId: this.uuid(value.questionId, `answers[${index}].questionId`),
            answer: this.text(value.answer, `answers[${index}].answer`, 2000),
            expectedVersion: this.nonNegativeInteger(
              value.expectedVersion,
              `answers[${index}].expectedVersion`,
            ),
          };
        });
        return this.followUpAnswers(p.userId, scanId, validatedAnswers);
      }
      case SyncMutationType.CommunityReport: {
        const result = await this.outbreaks.create(p, {
          source: CommunityReportSource.FarmerManual,
          fieldId: this.uuid(x.fieldId, 'fieldId'),
          cropId: this.uuid(x.cropId, 'cropId', true),
          conditionFamily: this.text(x.conditionFamily, 'conditionFamily', 160, true),
        });
        return { result };
      }
    }
  }
  private async completeTask(
    userId: string,
    x: Record<string, unknown>,
  ): Promise<{ result?: unknown; conflict?: unknown }> {
    const id = this.uuid(x.taskId, 'taskId'),
      expected = this.integer(x.expectedVersion, 'expectedVersion');
    // DataSource.query() for an UPDATE...RETURNING (outside an existing transaction/manager)
    // returns a [rows, affectedCount] tuple rather than a flat rows array — unwrap it explicitly.
    const [rows] = await this.db.query<[Array<Record<string, unknown>>, number]>(
      `UPDATE farmer_tasks SET status='COMPLETED',completed_at=COALESCE(completed_at,now()),version=version+1,updated_at=now()WHERE id=$1 AND user_id=$2 AND version=$3 AND deleted_at IS NULL RETURNING id,status,version,completed_at "completedAt"`,
      [id, userId, expected],
    );
    if (rows[0]) {
      try {
        await this.db.query(
          `UPDATE farm_interventions SET status='COMPLETED',completed_at=now(),updated_at=now(),version=version+1 WHERE task_id=$1 AND status<>'COMPLETED'`,
          [id],
        );
      } catch {
        /* best-effort: the impact ledger must never block task sync */
      }
      return { result: rows[0] };
    }
    return this.conflict('TASK', id, userId, expected);
  }
  private async followUpAnswers(
    userId: string,
    scanId: string,
    answers: Array<{ questionId: string; answer: string; expectedVersion: number }>,
  ): Promise<{ result?: unknown; conflict?: unknown }> {
    return this.db.transaction(async (tx) => {
      await tx.query(`SELECT pg_advisory_xact_lock(hashtext($1))`, [`sync-follow-up:${scanId}`]);
      const scan = await tx.query(`SELECT 1 FROM crop_scans WHERE id=$1 AND owner_id=$2`, [
        scanId,
        userId,
      ]);
      if (!scan.length) throw new ForbiddenException('Crop scan was not found.');
      const current = await tx.query<
        Array<{
          questionId: string;
          id: string | null;
          answer: string | null;
          version: number | null;
        }>
      >(
        `SELECT q.id "questionId",a.id,a.answer_text answer,a.version FROM follow_up_questions q LEFT JOIN follow_up_answers a ON a.question_id=q.id WHERE q.scan_id=$1 AND q.id=ANY($2::uuid[])`,
        [scanId, answers.map((x) => x.questionId)],
      );
      if (current.length !== answers.length)
        throw new BadRequestException('One or more follow-up questions are outside this scan.');
      const conflicts = answers.flatMap((answer) => {
        const row = current.find((x) => x.questionId === answer.questionId)!;
        const serverVersion = row.version ?? 0;
        return serverVersion === answer.expectedVersion
          ? []
          : [
              {
                questionId: answer.questionId,
                expectedVersion: answer.expectedVersion,
                serverVersion,
                current: row.id ? { id: row.id, answer: row.answer, version: row.version } : null,
              },
            ];
      });
      if (conflicts.length)
        return {
          conflict: {
            code: 'VERSION_CONFLICT',
            resourceType: 'FOLLOW_UP_ANSWERS',
            resourceId: scanId,
            conflicts,
          },
        };
      const saved = [];
      for (const answer of answers) {
        const rows = await tx.query<Array<Record<string, unknown>>>(
          `INSERT INTO follow_up_answers(question_id,farmer_id,answer_text,answered_at)VALUES($1,$2,$3,now())ON CONFLICT(question_id)DO UPDATE SET answer_text=excluded.answer_text,answered_at=now(),updated_at=now(),version=follow_up_answers.version+1 RETURNING id,question_id "questionId",answer_text answer,answered_at "answeredAt",version`,
          [answer.questionId, userId, answer.answer],
        );
        saved.push(rows[0]);
      }
      return { result: { scanId, answers: saved } };
    });
  }
  private async inspection(
    userId: string,
    x: Record<string, unknown>,
  ): Promise<{ result?: unknown; conflict?: unknown }> {
    const fieldId = this.uuid(x.fieldId, 'fieldId');
    await this.field(userId, fieldId);
    const notes = this.text(x.notes, 'notes', 4000),
      observedAt = this.date(x.observedAt, 'observedAt');
    const mediaAssetIds = this.uuids(x.mediaAssetIds);
    if (mediaAssetIds.length) {
      const owned = await this.db.query<Array<{ count: number }>>(
        `SELECT count(*)::integer count FROM media_assets WHERE owner_id=$1 AND status='ready' AND purpose='field-inspection' AND id=ANY($2::uuid[])`,
        [userId, mediaAssetIds],
      );
      if (owned[0]?.count !== mediaAssetIds.length)
        throw new ForbiddenException('One or more inspection media assets are unavailable.');
    }
    const id = typeof x.id === 'string' ? this.uuid(x.id, 'id') : null;
    if (!id) {
      const r = await this.db.query<Array<Record<string, unknown>>>(
        `INSERT INTO field_inspections(user_id,field_id,notes,observed_at,media_asset_ids)VALUES($1,$2,$3,$4,$5)RETURNING id,field_id "fieldId",notes,observed_at "observedAt",version`,
        [userId, fieldId, notes, observedAt, mediaAssetIds],
      );
      return { result: r[0] };
    }
    const expected = this.integer(x.expectedVersion, 'expectedVersion');
    // DataSource.query() for an UPDATE...RETURNING (outside an existing transaction/manager)
    // returns a [rows, affectedCount] tuple rather than a flat rows array — unwrap it explicitly.
    const [r] = await this.db.query<[Array<Record<string, unknown>>, number]>(
      `UPDATE field_inspections SET notes=$4,observed_at=$5,media_asset_ids=$6,version=version+1,updated_at=now()WHERE id=$1 AND user_id=$2 AND version=$3 RETURNING id,field_id "fieldId",notes,observed_at "observedAt",version`,
      [id, userId, expected, notes, observedAt, mediaAssetIds],
    );
    if (r[0]) {
      return { result: r[0] };
    }
    return this.conflict('FIELD_INSPECTION', id, userId, expected);
  }
  private async voice(
    userId: string,
    x: Record<string, unknown>,
  ): Promise<{ result?: unknown; conflict?: unknown }> {
    const mediaId = this.uuid(x.mediaAssetId, 'mediaAssetId');
    const owned = await this.db.query(
      `SELECT 1 FROM media_assets WHERE id=$1 AND owner_id=$2 AND purpose='voice-note' AND status='ready'`,
      [mediaId, userId],
    );
    if (!owned.length) throw new ForbiddenException('Completed voice note media was not found.');
    const expected = this.nonNegativeInteger(x.expectedVersion, 'expectedVersion');
    const duration =
      x.durationSeconds === undefined ? null : this.integer(x.durationSeconds, 'durationSeconds');
    if (duration !== null && duration > 3600)
      throw new BadRequestException('durationSeconds must not exceed 3600.');
    const r = await this.db.query<Array<Record<string, unknown>>>(
      `INSERT INTO voice_note_metadata(user_id,media_asset_id,duration_seconds,language,recorded_at)SELECT $1,$2,$3,$4,$5 WHERE $6=0 ON CONFLICT(media_asset_id)DO UPDATE SET duration_seconds=excluded.duration_seconds,language=excluded.language,recorded_at=excluded.recorded_at,version=voice_note_metadata.version+1,updated_at=now()WHERE voice_note_metadata.user_id=$1 AND voice_note_metadata.version=$6 RETURNING id,media_asset_id "mediaAssetId",duration_seconds "durationSeconds",language,recorded_at "recordedAt",version`,
      [
        userId,
        mediaId,
        duration,
        this.text(x.language, 'language', 16, true),
        this.date(x.recordedAt, 'recordedAt'),
        expected,
      ],
    );
    if (r[0]) return { result: r[0] };
    const current = (
      await this.db.query<Array<Record<string, unknown>>>(
        `SELECT id,media_asset_id "mediaAssetId",duration_seconds "durationSeconds",language,recorded_at "recordedAt",version FROM voice_note_metadata WHERE media_asset_id=$1 AND user_id=$2`,
        [mediaId, userId],
      )
    )[0];
    return {
      conflict: {
        code: 'VERSION_CONFLICT',
        resourceType: 'VOICE_NOTE',
        resourceId: current?.id ?? mediaId,
        expectedVersion: expected,
        serverVersion: current?.version ?? null,
        current: current ?? null,
      },
    };
  }
  private async conflict(
    type: string,
    id: string,
    userId: string,
    expected: number,
  ): Promise<{ conflict: unknown }> {
    const table = type === 'TASK' ? 'farmer_tasks' : 'field_inspections';
    const r = (
      await this.db.query<Array<Record<string, unknown>>>(
        `SELECT * FROM ${table} WHERE id=$1 AND user_id=$2`,
        [id, userId],
      )
    )[0];
    if (!r) throw new ForbiddenException(`${type} was not found.`);
    return {
      conflict: {
        code: 'VERSION_CONFLICT',
        resourceType: type,
        resourceId: id,
        expectedVersion: expected,
        serverVersion: r.version,
        current: r,
      },
    };
  }
  private async device(userId: string, id: string): Promise<void> {
    const r = await this.db.query(
      `SELECT 1 FROM devices WHERE id=$1 AND user_id=$2 AND deleted_at IS NULL`,
      [id, userId],
    );
    if (!r.length) throw new ForbiddenException('Device is not registered to this user.');
  }
  private async field(userId: string, id: string): Promise<void> {
    const r = await this.db.query(
      `SELECT 1 FROM fields f JOIN farms fa ON fa.id=f.farm_id JOIN farmer_profiles fp ON fp.id=fa.farmer_id WHERE f.id=$1 AND fp.user_id=$2 AND f.deleted_at IS NULL`,
      [id, userId],
    );
    if (!r.length) throw new ForbiddenException('Field was not found.');
  }
  private receipt(m: SyncMutationDto, r: Receipt): unknown {
    return {
      clientMutationId: m.clientMutationId,
      status: r.status,
      result: r.result,
      conflict: r.conflict,
      errorCode: r.errorCode,
      duplicate: true,
    };
  }
  private uuid(x: unknown, n: string): string;
  private uuid(x: unknown, n: string, optional: true): string | undefined;
  private uuid(x: unknown, n: string, optional = false): string | undefined {
    if (optional && (x === undefined || x === null)) return undefined;
    if (
      typeof x !== 'string' ||
      !/^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(x)
    )
      throw new BadRequestException(`${n} must be a UUID v4.`);
    return x;
  }
  private text(x: unknown, n: string, max: number): string;
  private text(x: unknown, n: string, max: number, optional: true): string | undefined;
  private text(x: unknown, n: string, max: number, optional = false): string | undefined {
    if (optional && (x === undefined || x === null)) return undefined;
    if (typeof x !== 'string' || !x.trim() || x.length > max)
      throw new BadRequestException(`${n} is invalid.`);
    return x.trim();
  }
  private integer(x: unknown, n: string): number {
    if (!Number.isInteger(x) || Number(x) < 1)
      throw new BadRequestException(`${n} must be a positive integer.`);
    return Number(x);
  }
  private nonNegativeInteger(x: unknown, n: string): number {
    if (!Number.isInteger(x) || Number(x) < 0)
      throw new BadRequestException(`${n} must be a non-negative integer.`);
    return Number(x);
  }
  private date(x: unknown, n: string): Date {
    const d = new Date(typeof x === 'string' ? x : '');
    if (Number.isNaN(d.valueOf())) throw new BadRequestException(`${n} must be an ISO date.`);
    return d;
  }
  private uuids(x: unknown): string[] {
    if (x === undefined) return [];
    if (!Array.isArray(x) || x.length > 10)
      throw new BadRequestException('mediaAssetIds is invalid.');
    return x.map((v, i) => this.uuid(v, `mediaAssetIds[${i}]`));
  }
  private encodeCursor(x: string | number): string {
    return Buffer.from(String(x)).toString('base64url');
  }
  private decodeCursor(x?: string): string {
    if (!x) return '0';
    const decoded = Buffer.from(x, 'base64url').toString('utf8');
    if (!/^\d+$/.test(decoded)) throw new BadRequestException('Invalid sync cursor.');
    return decoded;
  }
  private canonical(value: unknown): string {
    if (Array.isArray(value)) return `[${value.map((x) => this.canonical(x)).join(',')}]`;
    if (value && typeof value === 'object')
      return `{${Object.entries(value as Record<string, unknown>)
        .sort(([a], [b]) => a.localeCompare(b))
        .map(([key, item]) => `${JSON.stringify(key)}:${this.canonical(item)}`)
        .join(',')}}`;
    return JSON.stringify(value) ?? 'null';
  }
}

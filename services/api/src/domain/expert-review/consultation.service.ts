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
import { MediaStatus } from '../media/media.enums';
import type { CreateConsultationDto, CreateConsultationMessageDto } from './dto/expert-review.dto';
import { ConsultationMessageType, ConsultationStatus } from './expert-review.enums';
@Injectable()
export class ConsultationService {
  constructor(@InjectDataSource() private readonly db: DataSource) {}
  async create(p: AuthPrincipal, d: CreateConsultationDto): Promise<unknown> {
    if (p.role !== UserRole.Farmer)
      throw new ForbiddenException('Only farmers can create consultations.');
    if (d.scanId) {
      const owned = await this.db.query<unknown[]>(
        `SELECT 1 FROM crop_scans WHERE id=$1 AND owner_id=$2`,
        [d.scanId, p.userId],
      );
      if (!owned.length) throw new NotFoundException('Crop scan was not found.');
    }
    if (d.expertId) await this.assertVerifiedExpert(d.expertId);
    const q = this.db.createQueryRunner();
    await q.connect();
    await q.startTransaction();
    try {
      const rows = (await q.query(
        `INSERT INTO consultations(farmer_id,expert_id,scan_id,subject,status)VALUES($1,$2,$3,$4,$5)RETURNING id`,
        [
          p.userId,
          d.expertId ?? null,
          d.scanId ?? null,
          d.subject,
          d.expertId ? ConsultationStatus.WaitingExpert : ConsultationStatus.Open,
        ],
      )) as Array<{ id: string }>;
      if (d.initialMessage)
        await q.query(
          `INSERT INTO consultation_messages(consultation_id,sender_id,type,text)VALUES($1,$2,'TEXT',$3)`,
          [rows[0]!.id, p.userId, d.initialMessage],
        );
      await q.commitTransaction();
      return this.get(p, rows[0]!.id);
    } catch (e) {
      await q.rollbackTransaction();
      throw e;
    } finally {
      await q.release();
    }
  }
  list(p: AuthPrincipal): Promise<unknown[]> {
    const [where, args] = this.scope(p);
    return this.db.query<unknown[]>(
      `SELECT c.*,fp.full_name "farmerName",ep.full_name "expertName",(SELECT text FROM consultation_messages m WHERE m.consultation_id=c.id ORDER BY m.created_at DESC LIMIT 1) "lastMessage" FROM consultations c LEFT JOIN farmer_profiles fp ON fp.user_id=c.farmer_id LEFT JOIN expert_profiles ep ON ep.user_id=c.expert_id WHERE ${where} ORDER BY c.updated_at DESC LIMIT 100`,
      args,
    );
  }
  async get(p: AuthPrincipal, id: string): Promise<unknown> {
    const [where, args] = this.scope(p, 1);
    const rows = await this.db.query<unknown[]>(
      `SELECT c.*,fp.full_name "farmerName",ep.full_name "expertName",COALESCE((SELECT jsonb_agg(jsonb_build_object('id',m.id,'senderId',m.sender_id,'type',m.type,'text',m.text,'mediaAssetId',m.media_asset_id,'createdAt',m.created_at)ORDER BY m.created_at)FROM consultation_messages m WHERE m.consultation_id=c.id),'[]')messages FROM consultations c LEFT JOIN farmer_profiles fp ON fp.user_id=c.farmer_id LEFT JOIN expert_profiles ep ON ep.user_id=c.expert_id WHERE c.id=$1 AND ${where} GROUP BY c.id,fp.full_name,ep.full_name`,
      [id, ...args],
    );
    if (!rows[0]) throw new NotFoundException('Consultation was not found.');
    return rows[0];
  }
  async message(p: AuthPrincipal, id: string, d: CreateConsultationMessageDto): Promise<unknown> {
    await this.get(p, id);
    this.validateMessage(d);
    if (d.mediaAssetId) await this.assertMedia(p.userId, d);
    const next =
      p.role === UserRole.Farmer
        ? ConsultationStatus.WaitingExpert
        : ConsultationStatus.WaitingFarmer;
    const q = this.db.createQueryRunner();
    await q.connect();
    await q.startTransaction();
    try {
      await q.query(
        `INSERT INTO consultation_messages(consultation_id,sender_id,type,text,media_asset_id)VALUES($1,$2,$3,$4,$5)`,
        [id, p.userId, d.type, d.text ?? null, d.mediaAssetId ?? null],
      );
      await q.query(
        `UPDATE consultations SET status=$2,updated_at=now(),version=version+1 WHERE id=$1 AND status<>'CLOSED'`,
        [id, next],
      );
      await q.commitTransaction();
      return this.get(p, id);
    } catch (e) {
      await q.rollbackTransaction();
      throw e;
    } finally {
      await q.release();
    }
  }
  private scope(p: AuthPrincipal, offset = 0): [string, unknown[]] {
    if (p.role === UserRole.Farmer) return [`c.farmer_id=$${offset + 1}`, [p.userId]];
    if (p.role === UserRole.AgricultureExpert) return [`c.expert_id=$${offset + 1}`, [p.userId]];
    if ([UserRole.Admin, UserRole.SuperAdmin].includes(p.role)) return ['true', []];
    throw new ForbiddenException();
  }
  private validateMessage(d: CreateConsultationMessageDto): void {
    if (d.type === ConsultationMessageType.Text && (!d.text || d.mediaAssetId))
      throw new BadRequestException('Text messages require text only.');
    if (d.type !== ConsultationMessageType.Text && (!d.mediaAssetId || d.text))
      throw new BadRequestException('Attachment messages require one media asset only.');
  }
  private async assertMedia(ownerId: string, d: CreateConsultationMessageDto): Promise<void> {
    const rows = await this.db.query<Array<{ content_type: string; status: MediaStatus }>>(
      `SELECT content_type,status FROM media_assets WHERE id=$1 AND owner_id=$2`,
      [d.mediaAssetId, ownerId],
    );
    const media = rows[0];
    if (!media || media.status !== MediaStatus.Ready)
      throw new BadRequestException('A completed media asset owned by the sender is required.');
    if (d.type === ConsultationMessageType.Image && !media.content_type.startsWith('image/'))
      throw new BadRequestException('An image attachment is required.');
    if (d.type === ConsultationMessageType.VoiceNote && !media.content_type.startsWith('audio/'))
      throw new BadRequestException('An audio attachment is required.');
  }
  private async assertVerifiedExpert(id: string): Promise<void> {
    const rows = await this.db.query<unknown[]>(
      `SELECT 1 FROM expert_profiles WHERE user_id=$1 AND verification_status='verified'`,
      [id],
    );
    if (!rows.length) throw new BadRequestException('Selected expert is not verified.');
  }
}

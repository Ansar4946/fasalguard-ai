import { Column, Entity, Index, JoinColumn, ManyToOne } from 'typeorm';
import { BaseEntity } from '../../infrastructure/database/entities/base.entity';
import { User } from '../identity/user.entity';
import { MediaPurpose, MediaStatus } from './media.enums';

@Entity({ name: 'media_assets' })
@Index('idx_media_assets_owner_status', ['ownerId', 'status'])
export class MediaAsset extends BaseEntity {
  @Column({ name: 'owner_id', type: 'uuid' }) ownerId!: string;
  @ManyToOne(() => User, { onDelete: 'RESTRICT' })
  @JoinColumn({ name: 'owner_id' })
  owner!: User;
  @Index('uq_media_assets_object_key', { unique: true })
  @Column({ name: 'object_key', type: 'varchar', length: 512 })
  objectKey!: string;
  @Column({ name: 'original_filename', type: 'varchar', length: 180 }) originalFilename!: string;
  @Column({ name: 'content_type', type: 'varchar', length: 120 }) contentType!: string;
  @Column({ name: 'size_bytes', type: 'bigint' }) sizeBytes!: string;
  @Column({ type: 'varchar', length: 128, nullable: true }) checksum!: string | null;
  @Column({ type: 'varchar', length: 40 }) purpose!: MediaPurpose;
  @Column({ type: 'varchar', length: 24, default: MediaStatus.Pending }) status!: MediaStatus;
  @Column({ type: 'jsonb', default: {} }) metadata!: Record<string, unknown>;
  @Column({ name: 'completed_at', type: 'timestamptz', nullable: true }) completedAt!: Date | null;
}

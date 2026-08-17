import { Column, Entity, Index, JoinColumn, ManyToOne } from 'typeorm';
import { BaseEntity } from '../../infrastructure/database/entities/base.entity';
import { Device } from './device.entity';
import { User } from './user.entity';
@Entity({ name: 'auth_sessions' })
export class AuthSession extends BaseEntity {
  @Column({ name: 'user_id', type: 'uuid' }) userId!: string;
  @ManyToOne(() => User, { onDelete: 'CASCADE' }) @JoinColumn({ name: 'user_id' }) user!: User;
  @Column({ name: 'device_id', type: 'uuid', nullable: true }) deviceId!: string | null;
  @ManyToOne(() => Device, { onDelete: 'SET NULL', nullable: true })
  @JoinColumn({ name: 'device_id' })
  device!: Device | null;
  @Index('uq_auth_sessions_refresh_hash', { unique: true })
  @Column({ name: 'refresh_token_hash', type: 'char', length: 64, select: false })
  refreshTokenHash!: string;
  @Index('idx_auth_sessions_family')
  @Column({ name: 'token_family', type: 'uuid' })
  tokenFamily!: string;
  @Column({ name: 'user_agent', type: 'varchar', length: 512, nullable: true }) userAgent!:
    string | null;
  @Column({ name: 'ip_address', type: 'inet', nullable: true }) ipAddress!: string | null;
  @Column({ name: 'last_used_at', type: 'timestamptz' }) lastUsedAt!: Date;
  @Column({ name: 'expires_at', type: 'timestamptz' }) expiresAt!: Date;
  @Column({ name: 'revoked_at', type: 'timestamptz', nullable: true }) revokedAt!: Date | null;
  @Column({ name: 'revoke_reason', type: 'varchar', length: 64, nullable: true }) revokeReason!:
    string | null;
  @Column({ name: 'replaced_by_session_id', type: 'uuid', nullable: true }) replacedBySessionId!:
    string | null;
}

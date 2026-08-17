import { Column, Entity, Index, JoinColumn, ManyToOne } from 'typeorm';
import { BaseEntity } from '../../infrastructure/database/entities/base.entity';
import { ConsentType } from './identity.enums';
import { User } from './user.entity';
@Entity({ name: 'consents' })
@Index('idx_consents_user_type', ['userId', 'type'])
export class Consent extends BaseEntity {
  @Column({ name: 'user_id', type: 'uuid' }) userId!: string;
  @ManyToOne(() => User, (u) => u.consents, { onDelete: 'CASCADE' })
  @JoinColumn({ name: 'user_id' })
  user!: User;
  @Column({ type: 'varchar', length: 64 }) type!: ConsentType;
  @Column({ name: 'policy_version', type: 'varchar', length: 32 }) policyVersion!: string;
  @Column({ type: 'boolean' }) granted!: boolean;
  @Column({ name: 'recorded_at', type: 'timestamptz' }) recordedAt!: Date;
  @Column({ name: 'revoked_at', type: 'timestamptz', nullable: true }) revokedAt!: Date | null;
}

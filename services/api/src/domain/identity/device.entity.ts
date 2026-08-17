import { Column, Entity, Index, JoinColumn, ManyToOne } from 'typeorm';
import { SoftDeletableEntity } from '../../infrastructure/database/entities/base.entity';
import { DevicePlatform } from './identity.enums';
import { User } from './user.entity';
@Entity({ name: 'devices' })
@Index('uq_devices_user_identifier_active', ['userId', 'deviceIdentifier'], {
  unique: true,
  where: 'deleted_at IS NULL',
})
export class Device extends SoftDeletableEntity {
  @Column({ name: 'user_id', type: 'uuid' }) userId!: string;
  @ManyToOne(() => User, (u) => u.devices, { onDelete: 'CASCADE' })
  @JoinColumn({ name: 'user_id' })
  user!: User;
  @Column({ name: 'device_identifier', type: 'varchar', length: 180 }) deviceIdentifier!: string;
  @Column({ type: 'varchar', length: 16 }) platform!: DevicePlatform;
  @Index('uq_devices_push_token_active', {
    unique: true,
    where: 'deleted_at IS NULL AND push_token IS NOT NULL',
  })
  @Column({ name: 'push_token', type: 'varchar', length: 512, nullable: true })
  pushToken!: string | null;
  @Column({ name: 'last_seen_at', type: 'timestamptz', nullable: true }) lastSeenAt!: Date | null;
}

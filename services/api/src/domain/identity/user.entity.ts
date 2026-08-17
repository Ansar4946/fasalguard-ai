import { Column, Entity, Index, OneToMany, OneToOne } from 'typeorm';
import { SoftDeletableEntity } from '../../infrastructure/database/entities/base.entity';
import { UserRole, UserStatus } from './identity.enums';
import { FarmerProfile } from './farmer-profile.entity';
import { ExpertProfile } from './expert-profile.entity';
import { Consent } from './consent.entity';
import { Device } from './device.entity';
@Entity({ name: 'users' })
export class User extends SoftDeletableEntity {
  @Index('uq_users_email_active', { unique: true, where: 'deleted_at IS NULL' })
  @Column({ type: 'varchar', length: 320, nullable: true })
  email!: string | null;
  @Index('uq_users_phone_active', { unique: true, where: 'deleted_at IS NULL' })
  @Column({ type: 'varchar', length: 32, nullable: true })
  phone!: string | null;
  @Column({ name: 'password_hash', type: 'varchar', length: 255, nullable: true, select: false })
  passwordHash!: string | null;
  @Column({ type: 'varchar', length: 24 }) role!: UserRole;
  @Column({ type: 'varchar', length: 24, default: UserStatus.Pending }) status!: UserStatus;
  @Column({ name: 'last_login_at', type: 'timestamptz', nullable: true }) lastLoginAt!: Date | null;
  @OneToOne(() => FarmerProfile, (p) => p.user) farmerProfile?: FarmerProfile;
  @OneToOne(() => ExpertProfile, (p) => p.user) expertProfile?: ExpertProfile;
  @OneToMany(() => Consent, (c) => c.user) consents!: Consent[];
  @OneToMany(() => Device, (d) => d.user) devices!: Device[];
}

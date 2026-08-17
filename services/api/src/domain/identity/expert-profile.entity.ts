import { Column, Entity, JoinColumn, OneToOne } from 'typeorm';
import { BaseEntity } from '../../infrastructure/database/entities/base.entity';
import { User } from './user.entity';
import { ExpertVerificationStatus } from './identity.enums';
@Entity({ name: 'expert_profiles' })
export class ExpertProfile extends BaseEntity {
  @Column({ name: 'user_id', type: 'uuid', unique: true }) userId!: string;
  @OneToOne(() => User, (u) => u.expertProfile, { onDelete: 'CASCADE' })
  @JoinColumn({ name: 'user_id' })
  user!: User;
  @Column({ name: 'full_name', type: 'varchar', length: 160 }) fullName!: string;
  @Column({ type: 'varchar', length: 160 }) specialization!: string;
  @Column({ name: 'license_number', type: 'varchar', length: 120, nullable: true }) licenseNumber!:
    string | null;
  @Column({
    name: 'verification_status',
    type: 'varchar',
    length: 24,
    default: ExpertVerificationStatus.Pending,
  })
  verificationStatus!: ExpertVerificationStatus;
}

import { Column, Entity, JoinColumn, OneToMany, OneToOne } from 'typeorm';
import { BaseEntity } from '../../infrastructure/database/entities/base.entity';
import { User } from './user.entity';
import { Farm } from '../farms/farm.entity';
@Entity({ name: 'farmer_profiles' })
export class FarmerProfile extends BaseEntity {
  @Column({ name: 'user_id', type: 'uuid', unique: true }) userId!: string;
  @OneToOne(() => User, (u) => u.farmerProfile, { onDelete: 'CASCADE' })
  @JoinColumn({ name: 'user_id' })
  user!: User;
  @Column({ name: 'full_name', type: 'varchar', length: 160 }) fullName!: string;
  @Column({ name: 'preferred_language', type: 'varchar', length: 16, default: 'en' })
  preferredLanguage!: string;
  @Column({ type: 'varchar', length: 120, nullable: true }) province!: string | null;
  @Column({ type: 'varchar', length: 120, nullable: true }) district!: string | null;
  @OneToMany(() => Farm, (f) => f.farmer) farms!: Farm[];
}

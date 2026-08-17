import { Column, Entity, Index, OneToMany } from 'typeorm';
import { BaseEntity } from '../../infrastructure/database/entities/base.entity';
import { CropVariety } from './crop-variety.entity';
@Entity({ name: 'crops' })
export class Crop extends BaseEntity {
  @Index('uq_crops_slug', { unique: true }) @Column({ type: 'varchar', length: 80 }) slug!: string;
  @Column({ type: 'varchar', length: 120 }) name!: string;
  @Column({ name: 'scientific_name', type: 'varchar', length: 160, nullable: true })
  scientificName!: string | null;
  @Column({ name: 'is_active', type: 'boolean', default: true }) isActive!: boolean;
  @OneToMany(() => CropVariety, (v) => v.crop) varieties!: CropVariety[];
}

import { Column, Entity, Index, JoinColumn, ManyToOne, OneToMany } from 'typeorm';
import { BaseEntity } from '../../infrastructure/database/entities/base.entity';
import { Crop } from './crop.entity';
import { CropCycle } from '../farms/crop-cycle.entity';
@Entity({ name: 'crop_varieties' })
@Index('uq_crop_varieties_crop_name', ['cropId', 'name'], { unique: true })
export class CropVariety extends BaseEntity {
  @Column({ name: 'crop_id', type: 'uuid' }) cropId!: string;
  @ManyToOne(() => Crop, (c) => c.varieties, { onDelete: 'RESTRICT' })
  @JoinColumn({ name: 'crop_id' })
  crop!: Crop;
  @Column({ type: 'varchar', length: 160 }) name!: string;
  @Column({ type: 'varchar', length: 80, nullable: true }) code!: string | null;
  @Column({ name: 'is_active', type: 'boolean', default: true }) isActive!: boolean;
  @OneToMany(() => CropCycle, (c) => c.variety) cropCycles!: CropCycle[];
}

import { Column, Entity, Index, JoinColumn, ManyToOne } from 'typeorm';
import { SoftDeletableEntity } from '../../infrastructure/database/entities/base.entity';
import { Crop } from '../crops/crop.entity';
import { CropVariety } from '../crops/crop-variety.entity';
import { Field } from './field.entity';
import { CropCycleStatus } from './farm.enums';
@Entity({ name: 'crop_cycles' })
@Index('idx_crop_cycles_field_status', ['fieldId', 'status'])
export class CropCycle extends SoftDeletableEntity {
  @Column({ name: 'field_id', type: 'uuid' }) fieldId!: string;
  @ManyToOne(() => Field, (f) => f.cropCycles, { onDelete: 'RESTRICT' })
  @JoinColumn({ name: 'field_id' })
  field!: Field;
  @Column({ name: 'crop_id', type: 'uuid' }) cropId!: string;
  @ManyToOne(() => Crop, { onDelete: 'RESTRICT' }) @JoinColumn({ name: 'crop_id' }) crop!: Crop;
  @Column({ name: 'crop_variety_id', type: 'uuid', nullable: true }) cropVarietyId!: string | null;
  @ManyToOne(() => CropVariety, (v) => v.cropCycles, { onDelete: 'RESTRICT', nullable: true })
  @JoinColumn({ name: 'crop_variety_id' })
  variety!: CropVariety | null;
  @Column({ type: 'varchar', length: 24, default: CropCycleStatus.Planned })
  status!: CropCycleStatus;
  @Column({ name: 'sowing_date', type: 'date', nullable: true }) sowingDate!: string | null;
  @Column({ name: 'expected_harvest_date', type: 'date', nullable: true }) expectedHarvestDate!:
    string | null;
  @Column({ name: 'actual_harvest_date', type: 'date', nullable: true }) actualHarvestDate!:
    string | null;
  @Column({ name: 'growth_stage', type: 'varchar', length: 80, nullable: true }) growthStage!:
    string | null;
}

import type { Point, Polygon } from 'geojson';
import { Column, Entity, Index, JoinColumn, ManyToOne, OneToMany } from 'typeorm';
import { SoftDeletableEntity } from '../../infrastructure/database/entities/base.entity';
import { Farm } from './farm.entity';
import { FieldStatus } from './farm.enums';
import { CropCycle } from './crop-cycle.entity';
@Entity({ name: 'fields' })
@Index('uq_fields_farm_name_active', ['farmId', 'name'], {
  unique: true,
  where: 'deleted_at IS NULL',
})
export class Field extends SoftDeletableEntity {
  @Column({ name: 'farm_id', type: 'uuid' }) farmId!: string;
  @ManyToOne(() => Farm, (f) => f.fields, { onDelete: 'RESTRICT' })
  @JoinColumn({ name: 'farm_id' })
  farm!: Farm;
  @Column({ type: 'varchar', length: 160 }) name!: string;
  @Column({ type: 'varchar', length: 24, default: FieldStatus.Active }) status!: FieldStatus;
  @Index('idx_fields_boundary_gist', { spatial: true })
  @Column({ type: 'geometry', spatialFeatureType: 'Polygon', srid: 4326 })
  boundary!: Polygon;
  @Index('idx_fields_centroid_gist', { spatial: true })
  @Column({ type: 'geometry', spatialFeatureType: 'Point', srid: 4326 })
  centroid!: Point;
  @Column({ name: 'area_hectares', type: 'double precision' }) areaHectares!: number;
  @Column({ name: 'last_satellite_check_at', type: 'timestamptz', nullable: true })
  lastSatelliteCheckAt!: Date | null;
  @Column({ name: 'last_successful_capture_at', type: 'timestamptz', nullable: true })
  lastSuccessfulCaptureAt!: Date | null;
  @Column({ name: 'next_satellite_check_at', type: 'timestamptz' }) nextSatelliteCheckAt!: Date;
  @Column({ name: 'satellite_check_failure_count', type: 'integer', default: 0 })
  satelliteCheckFailureCount!: number;
  @OneToMany(() => CropCycle, (c) => c.field) cropCycles!: CropCycle[];
}

import type { Point, Polygon } from 'geojson';
import { Column, Entity, Index, JoinColumn, ManyToOne, OneToMany } from 'typeorm';
import { SoftDeletableEntity } from '../../infrastructure/database/entities/base.entity';
import { FarmerProfile } from '../identity/farmer-profile.entity';
import { FarmStatus } from './farm.enums';
import { Field } from './field.entity';
@Entity({ name: 'farms' })
export class Farm extends SoftDeletableEntity {
  @Column({ name: 'farmer_id', type: 'uuid' }) farmerId!: string;
  @ManyToOne(() => FarmerProfile, (p) => p.farms, { onDelete: 'RESTRICT' })
  @JoinColumn({ name: 'farmer_id' })
  farmer!: FarmerProfile;
  @Column({ type: 'varchar', length: 160 }) name!: string;
  @Column({ type: 'varchar', length: 120, nullable: true }) province!: string | null;
  @Column({ type: 'varchar', length: 120, nullable: true }) district!: string | null;
  @Column({ type: 'varchar', length: 120, nullable: true }) tehsil!: string | null;
  @Column({ name: 'soil_type', type: 'varchar', length: 120, nullable: true }) soilType!:
    string | null;
  @Column({ name: 'irrigation_type', type: 'varchar', length: 120, nullable: true })
  irrigationType!: string | null;
  @Column({ name: 'water_source', type: 'varchar', length: 120, nullable: true }) waterSource!:
    string | null;
  @Column({ type: 'varchar', length: 24, default: FarmStatus.Active }) status!: FarmStatus;
  @Index('idx_farms_boundary_gist', { spatial: true })
  @Column({ type: 'geometry', spatialFeatureType: 'Polygon', srid: 4326 })
  boundary!: Polygon;
  @Index('idx_farms_centroid_gist', { spatial: true })
  @Column({ type: 'geometry', spatialFeatureType: 'Point', srid: 4326 })
  centroid!: Point;
  @Column({ name: 'area_hectares', type: 'double precision' }) areaHectares!: number;
  @OneToMany(() => Field, (f) => f.farm) fields!: Field[];
}

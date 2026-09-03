import { Column, Entity, Index } from 'typeorm';
import { BaseEntity } from '../../infrastructure/database/entities/base.entity';

@Entity({ name: 'mandi_prices' })
@Index('uq_mandi_prices_observation', ['cropName', 'marketName', 'priceDate', 'source'], {
  unique: true,
})
@Index('idx_mandi_prices_crop_date', ['cropName', 'priceDate'])
@Index('idx_mandi_prices_market_date', ['marketName', 'priceDate'])
export class MandiPrice extends BaseEntity {
  @Column({ name: 'crop_name', type: 'varchar', length: 120 }) cropName!: string;
  @Column({ name: 'market_name', type: 'varchar', length: 160 }) marketName!: string;
  @Column({ type: 'varchar', length: 120 }) district!: string;
  @Column({ type: 'varchar', length: 80, default: 'Punjab' }) province!: string;
  @Column({ name: 'minimum_price', type: 'integer' }) minimumPrice!: number;
  @Column({ name: 'maximum_price', type: 'integer' }) maximumPrice!: number;
  @Column({ name: 'average_price', type: 'integer' }) averagePrice!: number;
  @Column({ type: 'integer', default: 100 }) quantity!: number;
  @Column({ type: 'varchar', length: 16 }) unit!: string;
  @Column({ type: 'varchar', length: 32 }) source!: string;
  @Column({ name: 'source_identifier', type: 'varchar', length: 255 }) sourceIdentifier!: string;
  @Column({ name: 'source_url', type: 'varchar', length: 500 }) sourceUrl!: string;
  @Column({ name: 'price_date', type: 'date' }) priceDate!: string;
}

import { Column, Entity, Index, PrimaryColumn } from 'typeorm';
import { BaseEntity } from '../../infrastructure/database/entities/base.entity';

@Entity({ name: 'pilot_leads' })
@Index('idx_pilot_leads_status_created', ['status', 'createdAt'])
export class PilotLead extends BaseEntity {
  @Column({ type: 'varchar', length: 160 }) name!: string;
  @Column({ type: 'varchar', length: 320 }) email!: string;
  @Column({ type: 'varchar', length: 24, nullable: true }) phone!: string | null;
  @Column({ type: 'varchar', length: 80 }) country!: string;
  @Column({ name: 'farm_size_acres', type: 'numeric', precision: 10, scale: 2, nullable: true })
  farmSizeAcres!: string | null;
  @Column({ name: 'main_crop', type: 'varchar', length: 80 }) mainCrop!: string;
  @Column({ name: 'farm_count', type: 'integer', nullable: true }) farmCount!: number | null;
  @Column({ name: 'acquisition_source', type: 'varchar', length: 24, default: 'DIRECT' })
  acquisitionSource!: string;
  @Column({ type: 'varchar', length: 16, default: 'NEW' }) status!: string;
}

@Entity({ name: 'landing_page_views' })
export class LandingPageView {
  @PrimaryColumn({ type: 'uuid' }) id!: string;
  @Column({ name: 'viewed_on', type: 'date' }) viewedOn!: string;
  @Column({ type: 'integer', default: 0 }) count!: number;
  @Column({ name: 'updated_at', type: 'timestamptz' }) updatedAt!: Date;
}

@Entity({ name: 'lifecycle_email_log' })
@Index('idx_lifecycle_email_log_user_type_sent', ['userId', 'emailType', 'sentAt'])
export class LifecycleEmailLog {
  @PrimaryColumn({ type: 'uuid' }) id!: string;
  @Column({ name: 'user_id', type: 'uuid' }) userId!: string;
  @Column({ name: 'email_type', type: 'varchar', length: 40 }) emailType!: string;
  @Column({ name: 'sent_at', type: 'timestamptz' }) sentAt!: Date;
}

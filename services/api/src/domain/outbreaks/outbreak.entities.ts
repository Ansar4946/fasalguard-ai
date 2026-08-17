import type { Point, Polygon } from 'geojson';
import { Column, Entity, Index } from 'typeorm';
import { BaseEntity } from '../../infrastructure/database/entities/base.entity';
import {
  CommunityReportSource,
  CommunityVerificationAnswer,
  OutbreakClusterStatus,
} from './outbreak.enums';
@Entity({ name: 'outbreak_settings' })
export class OutbreakSetting extends BaseEntity {
  @Column({ name: 'distance_radius_meters', type: 'integer' }) distanceRadiusMeters!: number;
  @Column({ name: 'time_window_hours', type: 'integer' }) timeWindowHours!: number;
  @Column({ name: 'minimum_report_count', type: 'integer' }) minimumReportCount!: number;
  @Column({ name: 'expert_confirmation_required', type: 'boolean' })
  expertConfirmationRequired!: boolean;
  @Column({ name: 'public_grid_degrees', type: 'double precision' }) publicGridDegrees!: number;
  @Column({ name: 'validation_status', type: 'varchar', length: 32 }) validationStatus!: string;
  @Column({ type: 'boolean', default: true }) active!: boolean;
}
@Entity({ name: 'community_reports' })
@Index('idx_community_report_location_gist', ['privateLocation'], { spatial: true })
export class CommunityReport extends BaseEntity {
  @Column({ name: 'reporter_id', type: 'uuid' }) reporterId!: string;
  @Column({ name: 'field_id', type: 'uuid', nullable: true }) fieldId!: string | null;
  @Column({ name: 'scan_id', type: 'uuid', nullable: true }) scanId!: string | null;
  @Column({ type: 'varchar', length: 32 }) source!: CommunityReportSource;
  @Column({ name: 'crop_id', type: 'uuid' }) cropId!: string;
  @Column({ name: 'condition_family', type: 'varchar', length: 160 }) conditionFamily!: string;
  @Column({
    name: 'private_location',
    type: 'geometry',
    spatialFeatureType: 'Point',
    srid: 4326,
    select: false,
  })
  privateLocation!: Point;
  @Column({ name: 'public_area', type: 'geometry', spatialFeatureType: 'Polygon', srid: 4326 })
  publicArea!: Polygon;
  @Column({ name: 'expert_confirmed', type: 'boolean', default: false }) expertConfirmed!: boolean;
  @Column({ name: 'reported_at', type: 'timestamptz' }) reportedAt!: Date;
  @Column({ name: 'abuse_status', type: 'varchar', length: 24, default: 'ACCEPTED' })
  abuseStatus!: string;
}
@Entity({ name: 'community_verifications' })
@Index('uq_community_verification_vote', ['reportId', 'verifierId'], { unique: true })
export class CommunityVerification extends BaseEntity {
  @Column({ name: 'report_id', type: 'uuid' }) reportId!: string;
  @Column({ name: 'verifier_id', type: 'uuid' }) verifierId!: string;
  @Column({ type: 'varchar', length: 24 }) answer!: CommunityVerificationAnswer;
  @Column({ name: 'media_asset_id', type: 'uuid', nullable: true }) mediaAssetId!: string | null;
}
@Entity({ name: 'outbreak_clusters' })
@Index('idx_outbreak_cluster_area_gist', ['privateCentroid'], { spatial: true })
export class OutbreakCluster extends BaseEntity {
  @Column({ name: 'crop_id', type: 'uuid' }) cropId!: string;
  @Column({ name: 'condition_family', type: 'varchar', length: 160 }) conditionFamily!: string;
  @Column({ type: 'varchar', length: 24 }) status!: OutbreakClusterStatus;
  @Column({
    name: 'private_centroid',
    type: 'geometry',
    spatialFeatureType: 'Point',
    srid: 4326,
    select: false,
  })
  privateCentroid!: Point;
  @Column({ name: 'public_area', type: 'geometry', spatialFeatureType: 'Polygon', srid: 4326 })
  publicArea!: Polygon;
  @Column({ name: 'first_reported_at', type: 'timestamptz' }) firstReportedAt!: Date;
  @Column({ name: 'last_reported_at', type: 'timestamptz' }) lastReportedAt!: Date;
  @Column({ name: 'settings_id', type: 'uuid' }) settingsId!: string;
}
@Entity({ name: 'outbreak_members' })
@Index('uq_outbreak_member', ['clusterId', 'reportId'], { unique: true })
export class OutbreakMember extends BaseEntity {
  @Column({ name: 'cluster_id', type: 'uuid' }) clusterId!: string;
  @Column({ name: 'report_id', type: 'uuid' }) reportId!: string;
}
@Entity({ name: 'regional_advisories' })
export class RegionalAdvisory extends BaseEntity {
  @Column({ name: 'cluster_id', type: 'uuid' }) clusterId!: string;
  @Column({ type: 'varchar', length: 220 }) title!: string;
  @Column({ type: 'text' }) message!: string;
  @Column({ type: 'varchar', length: 16, default: 'en' }) language!: string;
  @Column({ name: 'published_at', type: 'timestamptz', nullable: true }) publishedAt!: Date | null;
  @Column({ name: 'published_by', type: 'uuid', nullable: true }) publishedBy!: string | null;
}

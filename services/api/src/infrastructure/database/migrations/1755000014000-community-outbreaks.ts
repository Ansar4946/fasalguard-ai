import type { MigrationInterface, QueryRunner } from 'typeorm';
export class CommunityOutbreaks1755000014000 implements MigrationInterface {
  name = 'CommunityOutbreaks1755000014000';
  async up(q: QueryRunner): Promise<void> {
    await q.query(
      `CREATE TABLE outbreak_settings(id uuid PRIMARY KEY DEFAULT gen_random_uuid(),distance_radius_meters integer NOT NULL CHECK(distance_radius_meters BETWEEN 100 AND 100000),time_window_hours integer NOT NULL CHECK(time_window_hours BETWEEN 1 AND 2160),minimum_report_count integer NOT NULL CHECK(minimum_report_count BETWEEN 2 AND 1000),expert_confirmation_required boolean NOT NULL,public_grid_degrees double precision NOT NULL CHECK(public_grid_degrees BETWEEN 0.01 AND 2),validation_status varchar(32) NOT NULL,active boolean NOT NULL DEFAULT true,created_at timestamptz NOT NULL DEFAULT now(),updated_at timestamptz NOT NULL DEFAULT now(),version integer NOT NULL DEFAULT 1); CREATE UNIQUE INDEX uq_outbreak_settings_active ON outbreak_settings(active) WHERE active=true`,
    );
    await q.query(
      `INSERT INTO outbreak_settings(distance_radius_meters,time_window_hours,minimum_report_count,expert_confirmation_required,public_grid_degrees,validation_status)VALUES(10000,168,3,false,0.05,'DEMO_CONFIGURABLE')`,
    );
    await q.query(
      `CREATE TABLE community_reports(id uuid PRIMARY KEY DEFAULT gen_random_uuid(),reporter_id uuid NOT NULL REFERENCES users(id) ON DELETE RESTRICT,field_id uuid REFERENCES fields(id) ON DELETE SET NULL,scan_id uuid REFERENCES crop_scans(id) ON DELETE SET NULL,source varchar(32) NOT NULL,crop_id uuid NOT NULL REFERENCES crops(id) ON DELETE RESTRICT,condition_family varchar(160) NOT NULL,private_location geometry(Point,4326) NOT NULL,public_area geometry(Polygon,4326) NOT NULL,expert_confirmed boolean NOT NULL DEFAULT false,reported_at timestamptz NOT NULL DEFAULT now(),abuse_status varchar(24) NOT NULL DEFAULT 'ACCEPTED',created_at timestamptz NOT NULL DEFAULT now(),updated_at timestamptz NOT NULL DEFAULT now(),version integer NOT NULL DEFAULT 1,CONSTRAINT ck_community_source CHECK(source IN('CROP_SCAN','FARMER_MANUAL','EXPERT_CONFIRMED')),CONSTRAINT ck_community_abuse CHECK(abuse_status IN('ACCEPTED','FLAGGED','REJECTED'))); CREATE INDEX idx_community_report_private_gist ON community_reports USING gist(private_location); CREATE INDEX idx_community_report_match ON community_reports(crop_id,condition_family,reported_at DESC); CREATE UNIQUE INDEX uq_community_scan_report ON community_reports(scan_id) WHERE scan_id IS NOT NULL`,
    );
    await q.query(
      `CREATE TABLE community_verifications(id uuid PRIMARY KEY DEFAULT gen_random_uuid(),report_id uuid NOT NULL REFERENCES community_reports(id) ON DELETE CASCADE,verifier_id uuid NOT NULL REFERENCES users(id) ON DELETE RESTRICT,answer varchar(24) NOT NULL,media_asset_id uuid REFERENCES media_assets(id) ON DELETE RESTRICT,created_at timestamptz NOT NULL DEFAULT now(),updated_at timestamptz NOT NULL DEFAULT now(),version integer NOT NULL DEFAULT 1,CONSTRAINT uq_community_verification_vote UNIQUE(report_id,verifier_id),CONSTRAINT ck_community_answer CHECK(answer IN('YES','NO','NOT_SURE','PHOTO_SUBMITTED')),CONSTRAINT ck_verification_photo CHECK((answer='PHOTO_SUBMITTED' AND media_asset_id IS NOT NULL) OR (answer<>'PHOTO_SUBMITTED' AND media_asset_id IS NULL)))`,
    );
    await q.query(
      `CREATE TABLE outbreak_clusters(id uuid PRIMARY KEY DEFAULT gen_random_uuid(),crop_id uuid NOT NULL REFERENCES crops(id) ON DELETE RESTRICT,condition_family varchar(160) NOT NULL,status varchar(24) NOT NULL,private_centroid geometry(Point,4326) NOT NULL,public_area geometry(Polygon,4326) NOT NULL,first_reported_at timestamptz NOT NULL,last_reported_at timestamptz NOT NULL,settings_id uuid NOT NULL REFERENCES outbreak_settings(id) ON DELETE RESTRICT,created_at timestamptz NOT NULL DEFAULT now(),updated_at timestamptz NOT NULL DEFAULT now(),version integer NOT NULL DEFAULT 1,CONSTRAINT ck_outbreak_status CHECK(status IN('MONITORING','SUSPECTED','EXPERT_REVIEW','CONFIRMED','DECLINING','RESOLVED'))); CREATE INDEX idx_outbreak_cluster_private_gist ON outbreak_clusters USING gist(private_centroid); CREATE INDEX idx_outbreak_cluster_match ON outbreak_clusters(crop_id,condition_family,status)`,
    );
    await q.query(
      `CREATE TABLE outbreak_members(id uuid PRIMARY KEY DEFAULT gen_random_uuid(),cluster_id uuid NOT NULL REFERENCES outbreak_clusters(id) ON DELETE CASCADE,report_id uuid NOT NULL REFERENCES community_reports(id) ON DELETE RESTRICT,created_at timestamptz NOT NULL DEFAULT now(),updated_at timestamptz NOT NULL DEFAULT now(),version integer NOT NULL DEFAULT 1,CONSTRAINT uq_outbreak_member UNIQUE(cluster_id,report_id))`,
    );
    await q.query(
      `CREATE TABLE regional_advisories(id uuid PRIMARY KEY DEFAULT gen_random_uuid(),cluster_id uuid NOT NULL REFERENCES outbreak_clusters(id) ON DELETE CASCADE,title varchar(220) NOT NULL,message text NOT NULL,language varchar(16) NOT NULL DEFAULT 'en',published_at timestamptz,published_by uuid REFERENCES users(id) ON DELETE SET NULL,created_at timestamptz NOT NULL DEFAULT now(),updated_at timestamptz NOT NULL DEFAULT now(),version integer NOT NULL DEFAULT 1)`,
    );
  }
  async down(q: QueryRunner): Promise<void> {
    await q.query(
      `DROP TABLE IF EXISTS regional_advisories,outbreak_members,outbreak_clusters,community_verifications,community_reports,outbreak_settings CASCADE`,
    );
  }
}

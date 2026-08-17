import type { MigrationInterface, QueryRunner } from 'typeorm';
export class InitialGeospatialSchema1755000000000 implements MigrationInterface {
  name = 'InitialGeospatialSchema1755000000000';
  async up(q: QueryRunner): Promise<void> {
    await q.query('CREATE EXTENSION IF NOT EXISTS postgis');
    await q.query(
      `CREATE TABLE users (id uuid PRIMARY KEY DEFAULT gen_random_uuid(), email varchar(320), phone varchar(32), password_hash varchar(255), role varchar(24) NOT NULL, status varchar(24) NOT NULL DEFAULT 'pending', last_login_at timestamptz, created_at timestamptz NOT NULL DEFAULT now(), updated_at timestamptz NOT NULL DEFAULT now(), deleted_at timestamptz, version integer NOT NULL DEFAULT 1, CONSTRAINT ck_users_contact CHECK (email IS NOT NULL OR phone IS NOT NULL))`,
    );
    await q.query(
      `CREATE UNIQUE INDEX uq_users_email_active ON users (lower(email)) WHERE deleted_at IS NULL AND email IS NOT NULL`,
    );
    await q.query(
      `CREATE UNIQUE INDEX uq_users_phone_active ON users (phone) WHERE deleted_at IS NULL AND phone IS NOT NULL`,
    );
    await q.query(
      `CREATE TABLE farmer_profiles (id uuid PRIMARY KEY DEFAULT gen_random_uuid(), user_id uuid NOT NULL UNIQUE REFERENCES users(id) ON DELETE CASCADE, full_name varchar(160) NOT NULL, preferred_language varchar(16) NOT NULL DEFAULT 'en', province varchar(120), district varchar(120), created_at timestamptz NOT NULL DEFAULT now(), updated_at timestamptz NOT NULL DEFAULT now(), version integer NOT NULL DEFAULT 1)`,
    );
    await q.query(
      `CREATE TABLE expert_profiles (id uuid PRIMARY KEY DEFAULT gen_random_uuid(), user_id uuid NOT NULL UNIQUE REFERENCES users(id) ON DELETE CASCADE, full_name varchar(160) NOT NULL, specialization varchar(160) NOT NULL, license_number varchar(120), verification_status varchar(24) NOT NULL DEFAULT 'pending', created_at timestamptz NOT NULL DEFAULT now(), updated_at timestamptz NOT NULL DEFAULT now(), version integer NOT NULL DEFAULT 1)`,
    );
    await q.query(
      `CREATE TABLE consents (id uuid PRIMARY KEY DEFAULT gen_random_uuid(), user_id uuid NOT NULL REFERENCES users(id) ON DELETE CASCADE, type varchar(64) NOT NULL, policy_version varchar(32) NOT NULL, granted boolean NOT NULL, recorded_at timestamptz NOT NULL, revoked_at timestamptz, created_at timestamptz NOT NULL DEFAULT now(), updated_at timestamptz NOT NULL DEFAULT now(), version integer NOT NULL DEFAULT 1)`,
    );
    await q.query(`CREATE INDEX idx_consents_user_type ON consents(user_id,type)`);
    await q.query(
      `CREATE TABLE devices (id uuid PRIMARY KEY DEFAULT gen_random_uuid(), user_id uuid NOT NULL REFERENCES users(id) ON DELETE CASCADE, device_identifier varchar(180) NOT NULL, platform varchar(16) NOT NULL, push_token varchar(512), last_seen_at timestamptz, created_at timestamptz NOT NULL DEFAULT now(), updated_at timestamptz NOT NULL DEFAULT now(), deleted_at timestamptz, version integer NOT NULL DEFAULT 1)`,
    );
    await q.query(
      `CREATE UNIQUE INDEX uq_devices_push_token_active ON devices(push_token) WHERE deleted_at IS NULL AND push_token IS NOT NULL`,
    );
    await q.query(
      `CREATE TABLE crops (id uuid PRIMARY KEY DEFAULT gen_random_uuid(), slug varchar(80) NOT NULL UNIQUE, name varchar(120) NOT NULL, scientific_name varchar(160), is_active boolean NOT NULL DEFAULT true, created_at timestamptz NOT NULL DEFAULT now(), updated_at timestamptz NOT NULL DEFAULT now(), version integer NOT NULL DEFAULT 1)`,
    );
    await q.query(
      `CREATE TABLE crop_varieties (id uuid PRIMARY KEY DEFAULT gen_random_uuid(), crop_id uuid NOT NULL REFERENCES crops(id) ON DELETE RESTRICT, name varchar(160) NOT NULL, code varchar(80), is_active boolean NOT NULL DEFAULT true, created_at timestamptz NOT NULL DEFAULT now(), updated_at timestamptz NOT NULL DEFAULT now(), version integer NOT NULL DEFAULT 1, CONSTRAINT uq_crop_varieties_crop_name UNIQUE(crop_id,name))`,
    );
    await q.query(
      `CREATE TABLE farms (id uuid PRIMARY KEY DEFAULT gen_random_uuid(), farmer_id uuid NOT NULL REFERENCES farmer_profiles(id) ON DELETE RESTRICT, name varchar(160) NOT NULL, province varchar(120), district varchar(120), status varchar(24) NOT NULL DEFAULT 'active', boundary geometry(Polygon,4326) NOT NULL, centroid geometry(Point,4326) NOT NULL, area_hectares double precision NOT NULL, created_at timestamptz NOT NULL DEFAULT now(), updated_at timestamptz NOT NULL DEFAULT now(), deleted_at timestamptz, version integer NOT NULL DEFAULT 1, CONSTRAINT ck_farms_boundary_valid CHECK (ST_IsValid(boundary)), CONSTRAINT ck_farms_boundary_coordinates CHECK (ST_XMin(boundary)>=-180 AND ST_XMax(boundary)<=180 AND ST_YMin(boundary)>=-90 AND ST_YMax(boundary)<=90), CONSTRAINT ck_farms_centroid_coordinates CHECK (ST_X(centroid) BETWEEN -180 AND 180 AND ST_Y(centroid) BETWEEN -90 AND 90), CONSTRAINT ck_farms_area_positive CHECK (area_hectares>0))`,
    );
    await q.query(`CREATE INDEX idx_farms_boundary_gist ON farms USING GIST(boundary)`);
    await q.query(`CREATE INDEX idx_farms_centroid_gist ON farms USING GIST(centroid)`);
    await q.query(
      `CREATE TABLE fields (id uuid PRIMARY KEY DEFAULT gen_random_uuid(), farm_id uuid NOT NULL REFERENCES farms(id) ON DELETE RESTRICT, name varchar(160) NOT NULL, status varchar(24) NOT NULL DEFAULT 'active', boundary geometry(Polygon,4326) NOT NULL, centroid geometry(Point,4326) NOT NULL, area_hectares double precision NOT NULL, created_at timestamptz NOT NULL DEFAULT now(), updated_at timestamptz NOT NULL DEFAULT now(), deleted_at timestamptz, version integer NOT NULL DEFAULT 1, CONSTRAINT ck_fields_boundary_valid CHECK (ST_IsValid(boundary)), CONSTRAINT ck_fields_boundary_coordinates CHECK (ST_XMin(boundary)>=-180 AND ST_XMax(boundary)<=180 AND ST_YMin(boundary)>=-90 AND ST_YMax(boundary)<=90), CONSTRAINT ck_fields_centroid_coordinates CHECK (ST_X(centroid) BETWEEN -180 AND 180 AND ST_Y(centroid) BETWEEN -90 AND 90), CONSTRAINT ck_fields_area_positive CHECK (area_hectares>0))`,
    );
    await q.query(
      `CREATE UNIQUE INDEX uq_fields_farm_name_active ON fields(farm_id,name) WHERE deleted_at IS NULL`,
    );
    await q.query(`CREATE INDEX idx_fields_boundary_gist ON fields USING GIST(boundary)`);
    await q.query(`CREATE INDEX idx_fields_centroid_gist ON fields USING GIST(centroid)`);
    await q.query(
      `CREATE TABLE crop_cycles (id uuid PRIMARY KEY DEFAULT gen_random_uuid(), field_id uuid NOT NULL REFERENCES fields(id) ON DELETE RESTRICT, crop_id uuid NOT NULL REFERENCES crops(id) ON DELETE RESTRICT, crop_variety_id uuid REFERENCES crop_varieties(id) ON DELETE RESTRICT, status varchar(24) NOT NULL DEFAULT 'planned', sowing_date date, expected_harvest_date date, actual_harvest_date date, created_at timestamptz NOT NULL DEFAULT now(), updated_at timestamptz NOT NULL DEFAULT now(), deleted_at timestamptz, version integer NOT NULL DEFAULT 1, CONSTRAINT ck_crop_cycle_dates CHECK (expected_harvest_date IS NULL OR sowing_date IS NULL OR expected_harvest_date>=sowing_date))`,
    );
    await q.query(`CREATE INDEX idx_crop_cycles_field_status ON crop_cycles(field_id,status)`);
  }
  async down(q: QueryRunner): Promise<void> {
    for (const table of [
      'crop_cycles',
      'fields',
      'farms',
      'crop_varieties',
      'crops',
      'devices',
      'consents',
      'expert_profiles',
      'farmer_profiles',
      'users',
    ])
      await q.query(`DROP TABLE IF EXISTS ${table} CASCADE`);
  }
}

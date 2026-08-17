import type { MigrationInterface, QueryRunner } from 'typeorm';
export class TasksNotifications1755000016000 implements MigrationInterface {
  name = 'TasksNotifications1755000016000';
  async up(q: QueryRunner): Promise<void> {
    await q.query(
      `CREATE TABLE farmer_tasks(id uuid PRIMARY KEY DEFAULT gen_random_uuid(),user_id uuid NOT NULL REFERENCES users(id) ON DELETE CASCADE,field_id uuid REFERENCES fields(id) ON DELETE SET NULL,title varchar(160) NOT NULL,description text,source varchar(24) NOT NULL,status varchar(16) NOT NULL DEFAULT 'PENDING',due_at timestamptz,completed_at timestamptz,source_reference varchar(100),created_at timestamptz NOT NULL DEFAULT now(),updated_at timestamptz NOT NULL DEFAULT now(),deleted_at timestamptz,version integer NOT NULL DEFAULT 1,CONSTRAINT ck_task_source CHECK(source IN('MANUAL','AI_ACTION_PLAN','SATELLITE','WEATHER','EXPERT','OUTBREAK')),CONSTRAINT ck_task_status CHECK(status IN('PENDING','COMPLETED','CANCELLED')));CREATE INDEX idx_farmer_tasks_user_status_due ON farmer_tasks(user_id,status,due_at)`,
    );
    await q.query(
      `CREATE TABLE notifications(id uuid PRIMARY KEY DEFAULT gen_random_uuid(),user_id uuid NOT NULL REFERENCES users(id) ON DELETE CASCADE,category varchar(20) NOT NULL,title varchar(160) NOT NULL,body text NOT NULL,data jsonb NOT NULL DEFAULT '{}',read_at timestamptz,deduplication_key varchar(180),confirmed_evidence boolean NOT NULL DEFAULT false,ai_confidence double precision,created_at timestamptz NOT NULL DEFAULT now(),updated_at timestamptz NOT NULL DEFAULT now(),version integer NOT NULL DEFAULT 1,CONSTRAINT ck_notification_category CHECK(category IN('SATELLITE','WEATHER','DIAGNOSIS','EXPERT','OUTBREAK','TASK','SYSTEM')),CONSTRAINT ck_notification_confidence CHECK(ai_confidence IS NULL OR ai_confidence BETWEEN 0 AND 1));CREATE UNIQUE INDEX uq_notifications_user_dedup ON notifications(user_id,deduplication_key) WHERE deduplication_key IS NOT NULL;CREATE INDEX idx_notifications_user_created ON notifications(user_id,created_at DESC)`,
    );
    await q.query(
      `CREATE TABLE device_tokens(id uuid PRIMARY KEY DEFAULT gen_random_uuid(),user_id uuid NOT NULL REFERENCES users(id) ON DELETE CASCADE,device_id uuid REFERENCES devices(id) ON DELETE SET NULL,token_value text NOT NULL,token_hash char(64) NOT NULL UNIQUE,platform varchar(16) NOT NULL,active boolean NOT NULL DEFAULT true,last_seen_at timestamptz NOT NULL,invalidated_at timestamptz,created_at timestamptz NOT NULL DEFAULT now(),updated_at timestamptz NOT NULL DEFAULT now(),deleted_at timestamptz,version integer NOT NULL DEFAULT 1,CONSTRAINT ck_push_platform CHECK(platform IN('ANDROID','IOS','WEB')));CREATE INDEX idx_device_tokens_user_active ON device_tokens(user_id,active)`,
    );
    await q.query(
      `CREATE TABLE notification_preferences(id uuid PRIMARY KEY DEFAULT gen_random_uuid(),user_id uuid NOT NULL REFERENCES users(id) ON DELETE CASCADE,category varchar(20) NOT NULL,push_enabled boolean NOT NULL DEFAULT true,quiet_hours_start time,quiet_hours_end time,timezone varchar(64) NOT NULL DEFAULT 'Asia/Karachi',created_at timestamptz NOT NULL DEFAULT now(),updated_at timestamptz NOT NULL DEFAULT now(),version integer NOT NULL DEFAULT 1,UNIQUE(user_id,category),CONSTRAINT ck_notification_preference_category CHECK(category IN('SATELLITE','WEATHER','DIAGNOSIS','EXPERT','OUTBREAK','TASK','SYSTEM')))`,
    );
    await q.query(
      `CREATE TABLE notification_deliveries(id uuid PRIMARY KEY DEFAULT gen_random_uuid(),notification_id uuid NOT NULL REFERENCES notifications(id) ON DELETE CASCADE,device_token_id uuid NOT NULL REFERENCES device_tokens(id) ON DELETE CASCADE,status varchar(20) NOT NULL DEFAULT 'SCHEDULED',provider_message_id varchar(255),attempt_count integer NOT NULL DEFAULT 0,scheduled_at timestamptz NOT NULL,sent_at timestamptz,delivered_at timestamptz,last_error_code varchar(100),created_at timestamptz NOT NULL DEFAULT now(),updated_at timestamptz NOT NULL DEFAULT now(),version integer NOT NULL DEFAULT 1,UNIQUE(notification_id,device_token_id),CONSTRAINT ck_delivery_status CHECK(status IN('SCHEDULED','SENT','DELIVERED','FAILED','INVALID_TOKEN')));CREATE INDEX idx_notification_deliveries_status ON notification_deliveries(status,scheduled_at)`,
    );
  }
  async down(q: QueryRunner): Promise<void> {
    await q.query(
      `DROP TABLE IF EXISTS notification_deliveries,notification_preferences,device_tokens,notifications,farmer_tasks CASCADE`,
    );
  }
}

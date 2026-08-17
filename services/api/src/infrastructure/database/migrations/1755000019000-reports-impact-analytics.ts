import type { MigrationInterface, QueryRunner } from 'typeorm';
export class ReportsImpactAnalytics1755000019000 implements MigrationInterface {
  name = 'ReportsImpactAnalytics1755000019000';
  async up(q: QueryRunner): Promise<void> {
    await q.query(
      `CREATE TABLE generated_reports(id uuid PRIMARY KEY DEFAULT gen_random_uuid(),owner_id uuid NOT NULL REFERENCES users(id) ON DELETE CASCADE,type varchar(32) NOT NULL,status varchar(16) NOT NULL DEFAULT 'QUEUED',resource_id uuid,parameters jsonb NOT NULL DEFAULT '{}',object_key varchar(512),content_type varchar(80),size_bytes bigint,failure_code varchar(80),deduplication_key varchar(180) NOT NULL,request_hash char(64) NOT NULL,completed_at timestamptz,created_at timestamptz NOT NULL DEFAULT now(),updated_at timestamptz NOT NULL DEFAULT now(),version integer NOT NULL DEFAULT 1,CONSTRAINT ck_generated_report_type CHECK(type IN('SATELLITE_HEALTH','DIAGNOSIS','EXPERT_REVIEW','FIELD_HEALTH','WEATHER_SUITABILITY','WEEKLY_ACTION_PLAN','OUTBREAK_SUMMARY')),CONSTRAINT ck_generated_report_status CHECK(status IN('QUEUED','GENERATING','COMPLETED','FAILED')),CONSTRAINT uq_generated_reports_dedup UNIQUE(owner_id,deduplication_key));CREATE INDEX idx_generated_reports_owner_created ON generated_reports(owner_id,created_at DESC)`,
    );
    await q.query(
      `CREATE TABLE analytics_events(id uuid PRIMARY KEY DEFAULT gen_random_uuid(),event_type varchar(40) NOT NULL,actor_id uuid REFERENCES users(id) ON DELETE SET NULL,subject_type varchar(40) NOT NULL,subject_id uuid,dimensions jsonb NOT NULL DEFAULT '{}',source_key varchar(180) NOT NULL UNIQUE,occurred_at timestamptz NOT NULL,created_at timestamptz NOT NULL DEFAULT now(),updated_at timestamptz NOT NULL DEFAULT now(),version integer NOT NULL DEFAULT 1,CONSTRAINT ck_analytics_event_type CHECK(event_type IN('ALERT_GENERATED','FARMER_ALERTED')));CREATE INDEX idx_analytics_events_type_time ON analytics_events(event_type,occurred_at DESC)`,
    );
    await q.query(
      `CREATE FUNCTION record_notification_analytics() RETURNS trigger LANGUAGE plpgsql AS $$ BEGIN INSERT INTO analytics_events(event_type,actor_id,subject_type,subject_id,source_key,occurred_at) VALUES('ALERT_GENERATED',NEW.user_id,'NOTIFICATION',NEW.id,'notification:'||NEW.id,NEW.created_at) ON CONFLICT(source_key) DO NOTHING;RETURN NEW;END $$;CREATE TRIGGER trg_notification_analytics AFTER INSERT ON notifications FOR EACH ROW EXECUTE FUNCTION record_notification_analytics()`,
    );
    await q.query(
      `CREATE FUNCTION record_delivery_analytics() RETURNS trigger LANGUAGE plpgsql AS $$ DECLARE uid uuid;BEGIN IF NEW.status IN('SENT','DELIVERED') AND (TG_OP='INSERT' OR OLD.status IS DISTINCT FROM NEW.status) THEN SELECT user_id INTO uid FROM notifications WHERE id=NEW.notification_id;INSERT INTO analytics_events(event_type,actor_id,subject_type,subject_id,source_key,occurred_at) VALUES('FARMER_ALERTED',uid,'NOTIFICATION_DELIVERY',NEW.id,'delivery:'||NEW.id,COALESCE(NEW.delivered_at,NEW.sent_at,now())) ON CONFLICT(source_key) DO NOTHING;END IF;RETURN NEW;END $$;CREATE TRIGGER trg_delivery_analytics AFTER INSERT OR UPDATE OF status ON notification_deliveries FOR EACH ROW EXECUTE FUNCTION record_delivery_analytics()`,
    );
    await q.query(
      `INSERT INTO analytics_events(event_type,actor_id,subject_type,subject_id,source_key,occurred_at) SELECT 'ALERT_GENERATED',user_id,'NOTIFICATION',id,'notification:'||id,created_at FROM notifications ON CONFLICT(source_key) DO NOTHING;INSERT INTO analytics_events(event_type,actor_id,subject_type,subject_id,source_key,occurred_at) SELECT 'FARMER_ALERTED',n.user_id,'NOTIFICATION_DELIVERY',d.id,'delivery:'||d.id,COALESCE(d.delivered_at,d.sent_at,d.updated_at) FROM notification_deliveries d JOIN notifications n ON n.id=d.notification_id WHERE d.status IN('SENT','DELIVERED') ON CONFLICT(source_key) DO NOTHING`,
    );
  }
  async down(q: QueryRunner): Promise<void> {
    await q.query(
      'DROP TRIGGER IF EXISTS trg_delivery_analytics ON notification_deliveries;DROP FUNCTION IF EXISTS record_delivery_analytics;DROP TRIGGER IF EXISTS trg_notification_analytics ON notifications;DROP FUNCTION IF EXISTS record_notification_analytics;DROP TABLE IF EXISTS analytics_events;DROP TABLE IF EXISTS generated_reports',
    );
  }
}

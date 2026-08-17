import type { MigrationInterface, QueryRunner } from 'typeorm';
export class VoiceAssistant1755000017000 implements MigrationInterface {
  name = 'VoiceAssistant1755000017000';
  async up(q: QueryRunner): Promise<void> {
    await q.query(
      `CREATE TABLE assistant_conversations(id uuid PRIMARY KEY DEFAULT gen_random_uuid(),user_id uuid NOT NULL REFERENCES users(id) ON DELETE CASCADE,farm_id uuid REFERENCES farms(id) ON DELETE SET NULL,field_id uuid REFERENCES fields(id) ON DELETE SET NULL,title varchar(160) NOT NULL,status varchar(16) NOT NULL DEFAULT 'ACTIVE',created_at timestamptz NOT NULL DEFAULT now(),updated_at timestamptz NOT NULL DEFAULT now(),version integer NOT NULL DEFAULT 1,CONSTRAINT ck_assistant_conversation_status CHECK(status IN('ACTIVE','ARCHIVED')));CREATE INDEX idx_assistant_conversations_user_updated ON assistant_conversations(user_id,updated_at DESC)`,
    );
    await q.query(
      `CREATE TABLE assistant_messages(id uuid PRIMARY KEY DEFAULT gen_random_uuid(),conversation_id uuid NOT NULL REFERENCES assistant_conversations(id) ON DELETE CASCADE,role varchar(16) NOT NULL,content text NOT NULL,media_asset_id uuid REFERENCES media_assets(id) ON DELETE SET NULL,proposals jsonb NOT NULL DEFAULT '[]',provider varchar(80),model_id varchar(100),model_version varchar(100),prompt_version varchar(40),input_tokens integer,output_tokens integer,latency_ms integer,created_at timestamptz NOT NULL DEFAULT now(),updated_at timestamptz NOT NULL DEFAULT now(),version integer NOT NULL DEFAULT 1,CONSTRAINT ck_assistant_message_role CHECK(role IN('USER','ASSISTANT')),CONSTRAINT ck_assistant_usage CHECK((input_tokens IS NULL OR input_tokens>=0)AND(output_tokens IS NULL OR output_tokens>=0)AND(latency_ms IS NULL OR latency_ms>=0)));CREATE INDEX idx_assistant_messages_conversation_created ON assistant_messages(conversation_id,created_at)`,
    );
  }
  async down(q: QueryRunner): Promise<void> {
    await q.query(`DROP TABLE IF EXISTS assistant_messages,assistant_conversations CASCADE`);
  }
}

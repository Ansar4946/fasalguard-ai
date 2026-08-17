import { Column, Entity, Index } from 'typeorm';
import { BaseEntity } from '../../infrastructure/database/entities/base.entity';
import { AssistantRole, ConversationStatus } from './assistant.enums';
@Entity({ name: 'assistant_conversations' })
@Index('idx_assistant_conversations_user_updated', ['userId', 'updatedAt'])
export class AssistantConversation extends BaseEntity {
  @Column({ name: 'user_id', type: 'uuid' }) userId!: string;
  @Column({ name: 'farm_id', type: 'uuid', nullable: true }) farmId!: string | null;
  @Column({ name: 'field_id', type: 'uuid', nullable: true }) fieldId!: string | null;
  @Column({ type: 'varchar', length: 160 }) title!: string;
  @Column({ type: 'varchar', length: 16, default: ConversationStatus.Active })
  status!: ConversationStatus;
}
@Entity({ name: 'assistant_messages' })
@Index('idx_assistant_messages_conversation_created', ['conversationId', 'createdAt'])
export class AssistantMessage extends BaseEntity {
  @Column({ name: 'conversation_id', type: 'uuid' }) conversationId!: string;
  @Column({ type: 'varchar', length: 16 }) role!: AssistantRole;
  @Column({ type: 'text' }) content!: string;
  @Column({ name: 'media_asset_id', type: 'uuid', nullable: true }) mediaAssetId!: string | null;
  @Column({ type: 'jsonb', default: () => "'[]'::jsonb" }) proposals!: Record<string, unknown>[];
  @Column({ type: 'varchar', length: 80, nullable: true }) provider!: string | null;
  @Column({ name: 'model_id', type: 'varchar', length: 100, nullable: true }) modelId!:
    string | null;
  @Column({ name: 'model_version', type: 'varchar', length: 100, nullable: true }) modelVersion!:
    string | null;
  @Column({ name: 'prompt_version', type: 'varchar', length: 40, nullable: true }) promptVersion!:
    string | null;
  @Column({ name: 'input_tokens', type: 'integer', nullable: true }) inputTokens!: number | null;
  @Column({ name: 'output_tokens', type: 'integer', nullable: true }) outputTokens!: number | null;
  @Column({ name: 'latency_ms', type: 'integer', nullable: true }) latencyMs!: number | null;
}

import { AssistantAction } from '../assistant.enums';
export const AGRICULTURE_ASSISTANT_PROVIDER = Symbol('AGRICULTURE_ASSISTANT_PROVIDER');
export interface ActionProposal {
  action: AssistantAction;
  label: string;
  reason: string;
  parameters: Record<string, string>;
}
export interface AssistantProviderResult {
  answer: string;
  proposals: ActionProposal[];
  provider: string;
  modelId: string;
  modelVersion: string;
  inputTokens: number | null;
  outputTokens: number | null;
  latencyMs: number;
}
export interface AgricultureAssistantProvider {
  respond(input: {
    message: string;
    context: Record<string, unknown>;
    history: Array<{ role: string; content: string }>;
    allowedActions: readonly AssistantAction[];
  }): Promise<AssistantProviderResult>;
}

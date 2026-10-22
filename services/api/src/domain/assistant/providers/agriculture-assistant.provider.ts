import { AssistantAction } from '../assistant.enums';
export const AGRICULTURE_ASSISTANT_PROVIDER = Symbol('AGRICULTURE_ASSISTANT_PROVIDER');
export const ASSISTANT_LANGUAGES = ['en', 'ur', 'hi'] as const;
export type AssistantLanguage = (typeof ASSISTANT_LANGUAGES)[number];
export interface ActionProposal {
  action: AssistantAction;
  label: string;
  reason: string;
  parameters: Record<string, string>;
}
/** An approved knowledge article the model may cite. IDs are server-issued. */
export interface RetrievedSource {
  id: string;
  title: string;
  revision: number;
  languageCode: string;
  excerpt: string;
}
export interface AssistantProviderResult {
  answer: string;
  /** Source IDs the answer relies on; the service verifies each against the retrieved set. */
  citations: string[];
  proposals: ActionProposal[];
  provider: string;
  modelId: string;
  modelVersion: string;
  inputTokens: number | null;
  outputTokens: number | null;
  latencyMs: number;
}
export interface AgricultureAssistantProvider {
  /** True only for a real external model; the fake stub and test stubs leave it unset. */
  readonly external?: boolean;
  respond(input: {
    message: string;
    language: AssistantLanguage;
    context: Record<string, unknown>;
    sources: RetrievedSource[];
    history: Array<{ role: string; content: string }>;
    allowedActions: readonly AssistantAction[];
  }): Promise<AssistantProviderResult>;
}

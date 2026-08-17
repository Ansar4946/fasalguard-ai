import { Injectable } from '@nestjs/common';
import type {
  AgricultureAssistantProvider,
  AssistantProviderResult,
} from './agriculture-assistant.provider';
@Injectable()
export class FakeAssistantProvider implements AgricultureAssistantProvider {
  respond(
    _input: Parameters<AgricultureAssistantProvider['respond']>[0],
  ): Promise<AssistantProviderResult> {
    void _input;
    return Promise.resolve({
      answer:
        'Inspect the field and use verified guidance. This response does not execute actions.',
      proposals: [],
      provider: 'FAKE',
      modelId: 'fake-assistant',
      modelVersion: '1',
      inputTokens: 10,
      outputTokens: 12,
      latencyMs: 1,
    });
  }
}

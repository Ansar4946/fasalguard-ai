import { Injectable, ServiceUnavailableException } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { parseProviderOutput, systemPrompt, userPayload } from '../grounding';
import type {
  AgricultureAssistantProvider,
  AssistantProviderResult,
} from './agriculture-assistant.provider';
interface Response {
  model?: string;
  choices?: Array<{ message?: { content?: string } }>;
  usage?: { prompt_tokens?: number; completion_tokens?: number };
}
@Injectable()
export class QwenAssistantProvider implements AgricultureAssistantProvider {
  /** A real external model: receives only the redacted account context, never finance. */
  readonly external = true;
  constructor(private readonly config: ConfigService) {}
  async respond(
    input: Parameters<AgricultureAssistantProvider['respond']>[0],
  ): Promise<AssistantProviderResult> {
    const started = Date.now(),
      key = this.config.get<string>('qwenApiKey', '');
    if (!key)
      throw new ServiceUnavailableException('Qwen assistant credentials are not configured.');
    const response = await fetch(
      new URL('/compatible-mode/v1/chat/completions', this.config.get('qwenBaseUrl')),
      {
        method: 'POST',
        headers: { authorization: `Bearer ${key}`, 'content-type': 'application/json' },
        body: JSON.stringify({
          model: this.config.get<string>('qwenModel', 'qwen-plus'),
          messages: [
            { role: 'system', content: systemPrompt(input.language, input.allowedActions) },
            ...input.history.slice(-10),
            { role: 'user', content: userPayload(input) },
          ],
          response_format: { type: 'json_object' },
          temperature: 0.1,
        }),
        signal: AbortSignal.timeout(this.config.get<number>('assistantTimeoutMs', 20_000)),
      },
    ).catch(() => {
      // Timeouts (AbortSignal.timeout) and network failures are a provider outage, not a server bug.
      throw new ServiceUnavailableException({
        code: 'ASSISTANT_PROVIDER_UNAVAILABLE',
        message: 'Qwen assistant is unreachable or timed out.',
      });
    });
    if (!response.ok)
      throw new ServiceUnavailableException({
        code: 'ASSISTANT_PROVIDER_UNAVAILABLE',
        message: 'Qwen assistant request failed.',
      });
    const raw = (await response.json()) as Response;
    let parsed: unknown;
    try {
      parsed = JSON.parse(raw.choices?.[0]?.message?.content ?? '');
    } catch {
      throw new ServiceUnavailableException('Qwen assistant returned malformed JSON.');
    }
    return {
      ...parseProviderOutput(parsed, new Set(input.allowedActions)),
      provider: 'ALIBABA_QWEN',
      modelId: raw.model ?? this.config.get('qwenModel', 'qwen-plus'),
      modelVersion: 'ASSISTANT_V2_GROUNDED',
      inputTokens: raw.usage?.prompt_tokens ?? null,
      outputTokens: raw.usage?.completion_tokens ?? null,
      latencyMs: Date.now() - started,
    };
  }
}

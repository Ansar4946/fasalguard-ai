import { Injectable, ServiceUnavailableException } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { parseProviderOutput, systemPrompt, userPayload } from '../grounding';
import type {
  AgricultureAssistantProvider,
  AssistantProviderResult,
} from './agriculture-assistant.provider';

interface GeminiResponse {
  modelVersion?: string;
  candidates?: Array<{ finishReason?: string; content?: { parts?: Array<{ text?: string }> } }>;
  usageMetadata?: { promptTokenCount?: number; candidatesTokenCount?: number };
}

const responseSchema = {
  type: 'OBJECT',
  required: ['answer', 'citations', 'proposals'],
  properties: {
    answer: { type: 'STRING' },
    citations: { type: 'ARRAY', items: { type: 'STRING' } },
    proposals: {
      type: 'ARRAY',
      items: {
        type: 'OBJECT',
        required: ['action', 'label', 'reason', 'parameters'],
        properties: {
          action: { type: 'STRING' },
          label: { type: 'STRING' },
          reason: { type: 'STRING' },
          parameters: { type: 'OBJECT' },
        },
      },
    },
  },
};

const TRANSIENT = new Set([429, 500, 502, 503, 504]);

/** Google AI Studio (Gemini) assistant. The key travels in a header, never in the URL or logs. */
@Injectable()
export class GeminiAssistantProvider implements AgricultureAssistantProvider {
  /** A real external model: receives only the redacted account context, never finance. */
  readonly external = true;
  constructor(private readonly config: ConfigService) {}

  async respond(
    input: Parameters<AgricultureAssistantProvider['respond']>[0],
  ): Promise<AssistantProviderResult> {
    const started = Date.now();
    const key = this.config.get<string>('geminiApiKey', '');
    if (!key)
      throw new ServiceUnavailableException('Gemini assistant credentials are not configured.');
    const model = this.config.get<string>('geminiModel', 'gemini-3.6-flash');
    const timeoutMs = this.config.get<number>('assistantTimeoutMs', 20_000);
    const body = JSON.stringify({
      systemInstruction: { parts: [{ text: systemPrompt(input.language, input.allowedActions) }] },
      contents: [
        ...input.history
          .slice(-this.config.get<number>('assistantMaxContextMessages', 10))
          .map((m) => ({
            role: m.role === 'assistant' ? 'model' : 'user',
            parts: [{ text: m.content }],
          })),
        { role: 'user', parts: [{ text: userPayload(input) }] },
      ],
      generationConfig: {
        temperature: 0.1,
        responseMimeType: 'application/json',
        responseSchema,
      },
    });
    const raw = await this.call(model, key, body, timeoutMs);
    const text = raw.candidates?.[0]?.content?.parts?.map((p) => p.text ?? '').join('') ?? '';
    let parsed: unknown;
    try {
      parsed = JSON.parse(text);
    } catch {
      throw new ServiceUnavailableException('Gemini assistant returned malformed JSON.');
    }
    return {
      ...parseProviderOutput(parsed, new Set(input.allowedActions)),
      provider: 'GOOGLE_GEMINI',
      modelId: raw.modelVersion ?? model,
      modelVersion: 'ASSISTANT_V2_GROUNDED',
      inputTokens: raw.usageMetadata?.promptTokenCount ?? null,
      outputTokens: raw.usageMetadata?.candidatesTokenCount ?? null,
      latencyMs: Date.now() - started,
    };
  }

  /** One bounded retry for transient failures only; the deadline covers both attempts. */
  private async call(
    model: string,
    key: string,
    body: string,
    timeoutMs: number,
  ): Promise<GeminiResponse> {
    const url = `https://generativelanguage.googleapis.com/v1beta/models/${encodeURIComponent(model)}:generateContent`;
    const deadline = AbortSignal.timeout(timeoutMs);
    for (let attempt = 0; attempt < 2; attempt += 1) {
      let response: Response;
      try {
        response = await fetch(url, {
          method: 'POST',
          headers: { 'content-type': 'application/json', 'x-goog-api-key': key },
          body,
          signal: deadline,
        });
      } catch {
        if (attempt === 0 && !deadline.aborted) continue;
        throw new ServiceUnavailableException({
          code: 'ASSISTANT_PROVIDER_UNAVAILABLE',
          message: 'Gemini assistant is unreachable or timed out.',
        });
      }
      if (response.ok) return (await response.json().catch(() => ({}))) as GeminiResponse;
      if (attempt === 0 && TRANSIENT.has(response.status) && !deadline.aborted) continue;
      throw new ServiceUnavailableException({
        code: 'ASSISTANT_PROVIDER_UNAVAILABLE',
        message: 'Gemini assistant request failed.',
      });
    }
    throw new ServiceUnavailableException({
      code: 'ASSISTANT_PROVIDER_UNAVAILABLE',
      message: 'Gemini assistant request failed.',
    });
  }
}

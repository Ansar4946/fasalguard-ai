import { ServiceUnavailableException } from '@nestjs/common';
import type { ConfigService } from '@nestjs/config';
import { plainToInstance } from 'class-transformer';
import { validate } from 'class-validator';
import { AssistantAction } from '../src/domain/assistant/assistant.enums';
import { SendAssistantMessageDto } from '../src/domain/assistant/dto/assistant.dto';
import { FakeAssistantProvider } from '../src/domain/assistant/providers/fake-assistant.provider';
import { FakeSpeechProvider } from '../src/domain/assistant/providers/fake-speech.provider';
import { GeminiAssistantProvider } from '../src/domain/assistant/providers/gemini-assistant.provider';
import { QwenAssistantProvider } from '../src/domain/assistant/providers/qwen-assistant.provider';

describe('Assistant provider boundaries', () => {
  it('never fabricates transcripts or audio when speech is unconfigured', async () => {
    const provider = new FakeSpeechProvider();
    await expect(
      provider.transcribe({ audioUrl: 'private-test-url', language: 'en' }),
    ).rejects.toBeInstanceOf(ServiceUnavailableException);
    await expect(
      provider.synthesize({ text: 'Inspect the field', language: 'en' }),
    ).rejects.toBeInstanceOf(ServiceUnavailableException);
  });

  it('returns no executable mutations from the fake assistant', async () => {
    const result = await new FakeAssistantProvider().respond({
      message: 'Create a task now',
      language: 'en',
      sources: [],
      context: {},
      history: [],
      allowedActions: Object.values(AssistantAction),
    });
    expect(result.proposals).toEqual([]);
    expect(result.answer).toContain('does not execute actions');
  });

  it('rejects a model proposal outside the server allowlist', async () => {
    const fetchMock = jest.spyOn(global, 'fetch').mockResolvedValueOnce(
      new Response(
        JSON.stringify({
          model: 'qwen-test',
          choices: [
            {
              message: {
                content: JSON.stringify({
                  answer: 'Done',
                  citations: [],
                  proposals: [
                    { action: 'DELETE_FARM', label: 'Delete', reason: 'unsafe', parameters: {} },
                  ],
                }),
              },
            },
          ],
        }),
        { status: 200, headers: { 'content-type': 'application/json' } },
      ),
    );
    const config = {
      get: (key: string, fallback?: string) =>
        ({
          qwenApiKey: 'test-key',
          qwenBaseUrl: 'https://example.invalid',
          qwenModel: 'qwen-test',
        })[key] ?? fallback,
    } as ConfigService;
    await expect(
      new QwenAssistantProvider(config).respond({
        message: 'Delete my farm',
        language: 'en',
        sources: [],
        context: {},
        history: [],
        allowedActions: Object.values(AssistantAction),
      }),
    ).rejects.toBeInstanceOf(ServiceUnavailableException);
    fetchMock.mockRestore();
  });

  const input = {
    message: 'When to sow wheat?',
    language: 'en' as const,
    sources: [],
    context: {},
    history: [],
    allowedActions: Object.values(AssistantAction),
  };
  const cfg = {
    get: (key: string, fallback?: unknown) =>
      ({
        qwenApiKey: 'test-key',
        qwenBaseUrl: 'https://example.invalid',
        geminiApiKey: 'test-key',
        assistantTimeoutMs: 50,
      })[key] ?? fallback,
  } as unknown as ConfigService;

  it.each([
    ['Qwen', (): QwenAssistantProvider => new QwenAssistantProvider(cfg)],
    ['Gemini', (): GeminiAssistantProvider => new GeminiAssistantProvider(cfg)],
  ])('%s timeout maps to a 503 with a stable error code', async (_name, make) => {
    const fetchMock = jest
      .spyOn(global, 'fetch')
      .mockRejectedValue(
        new DOMException('The operation was aborted due to timeout', 'TimeoutError'),
      );
    try {
      const error: unknown = await make()
        .respond(input)
        .catch((e: unknown) => e);
      expect(error).toBeInstanceOf(ServiceUnavailableException);
      expect((error as ServiceUnavailableException).getStatus()).toBe(503);
      expect((error as ServiceUnavailableException).getResponse()).toMatchObject({
        code: 'ASSISTANT_PROVIDER_UNAVAILABLE',
      });
    } finally {
      fetchMock.mockRestore();
    }
  });

  it('rejects NUL/control characters and whitespace-only assistant messages', async () => {
    const errorsFor = (message: string): ReturnType<typeof validate> =>
      validate(plainToInstance(SendAssistantMessageDto, { message }));
    expect(await errorsFor('wheat\u0000sowing')).not.toHaveLength(0);
    expect(await errorsFor('wheat\u0007sowing')).not.toHaveLength(0);
    expect(await errorsFor('   ')).not.toHaveLength(0);
    expect(await errorsFor('\n\t ')).not.toHaveLength(0);
    expect(await errorsFor('wheat\nsowing window?\tاردو')).toHaveLength(0);
  });
});

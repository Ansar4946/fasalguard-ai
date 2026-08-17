import { ServiceUnavailableException } from '@nestjs/common';
import type { ConfigService } from '@nestjs/config';
import { AssistantAction } from '../src/domain/assistant/assistant.enums';
import { FakeAssistantProvider } from '../src/domain/assistant/providers/fake-assistant.provider';
import { FakeSpeechProvider } from '../src/domain/assistant/providers/fake-speech.provider';
import { QwenAssistantProvider } from '../src/domain/assistant/providers/qwen-assistant.provider';

describe('Assistant provider boundaries', () => {
  it('uses deterministic fake speech providers without external calls', async () => {
    const provider = new FakeSpeechProvider();
    await expect(provider.transcribe({ audioUrl: 'private-test-url' })).resolves.toMatchObject({
      provider: 'FAKE',
      text: 'Development voice transcript',
    });
    await expect(provider.synthesize({ text: 'Inspect the field' })).resolves.toMatchObject({
      provider: 'FAKE',
      contentType: 'audio/mpeg',
    });
  });

  it('returns no executable mutations from the fake assistant', async () => {
    const result = await new FakeAssistantProvider().respond({
      message: 'Create a task now',
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
        context: {},
        history: [],
        allowedActions: Object.values(AssistantAction),
      }),
    ).rejects.toBeInstanceOf(ServiceUnavailableException);
    fetchMock.mockRestore();
  });
});

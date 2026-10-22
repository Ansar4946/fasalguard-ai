import { ServiceUnavailableException } from '@nestjs/common';
import type { ConfigService } from '@nestjs/config';
import { AzureSpeechProvider } from '../src/domain/assistant/providers/azure-speech.provider';

function provider(values: Record<string, unknown> = {}): AzureSpeechProvider {
  return new AzureSpeechProvider({
    get: (key: string, fallback?: unknown) => values[key] ?? fallback,
  } as ConfigService);
}

describe('AzureSpeechProvider', () => {
  afterEach(() => jest.restoreAllMocks());

  it('reports no languages without credentials', () => {
    expect(provider().capabilities()).toMatchObject({
      available: false,
      sttLanguages: [],
      ttsLanguages: [],
    });
  });

  it('reports only the explicitly configured language matrix', () => {
    expect(
      provider({ azureSpeechKey: 'secret', azureSpeechRegion: 'eastus' }).capabilities(),
    ).toMatchObject({
      available: true,
      sttLanguages: ['en', 'ur', 'hi'],
      ttsLanguages: ['en', 'ur', 'hi'],
    });
  });

  it('escapes text and returns bounded real provider audio', async () => {
    const fetchMock = jest.spyOn(global, 'fetch').mockResolvedValueOnce(
      new Response(new Uint8Array([1, 2, 3]), {
        status: 200,
        headers: { 'content-type': 'audio/mpeg' },
      }),
    );
    const result = await provider({
      azureSpeechKey: 'secret',
      azureSpeechRegion: 'eastus',
    }).synthesize({ text: '<cotton & wheat>', language: 'ur' });
    expect(result).toMatchObject({
      provider: 'AZURE_SPEECH',
      modelId: 'ur-PK-UzmaNeural',
      contentType: 'audio/mpeg',
    });
    const requestBody = fetchMock.mock.calls[0]?.[1]?.body;
    expect(typeof requestBody === 'string' ? requestBody : '').toContain(
      '&lt;cotton &amp; wheat&gt;',
    );
  });

  it('parses Azure detailed STT output and sends codec-qualified audio', async () => {
    const fetchMock = jest
      .spyOn(global, 'fetch')
      .mockResolvedValueOnce(
        new Response(new Uint8Array([1, 2, 3]), {
          status: 200,
          headers: { 'content-type': 'audio/ogg' },
        }),
      )
      .mockResolvedValueOnce(
        new Response(
          JSON.stringify({
            RecognitionStatus: 'Success',
            NBest: [{ Display: 'کپاس کی فصل' }],
            Duration: 10_000_000,
          }),
          { status: 200, headers: { 'content-type': 'application/json' } },
        ),
      );
    const result = await provider({
      azureSpeechKey: 'secret',
      azureSpeechRegion: 'eastus',
    }).transcribe({ audioUrl: 'https://private.invalid/voice.ogg', language: 'ur' });
    expect(result).toMatchObject({ text: 'کپاس کی فصل', durationMs: 1000 });
    const headers = fetchMock.mock.calls[1]?.[1]?.headers as Record<string, string>;
    expect(headers['content-type']).toBe('audio/ogg; codecs=opus');
  });

  it('maps provider and timeout failures to stable service errors', async () => {
    jest.spyOn(global, 'fetch').mockRejectedValueOnce(new DOMException('timeout', 'TimeoutError'));
    await expect(
      provider({ azureSpeechKey: 'secret', azureSpeechRegion: 'eastus' }).synthesize({
        text: 'test',
        language: 'en',
      }),
    ).rejects.toBeInstanceOf(ServiceUnavailableException);
  });
});

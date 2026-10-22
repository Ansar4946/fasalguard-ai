/* AssemblyAI speech-to-text. The unit block stubs global fetch (contract tests only). The live block
 * calls the real AssemblyAI API with a real synthesized WAV and runs only when
 * ASSEMBLYAI_LIVE_KEY and ASSEMBLYAI_LIVE_AUDIO_EN are set. */
import { createServer, type Server } from 'node:http';
import { readFileSync } from 'node:fs';
import type { AddressInfo } from 'node:net';
import { ServiceUnavailableException } from '@nestjs/common';
import type { ConfigService } from '@nestjs/config';
import { AssemblyAiSpeechProvider } from '../src/domain/assistant/providers/assemblyai-speech.provider';

const config = (over: Record<string, unknown> = {}): ConfigService =>
  ({
    get: (key: string, fallback?: unknown) =>
      ({ assemblyAiApiKey: 'test-aai-key', speechProviderTimeoutMs: 5000, ...over })[key] ??
      fallback,
  }) as unknown as ConfigService;

const audio = (type = 'audio/wav', status = 200): Response =>
  new Response(new Uint8Array([1, 2, 3]), { status, headers: { 'content-type': type } });
const json = (body: unknown, status = 200): Response =>
  new Response(JSON.stringify(body), { status, headers: { 'content-type': 'application/json' } });
const completed = {
  id: 't1',
  status: 'completed',
  text: ' گندم کب بوئیں ',
  confidence: 0.91234,
  audio_duration: 3.2,
  speech_model: 'universal-2',
};
const input = { audioUrl: 'https://private.invalid/audio.wav', language: 'ur' as const };

describe('AssemblyAiSpeechProvider (stubbed network)', () => {
  afterEach(() => jest.restoreAllMocks());

  it('uploads bytes, requests the right language code, and returns text with confidence', async () => {
    const fetchMock = jest
      .spyOn(global, 'fetch')
      .mockResolvedValueOnce(audio())
      .mockResolvedValueOnce(json({ upload_url: 'https://cdn.assemblyai.test/u1' }))
      .mockResolvedValueOnce(json({ id: 't1', status: 'queued' }))
      .mockResolvedValueOnce(json(completed));
    const result = await new AssemblyAiSpeechProvider(config()).transcribe(input);
    expect(result).toMatchObject({
      text: 'گندم کب بوئیں',
      provider: 'ASSEMBLYAI',
      modelId: 'universal-2',
      durationMs: 3200,
      usage: { confidence: 0.912 },
    });
    const created = JSON.parse(fetchMock.mock.calls[2]![1]!.body as string) as Record<
      string,
      string
    >;
    expect(created).toEqual({ audio_url: 'https://cdn.assemblyai.test/u1', language_code: 'ur' });
    const headers = fetchMock.mock.calls[1]![1]!.headers as Record<string, string>;
    expect(headers.authorization).toBe('test-aai-key');
    expect(fetchMock.mock.calls[1]![0]).not.toContain('test-aai-key');
  });

  it('advertises speech-to-text only and fails closed without a key', async () => {
    const caps = new AssemblyAiSpeechProvider(config()).capabilities();
    expect(caps).toMatchObject({
      available: true,
      sttLanguages: ['en', 'ur', 'hi'],
      ttsLanguages: [],
    });
    const none = new AssemblyAiSpeechProvider(config({ assemblyAiApiKey: '' }));
    expect(none.capabilities()).toMatchObject({ available: false, sttLanguages: [] });
    const fetchMock = jest.spyOn(global, 'fetch');
    await expect(none.transcribe(input)).rejects.toBeInstanceOf(ServiceUnavailableException);
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it('rejects unreadable media, unsupported formats and oversized recordings before calling AssemblyAI', async () => {
    const fetchMock = jest.spyOn(global, 'fetch').mockResolvedValueOnce(audio('audio/wav', 404));
    await expect(new AssemblyAiSpeechProvider(config()).transcribe(input)).rejects.toMatchObject({
      response: { code: 'SPEECH_MEDIA_UNAVAILABLE' },
    });
    fetchMock.mockResolvedValueOnce(audio('text/html'));
    await expect(new AssemblyAiSpeechProvider(config()).transcribe(input)).rejects.toMatchObject({
      response: { code: 'SPEECH_MEDIA_INVALID' },
    });
    fetchMock.mockResolvedValueOnce(
      new Response(new Uint8Array(1), {
        headers: { 'content-type': 'audio/wav', 'content-length': String(26 * 1024 * 1024) },
      }),
    );
    await expect(new AssemblyAiSpeechProvider(config()).transcribe(input)).rejects.toMatchObject({
      response: { code: 'SPEECH_MEDIA_INVALID' },
    });
    expect(fetchMock).toHaveBeenCalledTimes(3);
  });

  it('never leaks provider error text or the key', async () => {
    jest
      .spyOn(global, 'fetch')
      .mockResolvedValueOnce(audio())
      .mockResolvedValueOnce(json({ error: 'Invalid API key test-aai-key' }, 401));
    const error = await new AssemblyAiSpeechProvider(config())
      .transcribe(input)
      .catch((e: Error) => e);
    expect(error).toBeInstanceOf(ServiceUnavailableException);
    expect(JSON.stringify((error as ServiceUnavailableException).getResponse())).not.toContain(
      'test-aai-key',
    );
  });

  it('maps a provider-side transcription error and an empty transcript to distinct failures', async () => {
    jest
      .spyOn(global, 'fetch')
      .mockResolvedValueOnce(audio())
      .mockResolvedValueOnce(json({ upload_url: 'https://cdn.assemblyai.test/u1' }))
      .mockResolvedValueOnce(json({ id: 't1' }))
      .mockResolvedValueOnce(json({ id: 't1', status: 'error', error: 'internal detail' }));
    await expect(new AssemblyAiSpeechProvider(config()).transcribe(input)).rejects.toMatchObject({
      response: { code: 'SPEECH_PROVIDER_FAILED' },
    });
    jest.restoreAllMocks();
    jest
      .spyOn(global, 'fetch')
      .mockResolvedValueOnce(audio())
      .mockResolvedValueOnce(json({ upload_url: 'https://cdn.assemblyai.test/u1' }))
      .mockResolvedValueOnce(json({ id: 't1' }))
      .mockResolvedValueOnce(json({ id: 't1', status: 'completed', text: '   ' }));
    await expect(new AssemblyAiSpeechProvider(config()).transcribe(input)).rejects.toMatchObject({
      response: { code: 'SPEECH_NO_SPEECH' },
    });
  });

  it('is bounded by the deadline when the provider never finishes', async () => {
    jest.spyOn(global, 'fetch').mockImplementation((url) => {
      if ((url as string).includes('/upload'))
        return Promise.resolve(json({ upload_url: 'https://cdn.assemblyai.test/u1' }));
      if ((url as string).endsWith('/transcript')) return Promise.resolve(json({ id: 't1' }));
      if ((url as string).includes('/transcript/'))
        return Promise.resolve(json({ id: 't1', status: 'processing' }));
      return Promise.resolve(audio());
    });
    const started = Date.now();
    await expect(
      new AssemblyAiSpeechProvider(config({ speechProviderTimeoutMs: 1200 })).transcribe(input),
    ).rejects.toBeInstanceOf(ServiceUnavailableException);
    expect(Date.now() - started).toBeLessThan(6000);
  });
});

const liveKey = process.env.ASSEMBLYAI_LIVE_KEY;
const liveAudio = process.env.ASSEMBLYAI_LIVE_AUDIO_EN;
(liveKey && liveAudio ? describe : describe.skip)(
  'AssemblyAiSpeechProvider (REAL AssemblyAI API)',
  () => {
    let server: Server, url: string;
    beforeAll(async () => {
      const wav = readFileSync(liveAudio!);
      server = createServer((_req, res) => {
        res.writeHead(200, { 'content-type': 'audio/wav', 'content-length': wav.length });
        res.end(wav);
      });
      await new Promise<void>((resolve) => server.listen(0, '127.0.0.1', resolve));
      url = `http://127.0.0.1:${(server.address() as AddressInfo).port}/a.wav`;
    });
    afterAll(() => new Promise<void>((resolve) => server.close(() => resolve())));

    it('transcribes real English speech accurately with high confidence', async () => {
      const result = await new AssemblyAiSpeechProvider(
        config({ assemblyAiApiKey: liveKey, speechProviderTimeoutMs: 30000 }),
      ).transcribe({ audioUrl: url, language: 'en' });
      expect(result.text.toLowerCase()).toContain('sow wheat');
      expect(result.usage!.confidence).toBeGreaterThan(0.9);
    }, 60000);

    it('rejects a wrong key without leaking it', async () => {
      const error = await new AssemblyAiSpeechProvider(
        config({ assemblyAiApiKey: 'definitely-not-a-valid-key', speechProviderTimeoutMs: 30000 }),
      )
        .transcribe({ audioUrl: url, language: 'en' })
        .catch((e: Error) => e);
      expect(error).toBeInstanceOf(ServiceUnavailableException);
    }, 60000);
  },
);

import { Injectable, ServiceUnavailableException } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import type {
  SpeechCapabilities,
  SpeechLanguage,
  SpeechResult,
  SpeechToTextProvider,
} from './speech.provider';
import { VOICE_CONSENT_VERSION } from './speech.provider';

const BASE = 'https://api.assemblyai.com/v2';
// Languages verified against the live API: the codes are accepted and Hindi/Urdu return script text.
const CODES: Record<SpeechLanguage, string> = { en: 'en', ur: 'ur', hi: 'hi' };
// Only formats the media policy can validate (codec and duration); browsers convert to WAV first.
const AUDIO_TYPES = ['audio/wav', 'audio/ogg'];
const MAX_INPUT_BYTES = 25 * 1024 * 1024;
const POLL_MS = 1500;

const unavailable = (code: string, message: string): ServiceUnavailableException =>
  new ServiceUnavailableException({ code, message });

interface Transcript {
  id?: string;
  status?: string;
  text?: string | null;
  error?: string;
  audio_duration?: number;
  confidence?: number;
  speech_model?: string;
}

/**
 * AssemblyAI speech-to-text. Audio is read from our private signed URL and uploaded as bytes, so
 * AssemblyAI never needs network access to our storage. The key stays in a header and is never logged.
 * It does not provide text-to-speech; playback uses a separate provider.
 */
@Injectable()
export class AssemblyAiSpeechProvider implements SpeechToTextProvider {
  constructor(private readonly config: ConfigService) {}

  capabilities(): SpeechCapabilities {
    const available = Boolean(this.key());
    return {
      available,
      provider: 'ASSEMBLYAI',
      sttLanguages: available ? ['en', 'ur', 'hi'] : [],
      ttsLanguages: [],
      acceptedContentTypes: AUDIO_TYPES,
      maxRecordingSeconds: 60,
      consentVersion: VOICE_CONSENT_VERSION,
      reason: available ? undefined : 'AssemblyAI credentials are not configured.',
    };
  }

  async transcribe(input: { audioUrl: string; language: SpeechLanguage }): Promise<SpeechResult> {
    const key = this.key();
    if (!key) throw unavailable('SPEECH_UNAVAILABLE', 'Speech transcription is not configured.');
    const deadline = AbortSignal.timeout(this.timeout());
    try {
      const audio = await this.readRecording(input.audioUrl, deadline);
      const upload = await this.json<{ upload_url?: string }>(
        await fetch(`${BASE}/upload`, {
          method: 'POST',
          headers: { authorization: key, 'content-type': 'application/octet-stream' },
          body: audio,
          signal: deadline,
        }),
      );
      if (!upload.upload_url) throw unavailable('SPEECH_PROVIDER_FAILED', 'Transcription failed.');
      const created = await this.json<Transcript>(
        await fetch(`${BASE}/transcript`, {
          method: 'POST',
          headers: { authorization: key, 'content-type': 'application/json' },
          body: JSON.stringify({
            audio_url: upload.upload_url,
            language_code: CODES[input.language],
          }),
          signal: deadline,
        }),
      );
      if (!created.id) throw unavailable('SPEECH_PROVIDER_FAILED', 'Transcription failed.');
      const done = await this.poll(created.id, key, deadline);
      const text = (done.text ?? '').trim();
      if (!text)
        throw unavailable('SPEECH_NO_SPEECH', 'No speech was detected. Please record again.');
      return {
        text,
        provider: 'ASSEMBLYAI',
        modelId: done.speech_model ?? 'assemblyai',
        modelVersion: 'v2',
        durationMs: done.audio_duration ? Math.round(done.audio_duration * 1000) : undefined,
        // Confidence lets the UI ask the farmer to check a doubtful transcript before sending it.
        usage: { confidence: Number((done.confidence ?? 0).toFixed(3)) },
      };
    } catch (error) {
      if (error instanceof ServiceUnavailableException) throw error;
      throw unavailable('SPEECH_PROVIDER_FAILED', 'Transcription is unavailable or timed out.');
    }
  }

  private async readRecording(url: string, signal: AbortSignal): Promise<ArrayBuffer> {
    const source = await fetch(url, { signal });
    if (!source.ok)
      throw unavailable('SPEECH_MEDIA_UNAVAILABLE', 'Voice recording could not be read.');
    const type = source.headers.get('content-type')?.split(';')[0]?.trim().toLowerCase();
    if (!type || !AUDIO_TYPES.includes(type))
      throw unavailable('SPEECH_MEDIA_INVALID', 'Voice recording format is unsupported.');
    if (Number(source.headers.get('content-length') ?? 0) > MAX_INPUT_BYTES)
      throw unavailable('SPEECH_MEDIA_INVALID', 'Voice recording is too large.');
    const body = await source.arrayBuffer();
    if (body.byteLength > MAX_INPUT_BYTES)
      throw unavailable('SPEECH_MEDIA_INVALID', 'Voice recording is too large.');
    return body;
  }

  private async poll(id: string, key: string, signal: AbortSignal): Promise<Transcript> {
    for (;;) {
      const current = await this.json<Transcript>(
        await fetch(`${BASE}/transcript/${encodeURIComponent(id)}`, {
          headers: { authorization: key },
          signal,
        }),
      );
      if (current.status === 'completed') return current;
      if (current.status === 'error')
        throw unavailable('SPEECH_PROVIDER_FAILED', 'Transcription failed.');
      await new Promise((resolve) => setTimeout(resolve, POLL_MS));
      if (signal.aborted) throw unavailable('SPEECH_PROVIDER_FAILED', 'Transcription timed out.');
    }
  }

  /** Never echo provider error bodies: they can contain request details. */
  private async json<T>(response: Response): Promise<T> {
    if (!response.ok) throw unavailable('SPEECH_PROVIDER_FAILED', 'Transcription failed.');
    return (await response.json().catch(() => ({}))) as T;
  }

  private key(): string {
    return this.config.get<string>('assemblyAiApiKey', '');
  }
  private timeout(): number {
    return this.config.get<number>('speechProviderTimeoutMs', 20_000);
  }
}

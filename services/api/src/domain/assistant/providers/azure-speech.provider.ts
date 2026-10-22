import { Injectable, ServiceUnavailableException } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import type {
  AudioResult,
  SpeechCapabilities,
  SpeechLanguage,
  SpeechResult,
  SpeechToTextProvider,
  TextToSpeechProvider,
} from './speech.provider';
import { VOICE_CONSENT_VERSION } from './speech.provider';

const LOCALES: Record<SpeechLanguage, string> = { en: 'en-US', ur: 'ur-PK', hi: 'hi-IN' };
const VOICES: Record<SpeechLanguage, string> = {
  en: 'en-US-JennyNeural',
  ur: 'ur-PK-UzmaNeural',
  hi: 'hi-IN-SwaraNeural',
};
// Azure's short-audio REST contract accepts PCM WAV and Ogg/Opus. Other upload
// formats remain valid for storage, but are not advertised as transcribable.
const AUDIO_TYPES = ['audio/ogg', 'audio/wav'];
const AZURE_CONTENT_TYPES: Record<string, string> = {
  'audio/ogg': 'audio/ogg; codecs=opus',
  'audio/wav': 'audio/wav; codecs=audio/pcm; samplerate=16000',
};
const MAX_INPUT_BYTES = 25 * 1024 * 1024;
const MAX_OUTPUT_BYTES = 10 * 1024 * 1024;

function unavailable(code: string, message: string): ServiceUnavailableException {
  return new ServiceUnavailableException({ code, message });
}

async function boundedBody(response: Response, maximum: number): Promise<ArrayBuffer> {
  const length = Number(response.headers.get('content-length') ?? 0);
  if (length > maximum)
    throw unavailable('SPEECH_RESPONSE_TOO_LARGE', 'Speech provider response is too large.');
  const body = await response.arrayBuffer();
  if (body.byteLength > maximum)
    throw unavailable('SPEECH_RESPONSE_TOO_LARGE', 'Speech provider response is too large.');
  return body;
}

function escapeXml(text: string): string {
  return text.replace(
    /[<>&"']/g,
    (character) =>
      ({ '<': '&lt;', '>': '&gt;', '&': '&amp;', '"': '&quot;', "'": '&apos;' })[character]!,
  );
}

@Injectable()
export class AzureSpeechProvider implements SpeechToTextProvider, TextToSpeechProvider {
  constructor(private readonly config: ConfigService) {}

  capabilities(): SpeechCapabilities {
    const available = Boolean(this.key() && this.region());
    return {
      available,
      provider: 'AZURE_SPEECH',
      sttLanguages: available ? ['en', 'ur', 'hi'] : [],
      ttsLanguages: available ? ['en', 'ur', 'hi'] : [],
      acceptedContentTypes: AUDIO_TYPES,
      maxRecordingSeconds: 60,
      consentVersion: VOICE_CONSENT_VERSION,
      reason: available ? undefined : 'Azure Speech credentials are not configured.',
    };
  }

  async transcribe(input: { audioUrl: string; language: SpeechLanguage }): Promise<SpeechResult> {
    this.assertConfigured();
    try {
      const source = await fetch(input.audioUrl, { signal: AbortSignal.timeout(this.timeout()) });
      if (!source.ok)
        throw unavailable('SPEECH_MEDIA_UNAVAILABLE', 'Voice recording could not be read.');
      const contentType = source.headers.get('content-type')?.split(';')[0]?.trim().toLowerCase();
      if (!contentType || !AUDIO_TYPES.includes(contentType))
        throw unavailable('SPEECH_MEDIA_INVALID', 'Voice recording format is unsupported.');
      const audio = await boundedBody(source, MAX_INPUT_BYTES);
      const response = await fetch(
        `${this.origin('stt')}/speech/recognition/conversation/cognitiveservices/v1?language=${LOCALES[input.language]}&format=detailed`,
        {
          method: 'POST',
          headers: {
            'Ocp-Apim-Subscription-Key': this.key(),
            'content-type': AZURE_CONTENT_TYPES[contentType]!,
          },
          body: audio,
          signal: AbortSignal.timeout(this.timeout()),
        },
      );
      if (!response.ok)
        throw unavailable('SPEECH_PROVIDER_UNAVAILABLE', 'Speech transcription is unavailable.');
      const raw = (await response.json()) as {
        RecognitionStatus?: string;
        NBest?: Array<{ Display?: string }>;
        Duration?: number;
      };
      const text = raw.NBest?.[0]?.Display?.trim();
      if (raw.RecognitionStatus !== 'Success' || !text)
        throw unavailable('SPEECH_NO_TRANSCRIPT', 'Speech provider returned no transcript.');
      return {
        text,
        provider: 'AZURE_SPEECH',
        modelId: `azure-speech-to-text-${LOCALES[input.language]}`,
        modelVersion: 'api',
        durationMs: raw.Duration ? Math.round(raw.Duration / 10_000) : undefined,
      };
    } catch (error) {
      if (error instanceof ServiceUnavailableException) throw error;
      throw unavailable(
        error instanceof Error && error.name === 'TimeoutError'
          ? 'SPEECH_PROVIDER_TIMEOUT'
          : 'SPEECH_PROVIDER_UNAVAILABLE',
        'Speech transcription is unavailable.',
      );
    }
  }

  async synthesize(input: { text: string; language: SpeechLanguage }): Promise<AudioResult> {
    this.assertConfigured();
    try {
      const locale = LOCALES[input.language];
      const response = await fetch(`${this.origin('tts')}/cognitiveservices/v1`, {
        method: 'POST',
        headers: {
          'Ocp-Apim-Subscription-Key': this.key(),
          'content-type': 'application/ssml+xml',
          'X-Microsoft-OutputFormat': 'audio-24khz-48kbitrate-mono-mp3',
        },
        body: `<speak version="1.0" xml:lang="${locale}"><voice name="${VOICES[input.language]}">${escapeXml(input.text)}</voice></speak>`,
        signal: AbortSignal.timeout(this.timeout()),
      });
      if (!response.ok)
        throw unavailable('SPEECH_PROVIDER_UNAVAILABLE', 'Speech synthesis is unavailable.');
      const audio = await boundedBody(response, MAX_OUTPUT_BYTES);
      if (!audio.byteLength)
        throw unavailable('SPEECH_NO_AUDIO', 'Speech provider returned no audio.');
      return {
        audioBase64: Buffer.from(audio).toString('base64'),
        contentType: 'audio/mpeg',
        provider: 'AZURE_SPEECH',
        modelId: VOICES[input.language],
        modelVersion: 'api',
      };
    } catch (error) {
      if (error instanceof ServiceUnavailableException) throw error;
      throw unavailable(
        error instanceof Error && error.name === 'TimeoutError'
          ? 'SPEECH_PROVIDER_TIMEOUT'
          : 'SPEECH_PROVIDER_UNAVAILABLE',
        'Speech synthesis is unavailable.',
      );
    }
  }

  private assertConfigured(): void {
    if (!this.key() || !this.region())
      throw unavailable('SPEECH_PROVIDER_NOT_CONFIGURED', 'Speech service is not configured.');
  }
  private key(): string {
    return this.config.get<string>('azureSpeechKey', '');
  }
  private region(): string {
    return this.config.get<string>('azureSpeechRegion', '');
  }
  private timeout(): number {
    return this.config.get<number>('speechProviderTimeoutMs', 20_000);
  }
  private origin(kind: 'stt' | 'tts'): string {
    return `https://${this.region()}.${kind}.speech.microsoft.com`;
  }
}

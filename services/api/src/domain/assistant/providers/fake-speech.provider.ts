import { Injectable, ServiceUnavailableException } from '@nestjs/common';
import type {
  AudioResult,
  SpeechCapabilities,
  SpeechLanguage,
  SpeechResult,
  SpeechToTextProvider,
  TextToSpeechProvider,
} from './speech.provider';
import { VOICE_CONSENT_VERSION } from './speech.provider';
@Injectable()
export class FakeSpeechProvider implements SpeechToTextProvider, TextToSpeechProvider {
  capabilities(): SpeechCapabilities {
    return {
      available: false,
      provider: 'FAKE',
      sttLanguages: [],
      ttsLanguages: [],
      acceptedContentTypes: [],
      maxRecordingSeconds: 120,
      consentVersion: VOICE_CONSENT_VERSION,
      reason: 'Real speech service is not configured.',
    };
  }
  transcribe(_input: { audioUrl: string; language: SpeechLanguage }): Promise<SpeechResult> {
    void _input;
    return Promise.reject(
      new ServiceUnavailableException({
        code: 'SPEECH_PROVIDER_NOT_CONFIGURED',
        message: 'Real speech service is not configured.',
      }),
    );
  }
  synthesize(input: { text: string; language: SpeechLanguage }): Promise<AudioResult> {
    void input;
    return Promise.reject(
      new ServiceUnavailableException({
        code: 'SPEECH_PROVIDER_NOT_CONFIGURED',
        message: 'Real speech service is not configured.',
      }),
    );
  }
}

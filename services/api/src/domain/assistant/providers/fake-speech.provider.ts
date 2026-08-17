import { Injectable } from '@nestjs/common';
import type {
  AudioResult,
  SpeechResult,
  SpeechToTextProvider,
  TextToSpeechProvider,
} from './speech.provider';
@Injectable()
export class FakeSpeechProvider implements SpeechToTextProvider, TextToSpeechProvider {
  transcribe(_input: { audioUrl: string; language?: string }): Promise<SpeechResult> {
    void _input;
    return Promise.resolve({
      text: 'Development voice transcript',
      provider: 'FAKE',
      modelId: 'fake-stt',
      modelVersion: '1',
    });
  }
  synthesize(input: { text: string }): Promise<AudioResult> {
    return Promise.resolve({
      audioBase64: Buffer.from(input.text).toString('base64'),
      contentType: 'audio/mpeg',
      provider: 'FAKE',
      modelId: 'fake-tts',
      modelVersion: '1',
    });
  }
}

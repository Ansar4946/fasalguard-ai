import { Injectable, ServiceUnavailableException } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import type {
  AudioResult,
  SpeechResult,
  SpeechToTextProvider,
  TextToSpeechProvider,
} from './speech.provider';
@Injectable()
export class QwenSpeechProvider implements SpeechToTextProvider, TextToSpeechProvider {
  constructor(private readonly config: ConfigService) {}
  async transcribe(input: { audioUrl: string; language?: string }): Promise<SpeechResult> {
    const raw = await this.call(this.config.get('qwenSttModel', 'qwen-audio-asr'), [
      {
        role: 'user',
        content: [
          { type: 'input_audio', input_audio: { url: input.audioUrl } },
          { type: 'text', text: `Transcribe only. Language hint: ${input.language ?? 'auto'}.` },
        ],
      },
    ]);
    const text = raw.choices?.[0]?.message?.content;
    if (typeof text !== 'string' || !text.trim())
      throw new ServiceUnavailableException('Speech provider returned no transcript.');
    return {
      text: text.trim(),
      provider: 'ALIBABA_QWEN',
      modelId: raw.model ?? 'qwen-audio-asr',
      modelVersion: 'api',
      usage: raw.usage,
    };
  }
  async synthesize(input: { text: string; language?: string }): Promise<AudioResult> {
    const key = this.config.get<string>('qwenApiKey', '');
    if (!key) throw new ServiceUnavailableException('Qwen speech credentials are not configured.');
    const response = await fetch(
      new URL(
        '/api/v1/services/aigc/multimodal-generation/generation',
        this.config.get('qwenBaseUrl'),
      ),
      {
        method: 'POST',
        headers: { authorization: `Bearer ${key}`, 'content-type': 'application/json' },
        body: JSON.stringify({
          model: this.config.get<string>('qwenTtsModel', 'qwen-tts'),
          input: { text: input.text, language: input.language ?? 'en' },
        }),
        signal: AbortSignal.timeout(30000),
      },
    );
    const body = (await response.json()) as {
      output?: { audio?: { data?: string; content_type?: string } };
      usage?: Record<string, number>;
    };
    if (!response.ok || !body.output?.audio?.data)
      throw new ServiceUnavailableException('Speech synthesis failed.');
    return {
      audioBase64: body.output.audio.data,
      contentType: body.output.audio.content_type ?? 'audio/mpeg',
      provider: 'ALIBABA_QWEN',
      modelId: this.config.get('qwenTtsModel', 'qwen-tts'),
      modelVersion: 'api',
      usage: body.usage,
    };
  }
  private async call(
    model: string,
    messages: unknown[],
  ): Promise<{
    model?: string;
    choices?: Array<{ message?: { content?: string } }>;
    usage?: Record<string, number>;
  }> {
    const key = this.config.get<string>('qwenApiKey', '');
    if (!key) throw new ServiceUnavailableException('Qwen speech credentials are not configured.');
    const response = await fetch(
      new URL('/compatible-mode/v1/chat/completions', this.config.get('qwenBaseUrl')),
      {
        method: 'POST',
        headers: { authorization: `Bearer ${key}`, 'content-type': 'application/json' },
        body: JSON.stringify({ model, messages, temperature: 0 }),
        signal: AbortSignal.timeout(30000),
      },
    );
    if (!response.ok) throw new ServiceUnavailableException('Speech transcription failed.');
    return response.json() as Promise<{
      model?: string;
      choices?: Array<{ message?: { content?: string } }>;
      usage?: Record<string, number>;
    }>;
  }
}

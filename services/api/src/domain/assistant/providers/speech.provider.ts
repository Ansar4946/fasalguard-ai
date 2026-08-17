export const SPEECH_TO_TEXT_PROVIDER = Symbol('SPEECH_TO_TEXT_PROVIDER');
export const TEXT_TO_SPEECH_PROVIDER = Symbol('TEXT_TO_SPEECH_PROVIDER');
export interface SpeechResult {
  text: string;
  provider: string;
  modelId: string;
  modelVersion: string;
  durationMs?: number;
  usage?: Record<string, number>;
}
export interface AudioResult {
  audioBase64: string;
  contentType: string;
  provider: string;
  modelId: string;
  modelVersion: string;
  usage?: Record<string, number>;
}
export interface SpeechToTextProvider {
  transcribe(input: { audioUrl: string; language?: string }): Promise<SpeechResult>;
}
export interface TextToSpeechProvider {
  synthesize(input: { text: string; language?: string }): Promise<AudioResult>;
}

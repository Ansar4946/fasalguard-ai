export const SPEECH_TO_TEXT_PROVIDER = Symbol('SPEECH_TO_TEXT_PROVIDER');
export const TEXT_TO_SPEECH_PROVIDER = Symbol('TEXT_TO_SPEECH_PROVIDER');
export const VOICE_CONSENT_VERSION = '2026-10-voice-v1';
export type SpeechLanguage = 'en' | 'ur' | 'hi';
export interface SpeechCapabilities {
  available: boolean;
  provider: string;
  sttLanguages: SpeechLanguage[];
  ttsLanguages: SpeechLanguage[];
  acceptedContentTypes: string[];
  maxRecordingSeconds: number;
  consentVersion: typeof VOICE_CONSENT_VERSION;
  reason?: string;
}
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
  transcribe(input: { audioUrl: string; language: SpeechLanguage }): Promise<SpeechResult>;
  capabilities(): SpeechCapabilities;
}
export interface TextToSpeechProvider {
  synthesize(input: { text: string; language: SpeechLanguage }): Promise<AudioResult>;
  capabilities(): SpeechCapabilities;
}

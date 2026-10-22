export const VOICE_LANGUAGES = ["ur", "hi", "en"] as const;
export type VoiceLanguage = (typeof VOICE_LANGUAGES)[number];

export interface VoiceCapabilities {
  available: boolean;
  sttLanguages: VoiceLanguage[];
  ttsLanguages: VoiceLanguage[];
  acceptedContentTypes: string[];
  maxRecordingSeconds: number;
  consentVersion: string;
  /** Server-held state of the current-version voice consent; absent on older API builds. */
  consentGranted: boolean;
  reason?: string;
}

const fallbackTypes = ["audio/webm;codecs=opus", "audio/webm", "audio/mp4"];

export function selectRecordingType(
  supported: (contentType: string) => boolean,
  accepted = fallbackTypes,
): string | null {
  return accepted.find((contentType) => supported(contentType)) ?? null;
}

export function parseVoiceCapabilities(
  value: unknown,
): VoiceCapabilities | null {
  if (!value || typeof value !== "object") return null;
  const raw = value as Record<string, unknown>;
  const languages = (candidate: unknown): VoiceLanguage[] =>
    Array.isArray(candidate)
      ? candidate.filter(
          (item): item is VoiceLanguage =>
            typeof item === "string" &&
            VOICE_LANGUAGES.includes(item as VoiceLanguage),
        )
      : [];
  const maxRecordingSeconds = Number(raw.maxRecordingSeconds);
  const consentVersion =
    typeof raw.consentVersion === "string" ? raw.consentVersion.trim() : "";
  const acceptedContentTypes = Array.isArray(raw.acceptedContentTypes)
    ? raw.acceptedContentTypes.filter(
        (item): item is string =>
          typeof item === "string" && item.startsWith("audio/"),
      )
    : [];
  if (
    typeof raw.available !== "boolean" ||
    !Number.isInteger(maxRecordingSeconds) ||
    maxRecordingSeconds < 1 ||
    maxRecordingSeconds > 300 ||
    !consentVersion
  )
    return null;
  return {
    available: raw.available,
    sttLanguages: languages(raw.sttLanguages),
    ttsLanguages: languages(raw.ttsLanguages),
    acceptedContentTypes,
    maxRecordingSeconds,
    consentVersion,
    consentGranted: raw.consentGranted === true,
    reason: typeof raw.reason === "string" ? raw.reason : undefined,
  };
}

export function recordingFileName(
  contentType: string,
  now = new Date(),
): string {
  const extension = contentType.includes("mp4") ? "m4a" : "webm";
  return `voice-${now.toISOString().replace(/[:.]/g, "-")}.${extension}`;
}

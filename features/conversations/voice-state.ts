/** Pure state machine and signal helpers for the voice question flow. */
export type VoicePhase =
  | "idle"
  | "requesting"
  | "recording"
  | "preparing"
  | "uploading"
  | "transcribing"
  | "review"
  | "error";

export type VoiceErrorKind =
  | "denied"
  | "no-mic"
  | "unsupported"
  | "format"
  | "empty"
  | "no-speech"
  | "too-short"
  | "too-long"
  | "provider"
  | "rate-limited"
  | "generic";

/**
 * Maps a failed transcription response to a localisable error kind. The raw server sentence is never
 * shown to the farmer (it is English only); only the kind is used.
 */
export function transcriptionErrorKind(
  status: number,
  code: string | undefined,
  message: string | undefined,
): VoiceErrorKind {
  const c = (code ?? "").toUpperCase();
  const m = (message ?? "").toLowerCase();
  if (status === 429 || c.includes("THROTTLE") || c.includes("RATE_LIMIT") || c.includes("TOO_MANY"))
    return "rate-limited";
  if (c === "SPEECH_NO_SPEECH" || c === "SPEECH_NO_TRANSCRIPT" || m.includes("no speech")) return "no-speech";
  if (c === "SPEECH_NO_AUDIO") return "empty";
  if (m.includes("too short")) return "too-short";
  if (m.includes("too long") || m.includes("too large") || c === "SPEECH_RESPONSE_TOO_LARGE") return "too-long";
  if (c === "SPEECH_MEDIA_INVALID" || m.includes("unsupported")) return "format";
  if (c === "SPEECH_UNAVAILABLE" || c.startsWith("SPEECH_PROVIDER") || c === "SPEECH_MEDIA_UNAVAILABLE" || status === 503)
    return "provider";
  return "generic";
}

export interface VoiceState {
  phase: VoicePhase;
  transcript: string;
  /** True once the farmer typed in the transcript; this cancels the automatic send. */
  edited: boolean;
  error: VoiceErrorKind | null;
  /** Server/provider message to show next to the generic error, if any. */
  detail: string | null;
}

export type VoiceEvent =
  | { type: "REQUEST" }
  | { type: "MIC_READY" }
  | { type: "STOP" }
  | { type: "PREPARED" }
  | { type: "UPLOADED" }
  | { type: "TRANSCRIBED"; text: string }
  | { type: "EDIT"; text: string }
  | { type: "FAIL"; kind: VoiceErrorKind; detail?: string }
  | { type: "RESET" };

export const initialVoiceState: VoiceState = {
  phase: "idle",
  transcript: "",
  edited: false,
  error: null,
  detail: null,
};

export const AUTO_SEND_DELAY_MS = 1500;
export const MAX_RECORDING_SECONDS = 60;

export function voiceReducer(state: VoiceState, event: VoiceEvent): VoiceState {
  switch (event.type) {
    case "REQUEST":
      return state.phase === "idle" || state.phase === "error" || state.phase === "review"
        ? { ...initialVoiceState, phase: "requesting" }
        : state;
    case "MIC_READY":
      return state.phase === "requesting" ? { ...state, phase: "recording" } : state;
    case "STOP":
      // Stopping while the permission prompt is open or while recording moves on to processing.
      return state.phase === "recording" ? { ...state, phase: "preparing" } : state;
    case "PREPARED":
      return state.phase === "preparing" ? { ...state, phase: "uploading" } : state;
    case "UPLOADED":
      return state.phase === "uploading" || state.phase === "preparing"
        ? { ...state, phase: "transcribing" }
        : state;
    case "TRANSCRIBED":
      if (state.phase !== "transcribing" && state.phase !== "uploading" && state.phase !== "preparing")
        return state;
      return event.text.trim()
        ? { ...initialVoiceState, phase: "review", transcript: event.text }
        : { ...initialVoiceState, phase: "error", error: "empty" };
    case "EDIT":
      return state.phase === "review"
        ? { ...state, transcript: event.text, edited: true }
        : state;
    case "FAIL":
      return { ...initialVoiceState, phase: "error", error: event.kind, detail: event.detail ?? null };
    case "RESET":
      return initialVoiceState;
  }
}

/** True while the automatic send timer should be running. */
export function shouldAutoSend(state: VoiceState): boolean {
  return state.phase === "review" && !state.edited && state.transcript.trim().length > 0;
}

/** Maps a getUserMedia failure name to a friendly error kind. */
export function micErrorKind(name: string | undefined): VoiceErrorKind {
  switch (name) {
    case "NotAllowedError":
    case "SecurityError":
    case "PermissionDeniedError":
      return "denied";
    case "NotFoundError":
    case "DevicesNotFoundError":
    case "OverconstrainedError":
      return "no-mic";
    default:
      return "generic";
  }
}

/**
 * Normalises one analyser frame (byte time-domain data, 128 = silence) to a 0..1 level.
 * RMS is boosted so normal speech fills most of the range, and clamped.
 */
export function normalizeLevel(frame: ArrayLike<number>, gain = 3): number {
  if (frame.length === 0) return 0;
  let sum = 0;
  for (let i = 0; i < frame.length; i += 1) {
    const centered = (frame[i] - 128) / 128;
    sum += centered * centered;
  }
  const rms = Math.sqrt(sum / frame.length);
  return Math.max(0, Math.min(1, rms * gain));
}

/** Appends a level to a fixed-length rolling history (oldest dropped). */
export function pushLevel(history: readonly number[], level: number, size: number): number[] {
  const next = history.length >= size ? history.slice(history.length - size + 1) : history.slice();
  while (next.length < size - 1) next.unshift(0);
  next.push(Math.max(0, Math.min(1, level)));
  return next;
}

/** Bar height in percent for a level, with a visible floor so the meter never vanishes. */
export function barHeightPercent(level: number): number {
  return Math.round(8 + Math.max(0, Math.min(1, level)) * 92);
}

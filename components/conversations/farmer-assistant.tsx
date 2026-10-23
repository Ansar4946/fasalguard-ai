"use client";

import { useCallback, useEffect, useReducer, useRef, useState } from "react";
import {
  parseVoiceCapabilities,
  recordingFileName,
  selectRecordingType,
  type VoiceCapabilities,
} from "@/features/conversations/voice-client";
import { recordingToWav } from "@/features/conversations/wav-encoder";
import { STRINGS, UI_DIR, type UiLang } from "@/features/conversations/strings";
import {
  AUTO_SEND_DELAY_MS,
  barHeightPercent,
  initialVoiceState,
  MAX_RECORDING_SECONDS,
  micErrorKind,
  normalizeLevel,
  pushLevel,
  shouldAutoSend,
  transcriptionErrorKind,
  voiceReducer,
  type VoiceErrorKind,
} from "@/features/conversations/voice-state";

type UploadAuthorization = {
  url: string;
  method?: string;
  headers?: Record<string, string>;
};

const BAR_COUNT = 28;
const FRAME_MS = 40;

function errorCode(value: unknown): string | undefined {
  const error = value && typeof value === "object" ? (value as { error?: unknown }).error : undefined;
  return error && typeof error === "object" && typeof (error as { code?: unknown }).code === "string"
    ? (error as { code: string }).code
    : undefined;
}

function errorMessage(value: unknown, fallback: string): string {
  if (!value || typeof value !== "object") return fallback;
  const error = (value as { error?: unknown }).error;
  return error &&
    typeof error === "object" &&
    typeof (error as { message?: unknown }).message === "string"
    ? (error as { message: string }).message
    : fallback;
}

class VoiceFailure extends Error {
  constructor(
    readonly kind: VoiceErrorKind,
    message?: string,
  ) {
    super(message);
  }
}

function MicIcon({ className = "h-8 w-8" }: { className?: string }) {
  return (
    <svg viewBox="0 0 24 24" className={className} fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
      <rect x="9" y="3" width="6" height="12" rx="3" />
      <path d="M5 11a7 7 0 0 0 14 0M12 18v3" />
    </svg>
  );
}
function StopIcon({ className = "h-7 w-7" }: { className?: string }) {
  return (
    <svg viewBox="0 0 24 24" className={className} fill="currentColor" aria-hidden="true">
      <rect x="6" y="6" width="12" height="12" rx="2" />
    </svg>
  );
}
function SpeakerIcon({ className = "h-7 w-7" }: { className?: string }) {
  return (
    <svg viewBox="0 0 24 24" className={className} fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
      <path d="M4 10v4h4l5 4V6L8 10H4z" fill="currentColor" />
      <path d="M16 9a4 4 0 0 1 0 6M18.5 6.5a8 8 0 0 1 0 11" />
    </svg>
  );
}

function Spinner() {
  return (
    <span
      className="inline-block h-7 w-7 animate-spin rounded-full border-4 border-white/40 border-t-white motion-reduce:animate-none"
      aria-hidden="true"
    />
  );
}

/** Live input-level bars. Real data from an AnalyserNode; not decorative. */
function Waveform({ levels, label }: { levels: readonly number[]; label: string }) {
  return (
    <div
      className="flex h-10 items-center justify-center gap-[3px] lg:h-14"
      role="img"
      aria-label={label}
      dir="ltr"
    >
      {levels.map((level, index) => (
        <span
          key={index}
          className="w-1 rounded-full bg-white/90 transition-[height] duration-75 lg:w-1.5"
          style={{ height: `${barHeightPercent(level)}%` }}
        />
      ))}
    </div>
  );
}

function SpeakingBars() {
  return (
    <div className="flex h-8 items-end gap-1" dir="ltr" aria-hidden="true">
      {[0, 150, 300, 450, 600].map((delay) => (
        <span
          key={delay}
          className="fg-orb-wave h-full w-1.5 rounded-full bg-emerald-200"
          style={{ animationDelay: `${delay}ms` }}
        />
      ))}
    </div>
  );
}

function AutoSendBar() {
  const [go, setGo] = useState(false);
  useEffect(() => {
    const frame = requestAnimationFrame(() => setGo(true));
    return () => cancelAnimationFrame(frame);
  }, []);
  return (
    <div className="mt-2 h-1.5 w-full overflow-hidden rounded-full bg-border" aria-hidden="true">
      <div
        className="h-full bg-brand"
        style={{ width: go ? "100%" : "0%", transition: `width ${AUTO_SEND_DELAY_MS}ms linear` }}
      />
    </div>
  );
}

export function FarmerAssistant({
  lang,
  thinking = false,
  speaking = false,
  onStopSpeaking,
  onSend,
}: {
  lang: UiLang;
  /** The assistant is working on an answer. */
  thinking?: boolean;
  /** The assistant is reading an answer aloud. */
  speaking?: boolean;
  onStopSpeaking?: () => void;
  /** Called with the (possibly edited) transcript, automatically after 1.5 s unless edited. */
  onSend?: (text: string) => void;
}) {
  const t = STRINGS[lang];
  const [capabilities, setCapabilities] = useState<VoiceCapabilities | null>(null);
  const [capsStatus, setCapsStatus] = useState<"loading" | "ready" | "failed">("loading");
  const [capsMessage, setCapsMessage] = useState<string | null>(null);
  const [consented, setConsented] = useState(false);
  const [busy, setBusy] = useState(false);
  const [note, setNote] = useState<string | null>(null);
  const [levels, setLevels] = useState<number[]>(() => new Array(BAR_COUNT).fill(0));
  const [elapsed, setElapsed] = useState(0);
  const [state, dispatch] = useReducer(voiceReducer, initialVoiceState);

  const recorder = useRef<MediaRecorder | null>(null);
  const stream = useRef<MediaStream | null>(null);
  const chunks = useRef<Blob[]>([]);
  const stopTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const tick = useRef<ReturnType<typeof setInterval> | null>(null);
  const raf = useRef<number | null>(null);
  const audioContext = useRef<AudioContext | null>(null);
  const langRef = useRef(lang);
  const capsRef = useRef<VoiceCapabilities | null>(null);
  const onSendRef = useRef(onSend);
  useEffect(() => {
    langRef.current = lang;
    capsRef.current = capabilities;
    onSendRef.current = onSend;
  });

  const releaseMedia = useCallback(() => {
    if (stopTimer.current) clearTimeout(stopTimer.current);
    if (tick.current) clearInterval(tick.current);
    if (raf.current !== null) cancelAnimationFrame(raf.current);
    stopTimer.current = null;
    tick.current = null;
    raf.current = null;
    stream.current?.getTracks().forEach((track) => track.stop());
    stream.current = null;
    void audioContext.current?.close().catch(() => undefined);
    audioContext.current = null;
  }, []);

  useEffect(() => {
    let active = true;
    fetch("/api/assistant/speech/capabilities", { cache: "no-store" })
      .then(async (response) => {
        const body: unknown = await response.json().catch(() => null);
        if (!response.ok) throw new Error(errorMessage(body, ""));
        const parsed = parseVoiceCapabilities(body);
        if (!parsed) throw new Error("");
        if (!active) return;
        setCapabilities(parsed);
        setConsented(parsed.consentGranted);
        setCapsStatus("ready");
        setCapsMessage(parsed.available ? null : (parsed.reason ?? null));
      })
      .catch((error: unknown) => {
        if (!active) return;
        setCapsStatus("failed");
        setCapsMessage(error instanceof Error && error.message ? error.message : null);
      });
    return () => {
      active = false;
      releaseMedia();
      const live = recorder.current;
      if (live) {
        live.ondataavailable = null;
        live.onstop = null;
        if (live.state === "recording") live.stop();
      }
    };
  }, [releaseMedia]);

  // Automatic send 1.5 s after the transcript appears, unless the farmer edits it.
  const autoSend = shouldAutoSend(state);
  useEffect(() => {
    if (!autoSend) return;
    const timer = setTimeout(() => {
      onSendRef.current?.(state.transcript.trim());
      dispatch({ type: "RESET" });
    }, AUTO_SEND_DELAY_MS);
    return () => clearTimeout(timer);
  }, [autoSend, state.transcript]);

  function sendNow() {
    const text = state.transcript.trim();
    if (!text) return;
    onSendRef.current?.(text);
    dispatch({ type: "RESET" });
  }

  async function updateConsent(granted: boolean): Promise<void> {
    if (!capabilities || busy) return;
    setBusy(true);
    setNote(null);
    try {
      const response = await fetch("/api/assistant/speech/consent", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ granted, consentVersion: capabilities.consentVersion }),
      });
      if (!response.ok) throw new Error(errorMessage(await response.json().catch(() => null), STRINGS[langRef.current].consentFailed));
      setConsented(granted);
      setNote(granted ? STRINGS[langRef.current].consentRecorded : STRINGS[langRef.current].consentRevoked);
    } catch (error) {
      setNote(error instanceof Error ? error.message : STRINGS[langRef.current].consentFailed);
    } finally {
      setBusy(false);
    }
  }

  async function transcribeRecording(blob: Blob): Promise<void> {
    const caps = capsRef.current;
    if (!blob.size) {
      dispatch({ type: "FAIL", kind: "empty" });
      return;
    }
    try {
      const presignResponse = await fetch("/api/uploads/presign", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({
          fileName: recordingFileName(blob.type),
          contentType: blob.type.split(";")[0],
          sizeBytes: blob.size,
          purpose: "voice-note",
        }),
      });
      const presign = (await presignResponse.json()) as {
        media?: { id?: string };
        upload?: UploadAuthorization;
      };
      if (!presignResponse.ok || !presign.media?.id || !presign.upload?.url)
        throw new VoiceFailure("generic", errorMessage(presign, ""));
      const uploaded = await fetch(presign.upload.url, {
        method: presign.upload.method ?? "PUT",
        headers: presign.upload.headers,
        body: blob,
      });
      if (!uploaded.ok) throw new VoiceFailure("generic");
      const completed = await fetch("/api/uploads/complete", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ mediaId: presign.media.id }),
      });
      if (!completed.ok)
        throw new VoiceFailure("generic", errorMessage(await completed.json().catch(() => null), ""));
      dispatch({ type: "UPLOADED" });
      const response = await fetch("/api/assistant/speech/transcribe", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({
          mediaAssetId: presign.media.id,
          language: langRef.current,
          consent: true,
          consentVersion: caps?.consentVersion,
        }),
      });
      const body = (await response.json().catch(() => null)) as { transcript?: string } | null;
      if (!response.ok)
        throw new VoiceFailure(
          transcriptionErrorKind(response.status, errorCode(body), errorMessage(body, "") || undefined),
        );
      dispatch({ type: "TRANSCRIBED", text: body?.transcript ?? "" });
    } catch (error) {
      dispatch({
        type: "FAIL",
        kind: error instanceof VoiceFailure ? error.kind : "generic",
        detail: error instanceof Error && error.message ? error.message : undefined,
      });
    }
  }

  function startMeter(mediaStream: MediaStream) {
    try {
      const Context =
        window.AudioContext ??
        (window as unknown as { webkitAudioContext?: typeof AudioContext }).webkitAudioContext;
      if (!Context) return;
      const context = new Context();
      audioContext.current = context;
      const analyser = context.createAnalyser();
      analyser.fftSize = 256;
      context.createMediaStreamSource(mediaStream).connect(analyser);
      const frame = new Uint8Array(analyser.fftSize);
      let last = 0;
      const loop = (time: number) => {
        raf.current = requestAnimationFrame(loop);
        if (time - last < FRAME_MS) return;
        last = time;
        analyser.getByteTimeDomainData(frame);
        const level = normalizeLevel(frame);
        setLevels((previous) => pushLevel(previous, level, BAR_COUNT));
      };
      raf.current = requestAnimationFrame(loop);
    } catch {
      // The meter is cosmetic; recording works without it.
    }
  }

  async function beginRecording(): Promise<void> {
    const caps = capabilities;
    if (!caps?.available || !consented || state.phase === "requesting" || state.phase === "recording") return;
    setNote(null);
    if (!navigator.mediaDevices?.getUserMedia || typeof MediaRecorder === "undefined") {
      dispatch({ type: "FAIL", kind: "unsupported" });
      return;
    }
    const supported = (candidate: string) => MediaRecorder.isTypeSupported(candidate);
    const direct = selectRecordingType(supported, caps.acceptedContentTypes);
    // Chrome/Android record WebM and Safari records MP4, which the server cannot validate. When the
    // server accepts WAV, record in the browser's own format and convert to 16 kHz mono WAV before upload.
    const convertToWav =
      !direct && caps.acceptedContentTypes.includes("audio/wav")
        ? (["audio/webm;codecs=opus", "audio/webm", "audio/mp4"].find(supported) ?? null)
        : null;
    const mimeType = direct ?? convertToWav;
    if (!mimeType) {
      dispatch({ type: "FAIL", kind: "format" });
      return;
    }
    dispatch({ type: "REQUEST" });
    try {
      const consentResponse = await fetch("/api/assistant/speech/consent", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ granted: true, consentVersion: caps.consentVersion }),
      });
      if (!consentResponse.ok)
        throw new VoiceFailure("generic", errorMessage(await consentResponse.json().catch(() => null), ""));
      let mediaStream: MediaStream;
      try {
        mediaStream = await navigator.mediaDevices.getUserMedia({ audio: true });
      } catch (error) {
        throw new VoiceFailure(micErrorKind(error instanceof DOMException ? error.name : undefined));
      }
      stream.current = mediaStream;
      chunks.current = [];
      const next = new MediaRecorder(mediaStream, { mimeType });
      recorder.current = next;
      next.ondataavailable = (event) => {
        if (event.data.size) chunks.current.push(event.data);
      };
      next.onstop = () => {
        releaseMedia();
        dispatch({ type: "STOP" });
        const recorded = new Blob(chunks.current, { type: mimeType });
        if (!convertToWav) {
          dispatch({ type: "PREPARED" });
          void transcribeRecording(recorded);
          return;
        }
        recordingToWav(recorded).then(
          (wav) => {
            dispatch({ type: "PREPARED" });
            void transcribeRecording(wav);
          },
          () => dispatch({ type: "FAIL", kind: "generic" }),
        );
      };
      const maxSeconds = Math.min(MAX_RECORDING_SECONDS, caps.maxRecordingSeconds);
      next.start(500);
      setElapsed(0);
      setLevels(new Array(BAR_COUNT).fill(0));
      const startedAt = Date.now();
      tick.current = setInterval(() => setElapsed((Date.now() - startedAt) / 1000), 250);
      stopTimer.current = setTimeout(() => next.state === "recording" && next.stop(), maxSeconds * 1000);
      startMeter(mediaStream);
      dispatch({ type: "MIC_READY" });
    } catch (error) {
      releaseMedia();
      dispatch({
        type: "FAIL",
        kind: error instanceof VoiceFailure ? error.kind : "generic",
        detail: error instanceof Error && error.message ? error.message : undefined,
      });
    }
  }

  function stopRecording(): void {
    if (recorder.current?.state === "recording") recorder.current.stop();
  }

  async function playDraft(): Promise<void> {
    const caps = capabilities;
    const text = state.transcript.trim();
    if (!caps || !caps.ttsLanguages.includes(lang) || !text) return;
    setBusy(true);
    setNote(null);
    try {
      const response = await fetch("/api/assistant/speech/synthesize", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ text, language: lang, consentVersion: caps.consentVersion }),
      });
      const body = (await response.json()) as { audioBase64?: string; contentType?: string };
      if (!response.ok || !body.audioBase64 || !body.contentType)
        throw new Error(errorMessage(body, t.errGeneric));
      await new Audio(`data:${body.contentType};base64,${body.audioBase64}`).play();
    } catch (error) {
      setNote(error instanceof Error ? error.message : t.errGeneric);
    } finally {
      setBusy(false);
    }
  }

  const ready = Boolean(capabilities?.available && capabilities.sttLanguages.includes(lang));
  const recording = state.phase === "recording";
  const processing = ["preparing", "uploading", "transcribing"].includes(state.phase);
  const maxSeconds = Math.min(MAX_RECORDING_SECONDS, capabilities?.maxRecordingSeconds ?? MAX_RECORDING_SECONDS);

  // What the status line and orb show. Thinking and speaking come from the chat.
  const display = thinking
    ? "thinking"
    : speaking
      ? "speaking"
      : state.phase === "review"
        ? "review"
        : state.phase;
  const statusText: Record<string, string> = {
    idle: t.stateIdle,
    requesting: t.stateRequesting,
    recording: t.stateRecording,
    preparing: t.statePreparing,
    uploading: t.stateUploading,
    transcribing: t.stateTranscribing,
    thinking: t.stateThinking,
    speaking: t.stateSpeaking,
    review: t.stateReview,
    error: t.stateError,
  };
  const errorText: Record<VoiceErrorKind, string> = {
    denied: t.errDenied,
    "no-mic": t.errNoMic,
    unsupported: t.errUnsupported,
    format: t.errFormat,
    empty: t.errEmpty,
    "no-speech": t.errNoSpeech,
    "too-short": t.errTooShort,
    "too-long": t.errTooLong,
    provider: t.errProvider,
    "rate-limited": t.errRateLimited,
    generic: t.errGeneric,
  };
  const canRetry =
    state.error === "denied" ||
    state.error === "empty" ||
    state.error === "no-speech" ||
    state.error === "too-short" ||
    state.error === "too-long" ||
    state.error === "provider" ||
    state.error === "generic";

  let setupMessage: string | null = null;
  if (capsStatus === "loading") setupMessage = t.checkingVoice;
  else if (capsStatus === "failed" || !capabilities?.available) setupMessage = capsMessage ?? t.voiceUnavailable;
  else if (!ready) setupMessage = t.voiceUnavailable;
  else if (!consented) setupMessage = t.consentNeeded;

  const micDisabled = !ready || !consented || busy || processing || state.phase === "requesting";

  const orbTone = recording
    ? "from-rose-400 to-red-600 shadow-[0_0_40px_rgba(239,68,68,.55)]"
    : thinking
      ? "from-amber-300 to-orange-500 shadow-[0_0_36px_rgba(245,158,11,.5)]"
      : "from-emerald-300 to-emerald-600 shadow-[0_0_36px_rgba(52,211,153,.5)]";
  const haloTone = recording ? "bg-red-400/40" : thinking ? "bg-amber-300/40" : "bg-emerald-300/40";
  const orbBusy = processing || state.phase === "requesting" || thinking;
  const orbClass = `relative z-10 flex h-16 w-16 items-center justify-center rounded-full bg-gradient-to-br text-white ring-4 ring-white/25 transition active:scale-95 disabled:opacity-50 lg:h-32 lg:w-32 lg:ring-8 ${orbTone}`;

  return (
    <section
      className="overflow-hidden rounded-3xl border border-white/10 bg-gradient-to-br from-[#03452c] via-[#075f3d] to-[#0b7a4d] p-3 text-white shadow-[0_18px_50px_rgba(3,69,44,.35)] lg:p-6"
      aria-labelledby="voice-heading"
      dir={UI_DIR[lang]}
      lang={lang}
    >
      <h2 id="voice-heading" className="sr-only lg:not-sr-only lg:text-xl lg:font-extrabold">
        {t.voiceTitle}
      </h2>
      <p className="hidden text-sm leading-6 text-white/75 lg:mt-1 lg:block">{t.voiceHint}</p>

      <div className="flex items-center gap-4 lg:mt-6 lg:flex-col lg:gap-4 lg:text-center">
        <div className="relative flex h-20 w-20 shrink-0 items-center justify-center lg:h-44 lg:w-44">
          <span className={`fg-orb-halo absolute inset-0 rounded-full ${haloTone}`} aria-hidden="true" />
          {recording && (
            <span className="absolute inset-1 animate-ping rounded-full bg-red-400/30 motion-reduce:animate-none" aria-hidden="true" />
          )}
          {speaking && !thinking ? (
            <button type="button" onClick={onStopSpeaking} aria-label={t.stop} className={orbClass}>
              <StopIcon className="h-6 w-6 lg:h-10 lg:w-10" />
            </button>
          ) : (
            <button
              type="button"
              onClick={recording ? stopRecording : () => void beginRecording()}
              disabled={recording ? false : micDisabled || thinking}
              aria-label={recording ? t.stopRecording : t.startRecording}
              className={orbClass}
            >
              {recording ? (
                <StopIcon className="h-6 w-6 lg:h-10 lg:w-10" />
              ) : orbBusy ? (
                <Spinner />
              ) : (
                <MicIcon className="h-7 w-7 lg:h-12 lg:w-12" />
              )}
            </button>
          )}
        </div>

        <div className="min-w-0 flex-1 lg:w-full lg:flex-none">
          <p
            role="status"
            aria-live="polite"
            className={`min-h-6 text-base font-bold lg:text-lg ${display === "error" ? "text-red-200" : "text-white"}`}
          >
            {display === "idle" && setupMessage ? setupMessage : statusText[display]}
          </p>
          {recording && (
            <div className="mt-1">
              <Waveform levels={levels} label={t.levelMeter} />
              <p className="font-mono text-sm font-bold text-red-100" dir="ltr">
                {t.elapsed(elapsed, maxSeconds)}
              </p>
            </div>
          )}
          {speaking && !thinking && (
            <div className="mt-1 flex lg:justify-center">
              <SpeakingBars />
            </div>
          )}
          {display === "idle" && !setupMessage && (
            <p className="text-xs text-white/70">{t.maxTime(maxSeconds)}</p>
          )}
        </div>
      </div>

      <label className="mt-3 flex min-h-10 items-start gap-3 rounded-2xl bg-white/10 p-2.5 text-xs leading-5 text-white/90 lg:mt-5 lg:text-sm">
        <input
          type="checkbox"
          checked={consented}
          onChange={(event) => void updateConsent(event.target.checked)}
          disabled={!capabilities || busy || recording || processing}
          className="mt-0.5 h-5 w-5 shrink-0 accent-emerald-400"
        />
        <span>{t.consentLabel}</span>
      </label>

      {state.phase === "error" && state.error && (
        <div className="mt-3 rounded-2xl bg-white p-3 text-sm font-semibold text-danger" role="alert">
          <p>{errorText[state.error]}</p>
          <div className="mt-2 flex flex-wrap gap-2">
            {canRetry && (
              <button
                type="button"
                onClick={() => void beginRecording()}
                disabled={micDisabled}
                className="min-h-11 rounded-xl border border-danger px-4 font-bold disabled:opacity-50"
              >
                {t.retry}
              </button>
            )}
          </div>
        </div>
      )}

      {state.phase === "review" && (
        <div className="mt-3 rounded-2xl bg-white p-4 text-foreground">
          <label htmlFor="voice-transcript" className="text-sm font-extrabold text-brand-dark">
            {t.transcriptLabel}
          </label>
          <textarea
            id="voice-transcript"
            value={state.transcript}
            onChange={(event) => dispatch({ type: "EDIT", text: event.target.value })}
            maxLength={4000}
            rows={3}
            dir="auto"
            placeholder={t.transcriptPlaceholder}
            className="mt-2 w-full rounded-xl border border-border bg-surface-soft p-3 text-base leading-7 focus:border-brand"
          />
          {autoSend ? (
            <>
              <p className="mt-2 text-xs font-semibold text-brand-dark" aria-live="polite">
                {t.autoSending}
              </p>
              <AutoSendBar />
            </>
          ) : (
            <p className="mt-2 text-xs font-semibold text-muted" aria-live="polite">
              {t.autoSendOff}
            </p>
          )}
          <div className="mt-3 flex flex-wrap gap-2">
            <button
              type="button"
              onClick={sendNow}
              disabled={!state.transcript.trim()}
              className="min-h-11 rounded-xl bg-brand px-5 font-extrabold text-white disabled:opacity-50"
            >
              {t.sendNow}
            </button>
            <button
              type="button"
              onClick={() => void beginRecording()}
              disabled={micDisabled}
              className="min-h-11 rounded-xl border border-brand px-4 font-bold text-brand-dark disabled:opacity-50"
            >
              {t.recordAgain}
            </button>
            {capabilities?.ttsLanguages.includes(lang) && (
              <button
                type="button"
                onClick={() => void playDraft()}
                disabled={busy || !state.transcript.trim()}
                className="flex min-h-11 items-center gap-2 rounded-xl border border-brand px-4 font-bold text-brand-dark disabled:opacity-50"
              >
                <SpeakerIcon className="h-5 w-5" />
                {t.playTranscript}
              </button>
            )}
          </div>
        </div>
      )}

      {note && (
        <p className="mt-3 rounded-xl bg-amber-50 p-3 text-sm text-amber-950" role="status">
          {note}
        </p>
      )}
      <p className="mt-3 hidden rounded-xl bg-black/15 px-4 py-3 text-xs leading-5 text-white/80 lg:block">
        {t.transcriptWarning}
      </p>
    </section>
  );
}

"use client";

import { useEffect, useRef, useState } from "react";
import {
  parseVoiceCapabilities,
  recordingFileName,
  selectRecordingType,
  type VoiceCapabilities,
  type VoiceLanguage,
} from "@/features/conversations/voice-client";
import { recordingToWav } from "@/features/conversations/wav-encoder";

type UploadAuthorization = {
  url: string;
  method?: string;
  headers?: Record<string, string>;
};
const languageNames: Record<VoiceLanguage, string> = {
  ur: "Urdu",
  hi: "Hindi",
  en: "English",
};

function errorMessage(value: unknown, fallback: string): string {
  if (!value || typeof value !== "object") return fallback;
  const error = (value as { error?: unknown }).error;
  return error &&
    typeof error === "object" &&
    typeof (error as { message?: unknown }).message === "string"
    ? (error as { message: string }).message
    : fallback;
}

export function FarmerAssistant({
  onTranscript,
}: {
  onTranscript?: (text: string) => void;
} = {}) {
  const [capabilities, setCapabilities] = useState<VoiceCapabilities | null>(
    null,
  );
  const [language, setLanguage] = useState<VoiceLanguage>("ur");
  const [consented, setConsented] = useState(false);
  const [recording, setRecording] = useState(false);
  const [busy, setBusy] = useState(false);
  const [draft, setDraft] = useState("");
  const [status, setStatus] = useState("Checking secure voice availability…");
  const recorder = useRef<MediaRecorder | null>(null);
  const stream = useRef<MediaStream | null>(null);
  const chunks = useRef<Blob[]>([]);
  const stopTimer = useRef<ReturnType<typeof setTimeout> | null>(null);

  useEffect(() => {
    let active = true;
    fetch("/api/assistant/speech/capabilities", { cache: "no-store" })
      .then(async (response) => {
        const body: unknown = await response.json().catch(() => null);
        if (!response.ok)
          throw new Error(errorMessage(body, "Voice service is unavailable."));
        const parsed = parseVoiceCapabilities(body);
        if (!parsed)
          throw new Error(
            "Voice service returned an invalid capability response.",
          );
        if (active) {
          setCapabilities(parsed);
          setConsented(parsed.consentGranted);
          setStatus(
            parsed.available
              ? parsed.consentGranted
                ? "Consent on file. Ready to record."
                : "Ready to record after consent."
              : (parsed.reason ?? "Real speech service is not configured."),
          );
        }
      })
      .catch(
        (error: unknown) =>
          active &&
          setStatus(
            error instanceof Error
              ? error.message
              : "Voice service is unavailable.",
          ),
      );
    return () => {
      active = false;
      if (stopTimer.current) clearTimeout(stopTimer.current);
      stream.current?.getTracks().forEach((track) => track.stop());
    };
  }, []);

  async function updateConsent(granted: boolean): Promise<void> {
    if (!capabilities || busy) return;
    setBusy(true);
    try {
      const response = await fetch("/api/assistant/speech/consent", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({
          granted,
          consentVersion: capabilities.consentVersion,
        }),
      });
      if (!response.ok)
        throw new Error(
          errorMessage(
            await response.json().catch(() => null),
            granted
              ? "Voice consent could not be recorded."
              : "Voice consent could not be revoked.",
          ),
        );
      setConsented(granted);
      setStatus(
        granted
          ? "Consent recorded. Ready to record."
          : "Voice-processing consent revoked.",
      );
    } catch (error) {
      setStatus(
        error instanceof Error
          ? error.message
          : "Voice consent could not be updated.",
      );
    } finally {
      setBusy(false);
    }
  }

  async function beginRecording(): Promise<void> {
    if (!capabilities?.available || !consented || busy) return;
    if (
      !navigator.mediaDevices?.getUserMedia ||
      typeof MediaRecorder === "undefined"
    ) {
      setStatus(
        "This browser cannot record audio. You can still type your question.",
      );
      return;
    }
    const supported = (candidate: string) => MediaRecorder.isTypeSupported(candidate);
    const direct = selectRecordingType(supported, capabilities.acceptedContentTypes);
    // Chrome/Android record WebM and Safari records MP4, which the server cannot validate. When the
    // server accepts WAV, record in the browser's own format and convert to 16 kHz mono WAV before upload.
    const convertToWav =
      !direct && capabilities.acceptedContentTypes.includes("audio/wav")
        ? (["audio/webm;codecs=opus", "audio/webm", "audio/mp4"].find(supported) ?? null)
        : null;
    const mimeType = direct ?? convertToWav;
    if (!mimeType) {
      setStatus("This browser does not support an accepted recording format.");
      return;
    }
    try {
      const consentResponse = await fetch("/api/assistant/speech/consent", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({
          granted: true,
          consentVersion: capabilities.consentVersion,
        }),
      });
      if (!consentResponse.ok)
        throw new Error(
          errorMessage(
            await consentResponse.json().catch(() => null),
            "Voice consent could not be recorded.",
          ),
        );
      const mediaStream = await navigator.mediaDevices.getUserMedia({
        audio: true,
      });
      stream.current = mediaStream;
      chunks.current = [];
      const next = new MediaRecorder(mediaStream, { mimeType });
      recorder.current = next;
      next.ondataavailable = (event) => {
        if (event.data.size) chunks.current.push(event.data);
      };
      next.onstop = () => {
        const recorded = new Blob(chunks.current, { type: mimeType });
        if (!convertToWav) {
          void transcribeRecording(recorded);
          return;
        }
        setBusy(true);
        setStatus("Preparing audio…");
        recordingToWav(recorded).then(
          (wav) => {
            setBusy(false);
            void transcribeRecording(wav);
          },
          () => {
            setBusy(false);
            setStatus("This browser could not prepare the recording. You can still type your question.");
          },
        );
      };
      next.start(500);
      setRecording(true);
      setStatus("Recording. Press Stop when finished.");
      stopTimer.current = setTimeout(
        () => next.state === "recording" && next.stop(),
        capabilities.maxRecordingSeconds * 1000,
      );
    } catch (error) {
      setStatus(
        error instanceof DOMException && error.name === "NotAllowedError"
          ? "Microphone permission was denied."
          : "Microphone could not be started.",
      );
    }
  }

  function stopRecording(): void {
    if (stopTimer.current) clearTimeout(stopTimer.current);
    if (recorder.current?.state === "recording") recorder.current.stop();
    stream.current?.getTracks().forEach((track) => track.stop());
    stream.current = null;
    setRecording(false);
  }

  async function transcribeRecording(blob: Blob): Promise<void> {
    setRecording(false);
    stream.current?.getTracks().forEach((track) => track.stop());
    stream.current = null;
    if (!blob.size) {
      setStatus("No audio was recorded. Please try again.");
      return;
    }
    setBusy(true);
    setStatus("Uploading and transcribing securely…");
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
        throw new Error(
          errorMessage(presign, "Voice upload could not be authorized."),
        );
      const uploaded = await fetch(presign.upload.url, {
        method: presign.upload.method ?? "PUT",
        headers: presign.upload.headers,
        body: blob,
      });
      if (!uploaded.ok) throw new Error("Voice recording upload failed.");
      const completed = await fetch("/api/uploads/complete", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ mediaId: presign.media.id }),
      });
      if (!completed.ok)
        throw new Error(
          errorMessage(
            await completed.json().catch(() => null),
            "Voice upload could not be verified.",
          ),
        );
      const response = await fetch("/api/assistant/speech/transcribe", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({
          mediaAssetId: presign.media.id,
          language,
          consent: true,
          consentVersion: capabilities?.consentVersion,
        }),
      });
      const body = (await response.json()) as { transcript?: string };
      if (!response.ok || !body.transcript)
        throw new Error(errorMessage(body, "Transcription failed."));
      setDraft(body.transcript);
      onTranscript?.(body.transcript);
      setStatus("Transcript ready. Review and edit it before sending.");
    } catch (error) {
      setStatus(
        error instanceof Error ? error.message : "Transcription failed.",
      );
    } finally {
      setBusy(false);
    }
  }

  async function playDraft(): Promise<void> {
    if (!capabilities?.ttsLanguages.includes(language) || !draft.trim()) return;
    setBusy(true);
    setStatus("Creating speech playback…");
    try {
      const response = await fetch("/api/assistant/speech/synthesize", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({
          text: draft.trim(),
          language,
          consentVersion: capabilities.consentVersion,
        }),
      });
      const body = (await response.json()) as {
        audioBase64?: string;
        contentType?: string;
      };
      if (!response.ok || !body.audioBase64 || !body.contentType)
        throw new Error(errorMessage(body, "Speech playback failed."));
      await new Audio(
        `data:${body.contentType};base64,${body.audioBase64}`,
      ).play();
      setStatus("Playing generated speech.");
    } catch (error) {
      setStatus(
        error instanceof Error ? error.message : "Speech playback failed.",
      );
    } finally {
      setBusy(false);
    }
  }

  const ready = Boolean(
    capabilities?.available && capabilities.sttLanguages.includes(language),
  );
  return (
    <main className="min-h-[calc(100dvh-4rem)] bg-[#f6f8fc] px-4 py-8 sm:px-7">
      <div className="mx-auto max-w-3xl rounded-3xl border border-brand/10 bg-white p-6 shadow-[0_14px_40px_rgba(15,45,32,.07)] sm:p-8">
        <p className="text-[10px] font-extrabold uppercase tracking-[.14em] text-brand">
          F08 · Multilingual Voice AI
        </p>
        <h1 className="mt-2 text-2xl font-extrabold text-brand-dark">
          Ask FasalGuard by voice
        </h1>
        <p className="mt-2 text-sm leading-6 text-muted">
          Record in Urdu, Hindi or English. Audio is sent to the configured
          speech provider only after explicit consent. Always review the
          transcript.
        </p>
        <div className="mt-6 grid gap-4 rounded-2xl bg-[#f5f8fc] p-4 sm:grid-cols-3">
          <label className="text-xs font-bold text-brand-dark">
            Language
            <select
              value={language}
              onChange={(event) =>
                setLanguage(event.target.value as VoiceLanguage)
              }
              className="mt-2 h-11 w-full rounded-xl border border-border bg-white px-3"
            >
              {Object.entries(languageNames).map(([code, name]) => (
                <option key={code} value={code}>
                  {name}
                </option>
              ))}
            </select>
          </label>
          <label className="flex items-start gap-3 text-xs leading-5 sm:col-span-2">
            <input
              type="checkbox"
              checked={consented}
              onChange={(event) => void updateConsent(event.target.checked)}
              disabled={!capabilities || busy || recording}
              className="mt-1"
            />
            <span>
              I consent to sending this recording to the configured speech
              provider for transcription. I can edit the transcript before using
              it.
            </span>
          </label>
        </div>
        <div className="mt-5 flex flex-wrap gap-3">
          <button
            type="button"
            disabled={!ready || !consented || busy}
            onClick={recording ? stopRecording : () => void beginRecording()}
            className={`min-h-11 rounded-xl px-5 text-xs font-extrabold text-white disabled:opacity-40 ${recording ? "bg-danger" : "bg-brand"}`}
          >
            {recording ? "Stop recording" : "Start recording"}
          </button>
          <button
            type="button"
            disabled={
              busy ||
              !draft.trim() ||
              !capabilities?.ttsLanguages.includes(language)
            }
            onClick={() => void playDraft()}
            className="min-h-11 rounded-xl border border-brand px-5 text-xs font-extrabold text-brand disabled:opacity-40"
          >
            Play transcript
          </button>
        </div>
        <p
          role="status"
          aria-live="polite"
          className="mt-3 text-xs font-semibold text-muted"
        >
          {status}
        </p>
        <label className="mt-6 block text-xs font-extrabold text-brand-dark">
          Editable transcript
          <textarea
            value={draft}
            onChange={(event) => setDraft(event.target.value)}
            maxLength={4000}
            rows={6}
            placeholder="Your real transcript will appear here. Roman Urdu remains editable."
            className="mt-2 w-full rounded-2xl border border-[#dbe5ef] bg-[#f5f8fc] p-4 text-sm leading-6 focus:border-brand focus:bg-white"
          />
        </label>
        <p className="mt-3 rounded-xl border border-amber-200 bg-amber-50 px-4 py-3 text-xs leading-5 text-amber-900">
          Transcription can contain mistakes, especially with crop names,
          accents and noise. No diagnosis or farm action is generated here.
        </p>
      </div>
    </main>
  );
}

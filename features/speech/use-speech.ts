"use client";

import { useCallback, useEffect, useRef, useState, useSyncExternalStore } from "react";
import { pickSpeechVoice, SPEECH_LOCALE, SPEECH_RATE, stripMarkdown, type SpeechLang } from "./speech-logic";

export interface UseSpeech {
  supported: boolean;
  speaking: boolean;
  speak(text: string, lang: "ur" | "en"): void;
  stop(): void;
}

const subscribeNothing = () => () => undefined;
const detectSupport = () =>
  typeof window !== "undefined" &&
  "speechSynthesis" in window &&
  typeof SpeechSynthesisUtterance !== "undefined";

/** Browser text-to-speech (on-device; the text never leaves the browser). */
export function useSpeech(): UseSpeech {
  const supported = useSyncExternalStore(subscribeNothing, detectSupport, () => false);
  const [speaking, setSpeaking] = useState(false);
  const voices = useRef<SpeechSynthesisVoice[]>([]);
  const current = useRef<SpeechSynthesisUtterance | null>(null);

  useEffect(() => {
    if (!detectSupport()) return;
    const synth = window.speechSynthesis;
    const load = () => {
      voices.current = synth.getVoices();
    };
    load();
    // Voices often load asynchronously (Chrome); refresh when the list changes.
    synth.addEventListener?.("voiceschanged", load);
    return () => {
      synth.removeEventListener?.("voiceschanged", load);
      synth.cancel();
    };
  }, []);

  const stop = useCallback(() => {
    current.current = null;
    if (detectSupport()) window.speechSynthesis.cancel();
    setSpeaking(false);
  }, []);

  const speak = useCallback((text: string, lang: SpeechLang) => {
    if (!detectSupport()) return;
    const clean = stripMarkdown(text);
    if (!clean) return;
    const synth = window.speechSynthesis;
    synth.cancel();
    if (voices.current.length === 0) voices.current = synth.getVoices();
    const utterance = new SpeechSynthesisUtterance(clean);
    const voice = pickSpeechVoice(voices.current, lang);
    if (voice) utterance.voice = voice;
    utterance.lang = voice?.lang ?? SPEECH_LOCALE[lang];
    utterance.rate = SPEECH_RATE;
    // A cancelled older utterance fires its end/error late; ignore anything that is not the current one.
    const finish = () => {
      if (current.current === utterance) setSpeaking(false);
    };
    utterance.onend = finish;
    utterance.onerror = finish;
    current.current = utterance;
    setSpeaking(true);
    synth.speak(utterance);
  }, []);

  return { supported, speaking, speak, stop };
}

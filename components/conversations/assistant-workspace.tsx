"use client";

import { useCallback, useRef, useState } from "react";
import { AssistantChat } from "@/components/conversations/assistant-chat";
import { FarmerAssistant } from "@/components/conversations/farmer-assistant";
import { STRINGS, UI_DIR, UI_LANGS, type UiLang } from "@/features/conversations/strings";

/**
 * Voice-first assistant. The language toggle switches the UI strings, the text direction of the
 * whole conversation region and the `language` sent to the backend. A voice transcript is sent
 * automatically 1.5 s after it appears unless the farmer edits it first.
 *
 * Layout: on phones the conversation fills the screen and the voice orb docks above the bottom
 * navigation (Siri-style). From `lg` up the orb is a sticky stage beside the conversation.
 */
export function AssistantWorkspace() {
  const [lang, setLang] = useState<UiLang>("ur");
  const [prefill, setPrefill] = useState<{ text: string; nonce: number } | null>(null);
  const [thinking, setThinking] = useState(false);
  const [speaking, setSpeaking] = useState(false);
  const stopSpeechRef = useRef<(() => void) | null>(null);
  const t = STRINGS[lang];
  const onStopSpeaking = useCallback(() => stopSpeechRef.current?.(), []);

  return (
    <div
      className="mx-auto w-full max-w-6xl space-y-3 px-3 pt-3 sm:px-5 lg:space-y-5 lg:px-7 lg:pt-6"
      dir={UI_DIR[lang]}
      lang={lang}
      data-testid="assistant-region"
    >
      <div className="flex items-center justify-between gap-3">
        <span id="assistant-lang-label" className="text-sm font-bold text-brand-dark">
          {t.langToggleLabel}
        </span>
        <div
          role="group"
          aria-labelledby="assistant-lang-label"
          className="inline-flex rounded-full border border-brand/20 bg-white p-0.5 shadow-sm"
        >
          {UI_LANGS.map((code) => (
            <button
              key={code}
              type="button"
              lang={code}
              aria-pressed={lang === code}
              onClick={() => setLang(code)}
              className={`min-h-10 min-w-20 rounded-full px-4 text-sm font-extrabold transition ${
                lang === code ? "bg-brand text-white shadow" : "text-brand-dark hover:bg-brand-soft/50"
              }`}
            >
              {code === "ur" ? t.langUr : t.langEn}
            </button>
          ))}
        </div>
      </div>

      <div className="flex flex-col gap-4 lg:grid lg:grid-cols-[22rem_minmax(0,1fr)] lg:items-start lg:gap-6">
        <div className="order-2 sticky bottom-[calc(5.25rem+env(safe-area-inset-bottom))] z-30 lg:order-none lg:top-24 lg:bottom-auto">
          <FarmerAssistant
            lang={lang}
            thinking={thinking}
            speaking={speaking}
            onStopSpeaking={onStopSpeaking}
            onSend={(text) =>
              setPrefill((current) => ({ text, nonce: (current?.nonce ?? 0) + 1 }))
            }
          />
        </div>
        <div className="order-1 min-w-0 lg:order-none">
          <AssistantChat
            lang={lang}
            prefill={prefill}
            onSendingChange={setThinking}
            onSpeakingChange={setSpeaking}
            speechRef={stopSpeechRef}
          />
        </div>
      </div>
    </div>
  );
}

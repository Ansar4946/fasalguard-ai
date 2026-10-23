"use client";

import { useCallback, useRef, useState } from "react";
import { AssistantChat } from "@/components/conversations/assistant-chat";
import { FarmerAssistant } from "@/components/conversations/farmer-assistant";
import { STRINGS, UI_DIR, UI_LANGS, type UiLang } from "@/features/conversations/strings";

/**
 * Voice-first assistant. The language toggle switches the UI strings, the text direction of the
 * whole conversation region and the `language` sent to the backend. A voice transcript is sent
 * automatically 1.5 s after it appears unless the farmer edits it first.
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
    <div className="space-y-6" dir={UI_DIR[lang]} lang={lang} data-testid="assistant-region">
      <div className="flex items-center justify-between gap-3">
        <span id="assistant-lang-label" className="text-sm font-bold text-brand-dark">
          {t.langToggleLabel}
        </span>
        <div
          role="group"
          aria-labelledby="assistant-lang-label"
          className="inline-flex rounded-full border border-brand bg-white p-1"
        >
          {UI_LANGS.map((code) => (
            <button
              key={code}
              type="button"
              lang={code}
              aria-pressed={lang === code}
              onClick={() => setLang(code)}
              className={`min-h-11 min-w-22 rounded-full px-4 text-base font-extrabold transition ${
                lang === code ? "bg-brand text-white" : "text-brand-dark"
              }`}
            >
              {code === "ur" ? t.langUr : t.langEn}
            </button>
          ))}
        </div>
      </div>
      <FarmerAssistant
        lang={lang}
        thinking={thinking}
        speaking={speaking}
        onStopSpeaking={onStopSpeaking}
        onSend={(text) =>
          setPrefill((current) => ({ text, nonce: (current?.nonce ?? 0) + 1 }))
        }
      />
      <AssistantChat
        lang={lang}
        prefill={prefill}
        onSendingChange={setThinking}
        onSpeakingChange={setSpeaking}
        speechRef={stopSpeechRef}
      />
    </div>
  );
}

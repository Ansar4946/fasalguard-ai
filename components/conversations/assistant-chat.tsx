"use client";

import { FormEvent, useEffect, useRef, useState } from "react";
import {
  briefingSpeech,
  newRequestId,
  parseBriefing,
  parseChatHistory,
  parseChatMessage,
  parseConversationId,
  parseLatestConversationId,
  type Briefing,
  type ChatLanguage,
  type ChatMessage,
} from "@/features/conversations/assistant-chat";
import { STRINGS, type UiLang } from "@/features/conversations/strings";
import { useSpeech } from "@/features/speech/use-speech";

type FarmOption = { id: string; name: string };
type HistoryState =
  | { status: "loading" }
  | { status: "ready" }
  | { status: "error"; message: string }
  | { status: "unauthorized" };
type PendingSend = { text: string; key: string; language: ChatLanguage };

/** Message ids/keys of the answer or briefing currently being read aloud. */
type SpeakKey = string | null;

class HttpError extends Error {
  constructor(
    message: string,
    readonly status: number,
  ) {
    super(message);
  }
}

async function request(path: string, init?: RequestInit): Promise<unknown> {
  const response = await fetch(path, { cache: "no-store", ...init });
  const body: unknown = await response.json().catch(() => null);
  if (!response.ok) {
    const message =
      body &&
      typeof body === "object" &&
      typeof (body as { error?: { message?: unknown } }).error?.message === "string"
        ? (body as { error: { message: string } }).error.message
        : "";
    throw new HttpError(message, response.status);
  }
  return body;
}

function parseFarms(value: unknown): FarmOption[] {
  if (!Array.isArray(value)) return [];
  return value.flatMap((row: unknown) => {
    if (!row || typeof row !== "object") return [];
    const { id, name } = row as { id?: unknown; name?: unknown };
    return typeof id === "string" && typeof name === "string" ? [{ id, name }] : [];
  });
}

export function AssistantChat({
  lang,
  prefill,
  onSendingChange,
  onSpeakingChange,
  speechRef,
}: {
  lang: UiLang;
  /** Submits the text immediately (voice flow, after the 1.5 s review in the voice panel). */
  prefill?: { text: string; nonce: number } | null;
  onSendingChange?: (sending: boolean) => void;
  onSpeakingChange?: (speaking: boolean) => void;
  /** Lets the voice panel stop the answer that is being read aloud. */
  speechRef?: { current: (() => void) | null };
}) {
  const t = STRINGS[lang];
  const language: ChatLanguage = lang;
  const [history, setHistory] = useState<HistoryState>({ status: "loading" });
  const [messages, setMessages] = useState<ChatMessage[]>([]);
  const [conversationId, setConversationId] = useState<string | null>(null);
  const [farms, setFarms] = useState<FarmOption[]>([]);
  const [farmId, setFarmId] = useState("");
  const [draft, setDraft] = useState("");
  const [sending, setSending] = useState(false);
  const [sendError, setSendError] = useState<string | null>(null);
  const [pending, setPending] = useState<PendingSend | null>(null);
  const mounted = useRef(true);
  const loadTicket = useRef(0);
  const endRef = useRef<HTMLDivElement>(null);
  const lastPrefill = useRef(0);
  const speech = useSpeech();
  const [speakKey, setSpeakKey] = useState<SpeakKey>(null);
  const speaking = speech.speaking ? speakKey : null;
  const [voiceNote, setVoiceNote] = useState<string | null>(null);
  const deliverRef = useRef<(item: PendingSend) => Promise<void>>(async () => undefined);
  const [briefing, setBriefing] = useState<Briefing | null>(null);
  const [briefingDismissed, setBriefingDismissed] = useState(false);

  useEffect(() => {
    mounted.current = true;
    const ticket = ++loadTicket.current;
    const current = () => mounted.current && ticket === loadTicket.current;
    request("/api/farms").then(
      (body) => {
        if (current()) setFarms(parseFarms(body));
      },
      () => undefined,
    );
    // Proactive card: unread warnings for the signed-in farmer. Failure just hides the card.
    request("/api/assistant/briefing").then(
      (body) => {
        if (current()) setBriefing(parseBriefing(body));
      },
      () => undefined,
    );
    (async () => {
      const list = parseLatestConversationId(await request("/api/assistant/conversations"));
      if (list === undefined) throw new Error("The conversation list was not understood.");
      if (list === null) return { id: null, items: [] as ChatMessage[] };
      const items = parseChatHistory(await request(`/api/assistant/conversations/${list}`));
      if (!items) throw new Error("The conversation history was not understood.");
      return { id: list, items };
    })().then(
      (result) => {
        if (!current()) return;
        setConversationId(result.id);
        setMessages(result.items);
        setHistory({ status: "ready" });
      },
      (reason: unknown) => {
        if (!current()) return;
        setHistory(
          reason instanceof HttpError && reason.status === 401
            ? { status: "unauthorized" }
            : {
                status: "error",
                message: reason instanceof Error ? reason.message : "",
              },
        );
      },
    );
    return () => {
      mounted.current = false;
    };
  }, []);

  // The hook cancels speech on unmount, so audio never outlives the page.
  const { stop: stopSpeech } = speech;
  useEffect(() => {
    onSpeakingChange?.(speech.speaking);
  }, [speech.speaking, onSpeakingChange]);
  useEffect(() => {
    onSendingChange?.(sending);
  }, [sending, onSendingChange]);
  useEffect(() => {
    if (!speechRef) return;
    speechRef.current = stopSpeech;
    return () => {
      speechRef.current = null;
    };
  }, [speechRef, stopSpeech]);

  useEffect(() => {
    if (prefill && prefill.nonce !== lastPrefill.current) {
      lastPrefill.current = prefill.nonce;
      void deliverRef.current({ text: prefill.text, key: newRequestId(), language });
    }
  }, [prefill, language]);

  useEffect(() => {
    endRef.current?.scrollIntoView?.({ block: "nearest" });
  }, [messages.length, sending]);

  async function deliver(item: PendingSend) {
    speech.stop();
    setSending(true);
    setSendError(null);
    try {
      let id = conversationId;
      if (!id) {
        const created = parseConversationId(
          await request("/api/assistant/conversations", {
            method: "POST",
            headers: { "content-type": "application/json" },
            body: JSON.stringify(farmId ? { farmId } : {}),
          }),
        );
        if (!created) throw new Error(t.conversationNotStarted);
        id = created;
        if (mounted.current) setConversationId(created);
      }
      const reply = parseChatMessage(
        await request(`/api/assistant/conversations/${id}/messages`, {
          method: "POST",
          headers: { "content-type": "application/json" },
          body: JSON.stringify({
            message: item.text,
            language: item.language,
            idempotencyKey: item.key,
          }),
        }),
      );
      if (!reply) throw new Error(t.replyNotUnderstood);
      if (!mounted.current) return;
      setMessages((existing) => [
        ...existing,
        {
          id: `local-${item.key}`,
          role: "USER",
          content: item.text,
          language: item.language,
          grounding: null,
          citations: [],
          sources: [],
        },
        reply,
      ]);
      setPending(null);
      setDraft("");
    } catch (reason) {
      if (!mounted.current) return;
      if (reason instanceof HttpError && reason.status === 401) {
        setHistory({ status: "unauthorized" });
        setPending(null);
        return;
      }
      setPending(item);
      setSendError(reason instanceof Error && reason.message ? reason.message : t.assistantUnavailable);
    } finally {
      if (mounted.current) setSending(false);
    }
  }

  useEffect(() => {
    deliverRef.current = deliver;
  });

  function onSubmit(event: FormEvent) {
    event.preventDefault();
    const text = draft.trim();
    if (!text || sending || history.status === "unauthorized") return;
    void deliver({ text, key: newRequestId(), language });
  }

  /** Reads text aloud with the on-device voice, only after a click. The text never leaves the browser. */
  function speak(key: string, text: string, target: ChatLanguage) {
    setVoiceNote(null);
    if (!speech.supported) {
      setVoiceNote(t.speechUnsupported);
      return;
    }
    if (speaking === key) {
      speech.stop();
      setSpeakKey(null);
      return;
    }
    setSpeakKey(key);
    speech.speak(text, target === "en" ? "en" : "ur");
  }

  function listen(message: ChatMessage) {
    speak(message.id, message.content, message.language ?? language);
  }

  function newConversation() {
    setConversationId(null);
    setMessages([]);
    setPending(null);
    setSendError(null);
  }

  const locked = conversationId !== null && messages.length > 0;
  const blocked = history.status === "unauthorized";
  return (
    <section
      className="flex flex-col overflow-hidden rounded-3xl border border-brand/10 bg-white shadow-[0_14px_40px_rgba(15,45,32,.08)]"
      aria-labelledby="chat-heading"
    >
      <header className="flex items-center gap-3 border-b border-brand/10 bg-gradient-to-r from-brand-soft/40 to-white px-4 py-3 lg:px-6 lg:py-4">
        <span
          aria-hidden="true"
          className="grid size-10 shrink-0 place-items-center rounded-2xl bg-gradient-to-br from-emerald-400 to-emerald-700 text-white shadow"
        >
          <svg viewBox="0 0 24 24" className="size-5" fill="currentColor">
            <path d="M12 2l1.8 5.2L19 9l-5.2 1.8L12 16l-1.8-5.2L5 9l5.2-1.8L12 2zm7 11l.9 2.6L22.5 16.5l-2.6.9L19 20l-.9-2.6-2.6-.9 2.6-.9L19 13z" />
          </svg>
        </span>
        <div className="min-w-0 flex-1">
          <h2 id="chat-heading" className="truncate text-lg font-extrabold text-brand-dark">
            {t.title}
          </h2>
          <p className="hidden truncate text-sm text-muted sm:block">{t.intro}</p>
        </div>
        <label className="flex shrink-0 items-center gap-2 text-xs font-bold text-muted">
          <span className="sr-only sm:not-sr-only">{t.farm}</span>
          <select
            value={farmId}
            onChange={(event) => setFarmId(event.target.value)}
            disabled={locked || sending}
            className="min-h-10 max-w-40 rounded-full border border-brand/20 bg-white px-3 text-sm font-semibold text-brand-dark"
          >
            <option value="">{t.noFarm}</option>
            {farms.map((farm) => (
              <option key={farm.id} value={farm.id}>
                {farm.name}
              </option>
            ))}
          </select>
        </label>
      </header>

      {briefing && !briefingDismissed && (
        <aside
          className="mx-4 mt-4 rounded-2xl border border-amber-200 bg-amber-50 p-4 lg:mx-6"
          aria-labelledby="briefing-heading"
          data-testid="warnings-card"
        >
          <div className="flex items-start justify-between gap-3">
            <h3 id="briefing-heading" className="text-base font-extrabold text-amber-950">
              {t.warningsTitle}
            </h3>
            <button
              type="button"
              onClick={() => setBriefingDismissed(true)}
              aria-label={t.dismissAria}
              className="min-h-10 min-w-10 rounded-xl border border-amber-400 px-3 text-sm font-bold text-amber-950"
            >
              {t.dismiss}
            </button>
          </div>
          {briefing.unreadTotal === 0 ? (
            <p className="mt-1 text-sm text-amber-950">{t.noWarnings}</p>
          ) : (
            <>
              <p className="mt-1 text-sm font-semibold text-amber-950">
                {t.unreadWarnings(
                  briefing.unreadTotal,
                  briefing.byCategory.map((c) => `${c.category.toLowerCase()} ${c.count}`).join(", "),
                )}
              </p>
              <ul className="mt-2 list-disc space-y-1 ps-5 text-sm text-amber-950">
                {briefing.top.map((item, index) => (
                  <li key={`${index}-${item.title}`} dir="auto">
                    {item.title}
                  </li>
                ))}
              </ul>
            </>
          )}
          <button
            type="button"
            onClick={() => speak("briefing", briefingSpeech(briefing, language), language)}
            aria-pressed={speaking === "briefing"}
            className="mt-3 min-h-10 rounded-full border border-amber-700 px-4 text-sm font-bold text-amber-950"
          >
            {speaking === "briefing" ? t.stop : t.readWarnings}
          </button>
        </aside>
      )}

      <div
        className="min-h-56 space-y-4 overflow-y-auto px-4 py-5 lg:max-h-[calc(100vh-17rem)] lg:min-h-[28rem] lg:px-6"
        aria-live="polite"
        aria-busy={history.status === "loading"}
      >
        {history.status === "loading" && (
          <p className="rounded-2xl bg-surface-soft p-4 text-sm text-muted">{t.loadingConversation}</p>
        )}
        {history.status === "error" && (
          <p className="rounded-2xl bg-red-50 p-4 text-sm font-semibold text-danger" role="alert">
            {t.historyUnavailable(history.message || t.assistantUnavailable)}
          </p>
        )}
        {history.status === "unauthorized" && (
          <p className="rounded-2xl bg-red-50 p-4 text-sm font-semibold text-danger" role="alert">
            {t.sessionEnded}
          </p>
        )}
        {history.status === "ready" && messages.length === 0 && (
          <p className="rounded-2xl bg-surface-soft p-4 text-sm leading-6 text-muted">{t.noQuestions}</p>
        )}
        {messages.map((message) => {
          const mine = message.role === "USER";
          return (
            <article
              key={message.id}
              className={`max-w-[88%] rounded-3xl px-4 py-3 shadow-sm lg:max-w-[78%] ${
                mine
                  ? "ms-auto rounded-ee-md bg-gradient-to-br from-brand to-emerald-700 text-white"
                  : "me-auto rounded-es-md border border-brand/10 bg-surface-soft text-foreground"
              }`}
            >
              <p className={`text-[11px] font-bold uppercase tracking-wide ${mine ? "text-white/70" : "text-muted"}`}>
                {mine ? t.you : t.assistant}
              </p>
              <p className="mt-1 whitespace-pre-wrap text-base leading-7" dir="auto">
                {message.content}
              </p>
              {message.role === "ASSISTANT" && message.grounding === "ACCOUNT_DATA" && (
                <p className="mt-3 flex flex-wrap items-center gap-2 text-xs">
                  <span
                    className="rounded-full bg-brand-dark px-3 py-1 font-bold text-white"
                    data-testid="account-chip"
                  >
                    {t.fromAccount}
                  </span>
                  {message.sources.map((source) => (
                    <span key={source.label} className="text-muted">
                      {source.label}
                    </span>
                  ))}
                </p>
              )}
              {message.role === "ASSISTANT" && message.grounding === "GROUNDED" && (
                <div className="mt-3 rounded-2xl bg-white/80 p-3 text-xs">
                  <p className="font-bold text-brand-dark">{t.sources}</p>
                  <ul className="mt-1 list-disc space-y-1 ps-5">
                    {message.citations.map((citation) => (
                      <li key={citation.id} dir="auto">
                        {citation.title} · {t.revision} {citation.revision}{" "}
                        <span className="font-mono text-[10px] text-muted" dir="ltr">
                          {citation.id}
                        </span>
                      </li>
                    ))}
                  </ul>
                </div>
              )}
              {message.role === "ASSISTANT" && (
                <button
                  type="button"
                  onClick={() => listen(message)}
                  aria-pressed={speaking === message.id}
                  className="mt-3 inline-flex min-h-10 items-center gap-2 rounded-full border border-brand/30 bg-white px-4 text-sm font-bold text-brand-dark transition hover:bg-brand-soft/50"
                >
                  <svg viewBox="0 0 24 24" className="size-4" fill="currentColor" aria-hidden="true">
                    <path d="M4 10v4h4l5 4V6L8 10H4z" />
                  </svg>
                  {speaking === message.id ? t.stop : t.listen}
                </button>
              )}
              {message.role === "ASSISTANT" && message.grounding === "ABSTAINED" && (
                <p className="mt-3 text-xs font-bold text-amber-900">{t.abstained}</p>
              )}
            </article>
          );
        })}
        {sending && (
          <div className="me-auto flex w-fit items-center gap-1.5 rounded-3xl rounded-es-md border border-brand/10 bg-surface-soft px-5 py-4" aria-hidden="true">
            {[0, 150, 300].map((delay) => (
              <span
                key={delay}
                className="size-2 rounded-full bg-brand"
                style={{ animation: "fg-dot 1.2s infinite", animationDelay: `${delay}ms` }}
              />
            ))}
          </div>
        )}
        <div ref={endRef} />
      </div>

      {voiceNote && (
        <p className="mx-4 mb-3 rounded-xl bg-amber-50 p-3 text-sm text-amber-950 lg:mx-6" role="status">
          {voiceNote}
        </p>
      )}

      {sendError && (
        <div className="mx-4 mb-3 rounded-xl bg-red-50 p-3 text-sm font-semibold text-danger lg:mx-6" role="alert">
          {sendError}
          {pending && (
            <button
              type="button"
              onClick={() => void deliver(pending)}
              disabled={sending}
              className="ms-3 min-h-10 rounded-xl border border-danger px-4 font-bold"
            >
              {t.retry}
            </button>
          )}
        </div>
      )}

      <div className="border-t border-brand/10 px-4 pt-3 lg:px-6" data-testid="starter-chips">
        <p className="text-xs font-bold text-muted">{t.starterTitle}</p>
        <div className="-mx-4 mt-2 flex gap-2 overflow-x-auto px-4 pb-2 lg:mx-0 lg:flex-wrap lg:overflow-visible lg:px-0">
          {t.starters.map((starter) => (
            <button
              key={starter}
              type="button"
              disabled={sending || blocked}
              onClick={() => void deliver({ text: starter, key: newRequestId(), language })}
              className="min-h-10 shrink-0 rounded-full border border-brand/25 bg-brand-soft/30 px-4 py-2 text-start text-sm font-semibold text-brand-dark transition hover:bg-brand-soft disabled:opacity-50"
            >
              {starter}
            </button>
          ))}
        </div>
      </div>

      <form onSubmit={onSubmit} className="flex items-end gap-2 px-4 pb-4 pt-2 lg:px-6 lg:pb-5">
        <label className="sr-only" htmlFor="assistant-question">
          {t.yourQuestion}
        </label>
        <textarea
          id="assistant-question"
          value={draft}
          onChange={(event) => setDraft(event.target.value)}
          onKeyDown={(event) => {
            if (event.key === "Enter" && !event.shiftKey && !event.nativeEvent.isComposing) {
              event.preventDefault();
              event.currentTarget.form?.requestSubmit();
            }
          }}
          maxLength={4000}
          rows={1}
          dir="auto"
          placeholder={t.yourQuestion}
          className="max-h-32 min-h-12 flex-1 resize-none rounded-3xl border border-brand/20 bg-surface-soft px-4 py-3 text-base outline-none focus:border-brand"
        />
        <button
          type="submit"
          disabled={sending || !draft.trim() || blocked}
          aria-label={sending ? t.asking : t.ask}
          className="grid size-12 shrink-0 place-items-center rounded-full bg-gradient-to-br from-brand to-emerald-600 text-white shadow transition active:scale-95 disabled:opacity-50"
        >
          <svg viewBox="0 0 24 24" className="size-5 rtl:-scale-x-100" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
            <path d="M5 12h14M13 6l6 6-6 6" />
          </svg>
        </button>
        {messages.length > 0 && (
          <button
            type="button"
            onClick={newConversation}
            disabled={sending}
            className="min-h-12 shrink-0 rounded-full border border-brand/30 px-4 text-sm font-bold text-brand-dark"
          >
            {t.newConversation}
          </button>
        )}
      </form>
    </section>
  );
}

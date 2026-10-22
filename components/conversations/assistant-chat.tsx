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
  return (
    <section
      className="rounded-3xl border border-border bg-surface p-5 shadow-sm"
      aria-labelledby="chat-heading"
    >
      <h2 id="chat-heading" className="text-xl font-extrabold text-brand-dark">
        {t.title}
      </h2>
      <p className="mt-1 text-sm leading-6 text-muted">{t.intro}</p>

      <div className="mt-4">
        <label className="text-sm font-bold">
          {t.farm}
          <select
            value={farmId}
            onChange={(event) => setFarmId(event.target.value)}
            disabled={locked || sending}
            className="mt-1 min-h-11 w-full rounded-xl border border-border bg-white px-3 font-normal"
          >
            <option value="">{t.noFarm}</option>
            {farms.map((farm) => (
              <option key={farm.id} value={farm.id}>
                {farm.name}
              </option>
            ))}
          </select>
        </label>
      </div>

      {briefing && !briefingDismissed && (
        <aside
          className="mt-4 rounded-2xl border border-amber-300 bg-amber-50 p-4"
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
              className="min-h-11 min-w-11 rounded-xl border border-amber-400 px-3 text-sm font-bold text-amber-950"
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
            className="mt-3 min-h-11 rounded-xl border border-amber-700 px-4 text-sm font-bold text-amber-950"
          >
            {speaking === "briefing" ? t.stop : t.readWarnings}
          </button>
        </aside>
      )}

      <div className="mt-4 min-h-40 space-y-3" aria-live="polite" aria-busy={history.status === "loading"}>
        {history.status === "loading" && (
          <p className="rounded-xl bg-surface-soft p-4 text-sm text-muted">{t.loadingConversation}</p>
        )}
        {history.status === "error" && (
          <p className="rounded-xl bg-red-50 p-4 text-sm font-semibold text-danger" role="alert">
            {t.historyUnavailable(history.message || t.assistantUnavailable)}
          </p>
        )}
        {history.status === "unauthorized" && (
          <p className="rounded-xl bg-red-50 p-4 text-sm font-semibold text-danger" role="alert">
            {t.sessionEnded}
          </p>
        )}
        {history.status === "ready" && messages.length === 0 && (
          <p className="rounded-xl bg-surface-soft p-4 text-sm text-muted">{t.noQuestions}</p>
        )}
        {messages.map((message) => (
          <article
            key={message.id}
            className={`rounded-2xl border p-4 ${message.role === "USER" ? "border-border bg-white" : "border-brand bg-brand-soft"}`}
          >
            <p className="text-xs font-bold uppercase tracking-wide text-muted">
              {message.role === "USER" ? t.you : t.assistant}
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
              <div className="mt-3 text-xs">
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
                className="mt-3 min-h-11 rounded-xl border border-brand px-4 text-sm font-bold text-brand-dark"
              >
                {speaking === message.id ? t.stop : t.listen}
              </button>
            )}
            {message.role === "ASSISTANT" && message.grounding === "ABSTAINED" && (
              <p className="mt-3 text-xs font-bold text-amber-900">{t.abstained}</p>
            )}
          </article>
        ))}
        <div ref={endRef} />
      </div>

      {voiceNote && (
        <p className="mt-3 rounded-xl bg-amber-50 p-3 text-sm text-amber-950" role="status">
          {voiceNote}
        </p>
      )}

      {sendError && (
        <div className="mt-3 rounded-xl bg-red-50 p-3 text-sm font-semibold text-danger" role="alert">
          {sendError}
          {pending && (
            <button
              type="button"
              onClick={() => void deliver(pending)}
              disabled={sending}
              className="ms-3 min-h-11 rounded-xl border border-danger px-4 font-bold"
            >
              {t.retry}
            </button>
          )}
        </div>
      )}

      <div className="mt-4" data-testid="starter-chips">
        <p className="text-xs font-bold text-muted">{t.starterTitle}</p>
        <div className="mt-2 flex flex-wrap gap-2">
          {t.starters.map((starter) => (
            <button
              key={starter}
              type="button"
              disabled={sending || history.status === "unauthorized"}
              onClick={() => void deliver({ text: starter, key: newRequestId(), language })}
              className="min-h-11 rounded-full border border-brand bg-white px-4 py-2 text-start text-sm font-semibold text-brand-dark disabled:opacity-50"
            >
              {starter}
            </button>
          ))}
        </div>
      </div>

      <form onSubmit={onSubmit} className="mt-4">
        <label className="text-sm font-bold" htmlFor="assistant-question">
          {t.yourQuestion}
        </label>
        <textarea
          id="assistant-question"
          value={draft}
          onChange={(event) => setDraft(event.target.value)}
          maxLength={4000}
          rows={3}
          dir="auto"
          className="mt-1 w-full rounded-xl border border-border bg-white p-3 text-base"
        />
        <div className="mt-3 flex flex-wrap gap-3">
          <button
            type="submit"
            disabled={sending || !draft.trim() || history.status === "unauthorized"}
            className="min-h-12 rounded-xl bg-brand px-6 font-extrabold text-white disabled:opacity-50"
          >
            {sending ? t.asking : t.ask}
          </button>
          {messages.length > 0 && (
            <button
              type="button"
              onClick={newConversation}
              disabled={sending}
              className="min-h-12 rounded-xl border border-brand px-5 font-bold text-brand-dark"
            >
              {t.newConversation}
            </button>
          )}
        </div>
      </form>
    </section>
  );
}

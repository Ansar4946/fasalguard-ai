"use client";

import { FormEvent, useEffect, useRef, useState } from "react";
import {
  briefingSpeech,
  CHAT_LANGUAGES,
  newRequestId,
  parseBriefing,
  parseChatHistory,
  parseChatMessage,
  parseConversationId,
  parseLatestConversationId,
  pickVoice,
  SPEECH_LANG,
  type Briefing,
  type ChatLanguage,
  type ChatMessage,
} from "@/features/conversations/assistant-chat";

type FarmOption = { id: string; name: string };
type HistoryState =
  | { status: "loading" }
  | { status: "ready" }
  | { status: "error"; message: string }
  | { status: "unauthorized" };
type PendingSend = { text: string; key: string; language: ChatLanguage };

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
        : "The assistant is unavailable right now.";
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
  prefill,
}: {
  prefill?: { text: string; nonce: number } | null;
}) {
  const [history, setHistory] = useState<HistoryState>({ status: "loading" });
  const [messages, setMessages] = useState<ChatMessage[]>([]);
  const [conversationId, setConversationId] = useState<string | null>(null);
  const [farms, setFarms] = useState<FarmOption[]>([]);
  const [farmId, setFarmId] = useState("");
  const [language, setLanguage] = useState<ChatLanguage>("en");
  const [draft, setDraft] = useState("");
  const [sending, setSending] = useState(false);
  const [sendError, setSendError] = useState<string | null>(null);
  const [pending, setPending] = useState<PendingSend | null>(null);
  const mounted = useRef(true);
  const loadTicket = useRef(0);
  const endRef = useRef<HTMLDivElement>(null);
  const lastPrefill = useRef(0);
  const [speaking, setSpeaking] = useState<string | null>(null);
  const [voiceNote, setVoiceNote] = useState<string | null>(null);
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
                message: reason instanceof Error ? reason.message : "History is unavailable.",
              },
        );
      },
    );
    return () => {
      mounted.current = false;
    };
  }, []);

  // Stop any speech when the panel goes away so audio never outlives the page.
  useEffect(() => {
    return () => {
      if (typeof window !== "undefined") window.speechSynthesis?.cancel();
    };
  }, []);

  useEffect(() => {
    if (prefill && prefill.nonce !== lastPrefill.current) {
      lastPrefill.current = prefill.nonce;
      setDraft(prefill.text);
    }
  }, [prefill]);

  useEffect(() => {
    endRef.current?.scrollIntoView?.({ block: "nearest" });
  }, [messages.length, sending]);

  async function deliver(item: PendingSend) {
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
        if (!created) throw new Error("The conversation could not be started.");
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
      if (!reply) throw new Error("The assistant reply was not understood. Nothing was assumed.");
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
      setSendError(reason instanceof Error ? reason.message : "The assistant is unavailable.");
    } finally {
      if (mounted.current) setSending(false);
    }
  }

  function onSubmit(event: FormEvent) {
    event.preventDefault();
    const text = draft.trim();
    if (!text || sending || history.status === "unauthorized") return;
    void deliver({ text, key: newRequestId(), language });
  }

  /** Reads text aloud with an on-device voice, only after a click. The text never leaves the browser. */
  function speak(key: string, text: string, target: ChatLanguage) {
    const synth = typeof window === "undefined" ? undefined : window.speechSynthesis;
    setVoiceNote(null);
    if (!synth) {
      setVoiceNote("This browser cannot read answers aloud.");
      return;
    }
    if (speaking === key) {
      synth.cancel();
      setSpeaking(null);
      return;
    }
    synth.cancel();
    const voice = pickVoice(synth.getVoices(), target);
    if (!voice) {
      setVoiceNote(
        `No ${CHAT_LANGUAGES[target]} voice is installed on this device. Read the answer on screen instead.`,
      );
      return;
    }
    const utterance = new SpeechSynthesisUtterance(text);
    utterance.voice = voice;
    utterance.lang = SPEECH_LANG[target];
    utterance.onend = () => setSpeaking((current) => (current === key ? null : current));
    utterance.onerror = () => setSpeaking(null);
    setSpeaking(key);
    synth.speak(utterance);
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
        Ask the agriculture assistant
      </h2>
      <p className="mt-1 text-sm text-muted">
        Farming answers use only approved guidance and cite their sources; if none applies, the
        assistant says so instead of guessing. Questions about your own farms, fields, crop
        seasons, confirmed expenses and notifications are answered from your account and tagged
        &ldquo;From your account&rdquo;. The assistant only reads your data and never changes it.
        It is not a substitute for an agriculture expert.
      </p>

      <div className="mt-4 grid gap-3 sm:grid-cols-2">
        <label className="text-sm font-bold">
          Farm
          <select
            value={farmId}
            onChange={(event) => setFarmId(event.target.value)}
            disabled={locked || sending}
            className="mt-1 min-h-11 w-full rounded-xl border border-border bg-white px-3 font-normal"
          >
            <option value="">No farm selected</option>
            {farms.map((farm) => (
              <option key={farm.id} value={farm.id}>
                {farm.name}
              </option>
            ))}
          </select>
        </label>
        <label className="text-sm font-bold">
          Language
          <select
            value={language}
            onChange={(event) => setLanguage(event.target.value as ChatLanguage)}
            disabled={sending}
            className="mt-1 min-h-11 w-full rounded-xl border border-border bg-white px-3 font-normal"
          >
            {Object.entries(CHAT_LANGUAGES).map(([code, name]) => (
              <option key={code} value={code}>
                {name}
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
              Warnings for you
            </h3>
            <button
              type="button"
              onClick={() => setBriefingDismissed(true)}
              aria-label="Dismiss warnings"
              className="min-h-11 min-w-11 rounded-xl border border-amber-400 px-3 text-sm font-bold text-amber-950"
            >
              Dismiss
            </button>
          </div>
          {briefing.unreadTotal === 0 ? (
            <p className="mt-1 text-sm text-amber-950">You have no unread warnings.</p>
          ) : (
            <>
              <p className="mt-1 text-sm font-semibold text-amber-950">
                {briefing.unreadTotal} unread {briefing.unreadTotal === 1 ? "warning" : "warnings"}
                {briefing.byCategory.length > 0 &&
                  ` (${briefing.byCategory.map((c) => `${c.category.toLowerCase()} ${c.count}`).join(", ")})`}
              </p>
              <ul className="mt-2 list-disc space-y-1 pl-5 text-sm text-amber-950">
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
            {speaking === "briefing" ? "Stop" : "Read my warnings"}
          </button>
        </aside>
      )}

      <div className="mt-4 min-h-40 space-y-3" aria-live="polite" aria-busy={history.status === "loading"}>
        {history.status === "loading" && (
          <p className="rounded-xl bg-surface-soft p-4 text-sm text-muted">Loading conversation…</p>
        )}
        {history.status === "error" && (
          <p className="rounded-xl bg-red-50 p-4 text-sm font-semibold text-danger" role="alert">
            Conversation history is unavailable: {history.message}
          </p>
        )}
        {history.status === "unauthorized" && (
          <p className="rounded-xl bg-red-50 p-4 text-sm font-semibold text-danger" role="alert">
            Your session has ended. Sign in again to use the assistant.
          </p>
        )}
        {history.status === "ready" && messages.length === 0 && (
          <p className="rounded-xl bg-surface-soft p-4 text-sm text-muted">
            No questions yet. Ask about your crop, in English, Urdu or Hindi.
          </p>
        )}
        {messages.map((message) => (
          <article
            key={message.id}
            className={`rounded-2xl border p-4 ${message.role === "USER" ? "border-border bg-white" : "border-brand bg-brand-soft"}`}
          >
            <p className="text-xs font-bold uppercase tracking-wide text-muted">
              {message.role === "USER" ? "You" : "Assistant"}
            </p>
            <p className="mt-1 whitespace-pre-wrap text-sm" dir="auto">
              {message.content}
            </p>
            {message.role === "ASSISTANT" && message.grounding === "ACCOUNT_DATA" && (
              <p className="mt-3 flex flex-wrap items-center gap-2 text-xs">
                <span
                  className="rounded-full bg-brand-dark px-3 py-1 font-bold text-white"
                  data-testid="account-chip"
                >
                  From your account
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
                <p className="font-bold text-brand-dark">Sources</p>
                <ul className="mt-1 list-disc space-y-1 pl-5">
                  {message.citations.map((citation) => (
                    <li key={citation.id} dir="auto">
                      {citation.title} · revision {citation.revision}{" "}
                      <span className="font-mono text-[10px] text-muted">{citation.id}</span>
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
                {speaking === message.id ? "Stop" : "Listen"}
              </button>
            )}
            {message.role === "ASSISTANT" && message.grounding === "ABSTAINED" && (
              <p className="mt-3 text-xs font-bold text-amber-900">
                No approved guidance found — this is not an answer. Ask an expert.
              </p>
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
              className="ml-3 min-h-11 rounded-xl border border-danger px-4 font-bold"
            >
              Retry
            </button>
          )}
        </div>
      )}

      <form onSubmit={onSubmit} className="mt-4">
        <label className="text-sm font-bold" htmlFor="assistant-question">
          Your question
        </label>
        <textarea
          id="assistant-question"
          value={draft}
          onChange={(event) => setDraft(event.target.value)}
          maxLength={4000}
          rows={3}
          dir="auto"
          className="mt-1 w-full rounded-xl border border-border bg-white p-3"
        />
        <div className="mt-3 flex flex-wrap gap-3">
          <button
            type="submit"
            disabled={sending || !draft.trim() || history.status === "unauthorized"}
            className="min-h-12 rounded-xl bg-brand px-6 font-extrabold text-white disabled:opacity-50"
          >
            {sending ? "Asking…" : "Ask"}
          </button>
          {messages.length > 0 && (
            <button
              type="button"
              onClick={newConversation}
              disabled={sending}
              className="min-h-12 rounded-xl border border-brand px-5 font-bold text-brand-dark"
            >
              New conversation
            </button>
          )}
        </div>
      </form>
    </section>
  );
}

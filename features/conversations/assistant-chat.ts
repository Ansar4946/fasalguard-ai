export type ChatLanguage = "en" | "ur" | "hi";
export const CHAT_LANGUAGES: Record<ChatLanguage, string> = {
  en: "English",
  ur: "اردو",
  hi: "हिन्दी",
};

export interface ChatCitation {
  id: string;
  title: string;
  revision: number;
}
/** Where an account answer came from. Distinct from an approved-knowledge citation. */
export interface ChatSource {
  type: "ACCOUNT_DATA";
  label: string;
}
export interface ChatMessage {
  id: string;
  role: "USER" | "ASSISTANT";
  content: string;
  language: ChatLanguage | null;
  grounding: "GROUNDED" | "ABSTAINED" | "ACCOUNT_DATA" | null;
  citations: ChatCitation[];
  sources: ChatSource[];
}

const uuid = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const isLanguage = (value: unknown): value is ChatLanguage =>
  value === "en" || value === "ur" || value === "hi";

function parseCitation(value: unknown): ChatCitation | null {
  if (!value || typeof value !== "object") return null;
  const row = value as Record<string, unknown>;
  if (
    typeof row.id !== "string" ||
    !uuid.test(row.id) ||
    typeof row.title !== "string" ||
    typeof row.revision !== "number" ||
    !Number.isInteger(row.revision)
  )
    return null;
  return { id: row.id, title: row.title, revision: row.revision };
}

function parseSource(value: unknown): ChatSource | null {
  if (!value || typeof value !== "object") return null;
  const row = value as Record<string, unknown>;
  return row.type === "ACCOUNT_DATA" &&
    typeof row.label === "string" &&
    row.label.length > 0 &&
    row.label.length <= 80
    ? { type: "ACCOUNT_DATA", label: row.label }
    : null;
}

/** Returns null for anything that is not a well-formed message, so callers can show an error. */
export function parseChatMessage(value: unknown): ChatMessage | null {
  if (!value || typeof value !== "object") return null;
  const row = value as Record<string, unknown>;
  if (
    typeof row.id !== "string" ||
    !uuid.test(row.id) ||
    (row.role !== "USER" && row.role !== "ASSISTANT") ||
    typeof row.content !== "string"
  )
    return null;
  const rawCitations = row.citations ?? [];
  if (!Array.isArray(rawCitations)) return null;
  const citations = rawCitations.map(parseCitation);
  if (citations.some((citation) => citation === null)) return null;
  const grounding =
    row.grounding === "GROUNDED" ||
    row.grounding === "ABSTAINED" ||
    row.grounding === "ACCOUNT_DATA"
      ? row.grounding
      : null;
  // An answer may be shown as grounded only if it actually carries citations.
  if (grounding === "GROUNDED" && citations.length === 0) return null;
  const rawSources = row.sources ?? [];
  if (!Array.isArray(rawSources)) return null;
  const sources = rawSources.map(parseSource);
  if (sources.some((source) => source === null)) return null;
  // The "From your account" tag needs a real source, and account answers carry no citations.
  if (grounding === "ACCOUNT_DATA" && (sources.length === 0 || citations.length > 0)) return null;
  if (grounding !== "ACCOUNT_DATA" && sources.length > 0) return null;
  return {
    id: row.id,
    role: row.role,
    content: row.content,
    language: isLanguage(row.language) ? row.language : null,
    grounding,
    citations: citations as ChatCitation[],
    sources: sources as ChatSource[],
  };
}

export function parseChatHistory(value: unknown): ChatMessage[] | null {
  if (!Array.isArray(value)) return null;
  const messages = value.map(parseChatMessage);
  return messages.some((message) => message === null)
    ? null
    : (messages as ChatMessage[]);
}

export function parseConversationId(value: unknown): string | null {
  if (!value || typeof value !== "object") return null;
  const id = (value as { id?: unknown }).id;
  return typeof id === "string" && uuid.test(id) ? id : null;
}

export function parseLatestConversationId(value: unknown): string | null | undefined {
  // null = a valid empty list; undefined = malformed response.
  if (!Array.isArray(value)) return undefined;
  if (value.length === 0) return null;
  return parseConversationId(value[0]) ?? undefined;
}

/** RFC 4122 v4 id that also works on plain-HTTP origins where randomUUID is unavailable. */
export function newRequestId(): string {
  if (typeof crypto.randomUUID === "function") return crypto.randomUUID();
  const bytes = crypto.getRandomValues(new Uint8Array(16));
  bytes[6] = (bytes[6] & 0x0f) | 0x40;
  bytes[8] = (bytes[8] & 0x3f) | 0x80;
  const hex = Array.from(bytes, (byte) => byte.toString(16).padStart(2, "0")).join("");
  return `${hex.slice(0, 8)}-${hex.slice(8, 12)}-${hex.slice(12, 16)}-${hex.slice(16, 20)}-${hex.slice(20)}`;
}

export const SPEECH_LANG: Record<ChatLanguage, string> = {
  en: "en-US",
  ur: "ur-PK",
  hi: "hi-IN",
};

/** Picks an installed voice for the language, preferring an exact locale; null if none exists. */
export function pickVoice<T extends { lang: string }>(
  voices: readonly T[],
  language: ChatLanguage,
): T | null {
  const wanted = SPEECH_LANG[language].toLowerCase();
  const base = language;
  const normalized = (voice: T) => voice.lang.toLowerCase().replace("_", "-");
  return (
    voices.find((voice) => normalized(voice) === wanted) ??
    voices.find((voice) => normalized(voice).split("-")[0] === base) ??
    null
  );
}

/** Unread-warning digest from GET /assistant/briefing (owner scoped, read-only). */
export interface Briefing {
  unreadTotal: number;
  byCategory: Array<{ category: string; count: number }>;
  top: Array<{ category: string; title: string }>;
}

export function parseBriefing(value: unknown): Briefing | null {
  if (!value || typeof value !== "object") return null;
  const row = value as Record<string, unknown>;
  if (
    typeof row.unreadTotal !== "number" ||
    !Number.isInteger(row.unreadTotal) ||
    row.unreadTotal < 0 ||
    !Array.isArray(row.byCategory) ||
    !Array.isArray(row.top) ||
    row.top.length > 3
  )
    return null;
  const byCategory: Briefing["byCategory"] = [];
  for (const entry of row.byCategory) {
    const e = entry as Record<string, unknown> | null;
    if (!e || typeof e.category !== "string" || typeof e.count !== "number" || !Number.isInteger(e.count))
      return null;
    byCategory.push({ category: e.category, count: e.count });
  }
  const top: Briefing["top"] = [];
  for (const entry of row.top) {
    const e = entry as Record<string, unknown> | null;
    if (!e || typeof e.category !== "string" || typeof e.title !== "string") return null;
    top.push({ category: e.category, title: e.title });
  }
  return { unreadTotal: row.unreadTotal, byCategory, top };
}

// Spoken wording for "Read my warnings". Urdu and Hindi are UNVERIFIED by a native speaker.
const SPOKEN: Record<
  ChatLanguage,
  { none: string; some: (n: number, titles: string) => string }
> = {
  en: {
    none: "You have no unread warnings.",
    some: (n, titles) =>
      `You have ${n} unread ${n === 1 ? "warning" : "warnings"}. Latest: ${titles}.`,
  },
  ur: {
    none: "آپ کی کوئی نہ پڑھی ہوئی وارننگ نہیں ہے۔",
    some: (n, titles) => `آپ کی ${n} نہ پڑھی ہوئی وارننگز ہیں۔ تازہ ترین: ${titles}۔`,
  },
  hi: {
    none: "आपकी कोई अपठित चेतावनी नहीं है।",
    some: (n, titles) => `आपकी ${n} अपठित चेतावनियां हैं। नवीनतम: ${titles}।`,
  },
};

/** The text read aloud when the farmer presses "Read my warnings". Never speaks by itself. */
export function briefingSpeech(briefing: Briefing, language: ChatLanguage): string {
  const words = SPOKEN[language];
  if (briefing.unreadTotal === 0) return words.none;
  return words.some(
    briefing.unreadTotal,
    briefing.top.map((item) => item.title.replace(/\s+/g, " ").trim()).join("; "),
  );
}

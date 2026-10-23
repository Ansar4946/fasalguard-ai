/** Pure helpers for browser speech synthesis (voice choice and text cleanup). */
export type SpeechLang = "ur" | "en";
export const SPEECH_LOCALE: Record<SpeechLang, string> = { ur: "ur-PK", en: "en-US" };
export const SPEECH_RATE = 0.95;

const norm = (lang: string) => lang.toLowerCase().replace("_", "-");

/** Preference order: ur -> ur-PK, ur-*, hi-IN, hi-*, default; en -> en-US, en-*, default. null = browser default. */
export function pickSpeechVoice<T extends { lang: string }>(
  voices: readonly T[],
  lang: SpeechLang,
): T | null {
  const exact = (code: string) => voices.find((voice) => norm(voice.lang) === code);
  const family = (code: string) => voices.find((voice) => norm(voice.lang).split("-")[0] === code);
  if (lang === "ur") {
    return exact("ur-pk") ?? family("ur") ?? exact("hi-in") ?? family("hi") ?? null;
  }
  return exact("en-us") ?? family("en") ?? null;
}

/** Removes markdown so symbols are not read aloud. Keeps the words. */
export function stripMarkdown(text: string): string {
  return text
    .replace(/```[\s\S]*?```/g, " ")
    .replace(/`([^`]*)`/g, "$1")
    .replace(/!\[([^\]]*)\]\([^)]*\)/g, "$1")
    .replace(/\[([^\]]+)\]\([^)]*\)/g, "$1")
    .replace(/^\s{0,3}#{1,6}\s+/gm, "")
    .replace(/^\s{0,3}>\s?/gm, "")
    .replace(/^\s*[-*+]\s+/gm, "")
    .replace(/^\s*\d+[.)]\s+/gm, "")
    .replace(/^\s*([-*_]\s*){3,}$/gm, " ")
    .replace(/(\*\*|__)(.*?)\1/g, "$2")
    .replace(/(\*|_)(.*?)\1/g, "$2")
    .replace(/~~(.*?)~~/g, "$1")
    .replace(/\s+/g, " ")
    .trim();
}

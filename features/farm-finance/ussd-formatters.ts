const receiptPattern = /\b[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}\b/i;

export function parseUssdResponse(text: string): {
  mode: "continue" | "end";
  content: string;
} {
  if (text.startsWith("CON ")) return { mode: "continue", content: text.slice(4) };
  if (text.startsWith("END ")) return { mode: "end", content: text.slice(4) };
  return { mode: "end", content: text };
}

export function extractReceiptId(text: string): string | null {
  if (!text.startsWith("END Expense saved. Receipt ")) return null;
  return text.match(receiptPattern)?.[0] ?? null;
}

export function formatPkrMinor(value: string): string {
  if (!/^\d+$/.test(value)) return "PKR —";
  const minor = BigInt(value);
  const hundred = BigInt(100);
  const major = minor / hundred;
  const paisa = String(minor % hundred).padStart(2, "0");
  return `PKR ${major.toLocaleString("en-PK")}.${paisa}`;
}

export interface ExpectedExpense {
  amountMinor: string;
  farmName: string;
  category: string;
}

export type ReceiptVerification =
  | { kind: "verified"; entry: FarmLedgerEntry }
  | { kind: "missing" }
  | { kind: "mismatch"; reason: "amount" | "farm" | "category" | "channel" | "currency" };

/** Reads the server-rendered review screen into the values the farmer confirmed. */
export function parseReviewScreen(text: string): ExpectedExpense | null {
  if (!text.startsWith("CON Review expense\n")) return null;
  const farm = text.match(/^Farm: (.+)$/m)?.[1];
  const category = text.match(/^Category: (.+)$/m)?.[1];
  const amount = text.match(/^Amount: PKR (\d{1,12})(?:\.(\d{1,2}))?$/m);
  if (!farm || !category || !amount) return null;
  const paisa = (amount[2] ?? "").padEnd(2, "0");
  return {
    farmName: farm,
    category,
    amountMinor: (BigInt(amount[1]) * BigInt(100) + BigInt(paisa || "0")).toString(),
  };
}

const normalize = (value: string) => value.trim().replace(/[\s_-]+/g, " ").toLowerCase();

/**
 * HTTP success is not persistence proof: the exact receipt UUID must be present in the
 * caller's ledger and agree with the amount, farm, category, channel and currency confirmed.
 */
export function verifyReceipt(
  entries: FarmLedgerEntry[],
  receiptId: string,
  expected: ExpectedExpense | null,
): ReceiptVerification {
  const entry = entries.find((candidate) => candidate.id === receiptId);
  if (!entry) return { kind: "missing" };
  if (entry.channel !== "USSD") return { kind: "mismatch", reason: "channel" };
  if (entry.currency !== "PKR") return { kind: "mismatch", reason: "currency" };
  if (!expected) return { kind: "mismatch", reason: "amount" };
  if (entry.amountMinor !== expected.amountMinor) return { kind: "mismatch", reason: "amount" };
  if (normalize(entry.farmName) !== normalize(expected.farmName)) return { kind: "mismatch", reason: "farm" };
  if (normalize(entry.category) !== normalize(expected.category)) return { kind: "mismatch", reason: "category" };
  return { kind: "verified", entry };
}

const uuid = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

/** Rejects malformed provider output so it can never be shown as an empty or valid ledger. */
export function parseLedgerPayload(payload: unknown): FarmLedgerEntry[] {
  if (!Array.isArray(payload)) throw new Error("The ledger response was malformed.");
  for (const row of payload as Record<string, unknown>[]) {
    const valid =
      row !== null &&
      typeof row === "object" &&
      typeof row.id === "string" && uuid.test(row.id) &&
      typeof row.amountMinor === "string" && /^\d+$/.test(row.amountMinor) &&
      typeof row.farmName === "string" &&
      typeof row.category === "string" &&
      typeof row.occurredOn === "string" &&
      row.currency === "PKR" &&
      row.channel === "USSD";
    if (!valid) throw new Error("The ledger response was malformed.");
  }
  return payload as FarmLedgerEntry[];
}

/** RFC 4122 v4 id. randomUUID() is unavailable on plain-HTTP origins such as a LAN demo URL. */
export function newUuid(): string {
  if (typeof crypto.randomUUID === "function") return crypto.randomUUID();
  const bytes = crypto.getRandomValues(new Uint8Array(16));
  bytes[6] = (bytes[6] & 0x0f) | 0x40;
  bytes[8] = (bytes[8] & 0x3f) | 0x80;
  const hex = Array.from(bytes, (byte) => byte.toString(16).padStart(2, "0")).join("");
  return `${hex.slice(0, 8)}-${hex.slice(8, 12)}-${hex.slice(12, 16)}-${hex.slice(16, 20)}-${hex.slice(20)}`;
}

/** The single demo short code. Keypad letters spell F-A-S-L (3=DEF, 2=ABC, 7=PQRS, 5=JKL). */
export const DEMO_SHORT_CODE = "*3275#";
export const DIAL_MAX_LENGTH = 20;
export const REPLY_MAX_LENGTH = 32;

export const DIAL_KEYS: ReadonlyArray<{ key: string; letters: string }> = [
  { key: "1", letters: "" },
  { key: "2", letters: "ABC" },
  { key: "3", letters: "DEF" },
  { key: "4", letters: "GHI" },
  { key: "5", letters: "JKL" },
  { key: "6", letters: "MNO" },
  { key: "7", letters: "PQRS" },
  { key: "8", letters: "TUV" },
  { key: "9", letters: "WXYZ" },
  { key: "*", letters: "" },
  { key: "0", letters: "+" },
  { key: "#", letters: "" },
];

const dialKey = /^[0-9*#]$/;

/** Appends one keypad character; anything else is ignored and the length is capped. */
export function appendDialKey(value: string, key: string): string {
  if (!dialKey.test(key) || value.length >= DIAL_MAX_LENGTH) return value;
  return value + key;
}

export function removeLastDialKey(value: string): string {
  return value.slice(0, -1);
}

/** Reduces pasted text (spaces, dashes, letters) to the characters a dialer accepts. */
export function sanitizeDialInput(text: string): string {
  return text.replace(/[^0-9*#]/g, "").slice(0, DIAL_MAX_LENGTH);
}

/** Appends a pasted string to what is already dialed, keeping only dialer characters. */
export function pasteIntoDial(value: string, text: string): string {
  return (value + sanitizeDialInput(text)).slice(0, DIAL_MAX_LENGTH);
}

/** Reply entry accepts digits only (the USSD menus only ask for digits). */
export function appendReplyDigit(value: string, key: string): string {
  if (!/^[0-9]$/.test(key) || value.length >= REPLY_MAX_LENGTH) return value;
  return value + key;
}

export type DialedMatch = "empty" | "demo" | "unrecognised";

export function matchDialedCode(dialed: string): DialedMatch {
  if (dialed === "") return "empty";
  return dialed === DEMO_SHORT_CODE ? "demo" : "unrecognised";
}

export function unrecognisedCodeMessage(): string {
  return `Connection problem or invalid MMI code. This simulator answers only ${DEMO_SHORT_CODE}.`;
}

/** Maps a KeyboardEvent.key to a dialer action, or null when the key is not for the dialer. */
export function dialAction(key: string): { type: "key"; key: string } | { type: "backspace" } | { type: "call" } | null {
  if (dialKey.test(key)) return { type: "key", key };
  if (key === "Backspace") return { type: "backspace" };
  if (key === "Enter") return { type: "call" };
  return null;
}

import type { FarmLedgerEntry } from "./types";

// Web-simulator USSD client logic for the mobile app. This is NOT a telecom USSD session: it calls
// the authenticated Fasal Guard demo endpoint, which runs the same state machine and ledger.
// Mirrors features/farm-finance/ussd-formatters.ts in the web app; keep the two in step.
import { isAllowedApiBase } from "./api-url.mjs";
export const DEMO_CODE = "*3275#";
export const KEYS = ["1", "2", "3", "4", "5", "6", "7", "8", "9", "*", "0", "#"];

const receiptPattern =
  /\b[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}\b/i;
const uuid = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

export function coreBase(value) {
  if (!isAllowedApiBase(value)) throw new Error("HTTPS_REQUIRED");
  return value.replace(/\/$/, "");
}

export function parseUssdResponse(text) {
  if (text.startsWith("CON ")) return { mode: "continue", content: text.slice(4) };
  if (text.startsWith("END ")) return { mode: "end", content: text.slice(4) };
  return { mode: "end", content: text };
}

export function extractReceiptId(text) {
  if (!text.startsWith("END Expense saved. Receipt ")) return null;
  return text.match(receiptPattern)?.[0] ?? null;
}

export function formatPkrMinor(value) {
  if (!/^\d+$/.test(value)) return "PKR —";
  const minor = BigInt(value);
  const paisa = String(minor % 100n).padStart(2, "0");
  return `PKR ${(minor / 100n).toString().replace(/\B(?=(\d{3})+(?!\d))/g, ",")}.${paisa}`;
}

/** Reads the review screen into the values the farmer confirmed, in integer paisa. */
export function parseReviewScreen(text) {
  if (!text.startsWith("CON Review expense\n")) return null;
  const farm = text.match(/^Farm: (.+)$/m)?.[1];
  const category = text.match(/^Category: (.+)$/m)?.[1];
  const amount = text.match(/^Amount: PKR (\d{1,12})(?:\.(\d{1,2}))?$/m);
  if (!farm || !category || !amount) return null;
  const paisa = (amount[2] ?? "").padEnd(2, "0");
  return {
    farmName: farm,
    category,
    amountMinor: (BigInt(amount[1]) * 100n + BigInt(paisa || "0")).toString(),
  };
}

const normalize = (value) => value.trim().replace(/[\s_-]+/g, " ").toLowerCase();

/** HTTP success is not proof of persistence: the exact receipt must match what was confirmed. */
export function verifyReceipt(entries, receiptId, expected) {
  const entry = entries.find((candidate) => candidate.id === receiptId);
  if (!entry) return { kind: "missing" };
  if (entry.channel !== "USSD") return { kind: "mismatch", reason: "channel" };
  if (entry.currency !== "PKR") return { kind: "mismatch", reason: "currency" };
  if (!expected || entry.amountMinor !== expected.amountMinor)
    return { kind: "mismatch", reason: "amount" };
  if (normalize(entry.farmName) !== normalize(expected.farmName))
    return { kind: "mismatch", reason: "farm" };
  if (normalize(entry.category) !== normalize(expected.category))
    return { kind: "mismatch", reason: "category" };
  return { kind: "verified", entry };
}

export function parseLedgerPayload(payload) {
  if (!Array.isArray(payload)) throw new Error("LEDGER_MALFORMED");
  for (const row of payload) {
    const valid =
      row &&
      typeof row === "object" &&
      typeof row.id === "string" &&
      uuid.test(row.id) &&
      typeof row.amountMinor === "string" &&
      /^\d+$/.test(row.amountMinor) &&
      typeof row.farmName === "string" &&
      typeof row.category === "string" &&
      typeof row.occurredOn === "string" &&
      row.currency === "PKR" &&
      row.channel === "USSD";
    if (!valid) throw new Error("LEDGER_MALFORMED");
  }
  return payload;
}

async function request(base, token, path, init, fetchImpl) {
  const response = await fetchImpl(`${coreBase(base)}${path}`, {
    ...init,
    headers: {
      accept: "application/json",
      authorization: `Bearer ${token}`,
      ...(init?.body ? { "content-type": "application/json" } : {}),
    },
    signal: AbortSignal.timeout(15000),
  });
  if (response.status === 401) throw new Error("UNAUTHORIZED");
  if (!response.ok) throw new Error(`HTTP_${response.status}`);
  return response.json().catch(() => {
    throw new Error("MALFORMED");
  });
}

export async function demoStep(base, token, payload, fetchImpl = fetch) {
  const body = await request(
    base,
    token,
    "/ussd/demo/callback",
    { method: "POST", body: JSON.stringify(payload) },
    fetchImpl,
  );
  if (!body || typeof body.text !== "string") throw new Error("MALFORMED");
  return body.text;
}

export async function fetchLedger(base, token, fetchImpl = fetch) {
  return parseLedgerPayload(await request(base, token, "/farm-ledger", {}, fetchImpl));
}

export function describeError(code) {
  switch (code) {
    case "HTTPS_REQUIRED":
      return "A secure server address is not configured, so the simulator is disabled.";
    case "UNAUTHORIZED":
      return "Your session has ended. Sign in again; nothing was saved by this step.";
    case "LEDGER_MALFORMED":
    case "MALFORMED":
      return "The server response was not understood. Nothing was assumed saved.";
    default:
      return "The server could not be reached. Retry the same step; it will not duplicate an expense.";
  }
}

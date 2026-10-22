import assert from "node:assert/strict";
import test from "node:test";
// Node's type-stripping test runner requires the source extension at runtime.
// @ts-expect-error allowImportingTsExtensions is intentionally disabled for the Next.js build.
import { DEMO_SHORT_CODE, DIAL_KEYS, DIAL_MAX_LENGTH, appendDialKey, appendReplyDigit, dialAction, matchDialedCode, pasteIntoDial, removeLastDialKey, sanitizeDialInput, unrecognisedCodeMessage, extractReceiptId, formatPkrMinor, parseLedgerPayload, parseReviewScreen, newUuid, parseUssdResponse, verifyReceipt } from "../../features/farm-finance/ussd-formatters.ts";
type FarmLedgerEntry = Parameters<typeof verifyReceipt>[0][number];

test("parses continuing and terminal provider responses without interpreting markup", () => {
  assert.deepEqual(parseUssdResponse("CON Choose\n1. Farm"), { mode: "continue", content: "Choose\n1. Farm" });
  assert.deepEqual(parseUssdResponse("END <img src=x onerror=alert(1)>"), { mode: "end", content: "<img src=x onerror=alert(1)>" });
});

test("extracts receipts only from a successful terminal response", () => {
  const id = "3c63d709-a06d-4aa1-b660-c40d04b8dddb";
  assert.equal(extractReceiptId(`END Expense saved. Receipt ${id}`), id);
  assert.equal(extractReceiptId(`CON Expense saved. Receipt ${id}`), null);
});

test("formats integer paisa without floating point conversion", () => {
  assert.equal(formatPkrMinor("250000"), "PKR 2,500.00");
  assert.equal(formatPkrMinor("bad"), "PKR —");
});

const ID = "3c63d709-a06d-4aa1-b660-c40d04b8dddb";
const row: FarmLedgerEntry = {
  id: ID, farmId: "f", cropSeasonId: "c", farmName: "North Field", category: "seed",
  amountMinor: "32100", currency: "PKR", occurredOn: "2026-10-15", channel: "USSD",
  confirmedAt: "2026-10-15T00:00:00Z", createdAt: "2026-10-15T00:00:00Z",
};
const review = "CON Review expense\nFarm: North Field\nSeason: Rabi\nCategory: Seed\nAmount: PKR 321\nDate: 2026-10-15\n1. Confirm\n2. Cancel";

test("reads the confirmed expense from the review screen in integer paisa", () => {
  assert.deepEqual(parseReviewScreen(review), { farmName: "North Field", category: "Seed", amountMinor: "32100" });
  assert.equal(parseReviewScreen("CON Choose farm"), null);
  assert.equal(parseReviewScreen(review.replace("PKR 321", "PKR 3.5"))?.amountMinor, "350");
});

test("verifies only the exact receipt with matching amount, farm, category, channel and currency", () => {
  const expected = parseReviewScreen(review);
  assert.deepEqual(verifyReceipt([row], ID, expected), { kind: "verified", entry: row });
  assert.deepEqual(verifyReceipt([], ID, expected), { kind: "missing" });
  assert.deepEqual(verifyReceipt([{ ...row, id: "9c63d709-a06d-4aa1-b660-c40d04b8dddb" }], ID, expected), { kind: "missing" });
  assert.deepEqual(verifyReceipt([{ ...row, amountMinor: "3210" }], ID, expected), { kind: "mismatch", reason: "amount" });
  assert.deepEqual(verifyReceipt([{ ...row, farmName: "South Field" }], ID, expected), { kind: "mismatch", reason: "farm" });
  assert.deepEqual(verifyReceipt([{ ...row, category: "labour" }], ID, expected), { kind: "mismatch", reason: "category" });
  assert.deepEqual(verifyReceipt([{ ...row, channel: "WEB" } as unknown as FarmLedgerEntry], ID, expected), { kind: "mismatch", reason: "channel" });
  assert.deepEqual(verifyReceipt([{ ...row, currency: "USD" } as unknown as FarmLedgerEntry], ID, expected), { kind: "mismatch", reason: "currency" });
  assert.equal(verifyReceipt([row], ID, null).kind, "mismatch");
  assert.equal(verifyReceipt([row, row], ID, expected).kind, "verified");
});

test("rejects malformed ledger payloads instead of treating them as empty", () => {
  assert.deepEqual(parseLedgerPayload([]), []);
  assert.deepEqual(parseLedgerPayload([row]), [row]);
  for (const bad of [null, {}, "x", [{}], [{ ...row, amountMinor: 321.5 }], [{ ...row, id: "nope" }], [{ ...row, currency: "USD" }]])
    assert.throws(() => parseLedgerPayload(bad), /malformed/);
});

test("newUuid falls back to getRandomValues on insecure origins and still yields a v4 UUID", () => {
  const original = crypto.randomUUID;
  Object.defineProperty(crypto, "randomUUID", { value: undefined, configurable: true });
  try {
    const id = newUuid();
    assert.match(id, /^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/);
    assert.notEqual(id, newUuid());
  } finally {
    Object.defineProperty(crypto, "randomUUID", { value: original, configurable: true });
  }
});

test("the demo short code is *3275# and spells FASL on the keypad", () => {
  assert.equal(DEMO_SHORT_CODE, "*3275#");
  const letters = (key: string) => DIAL_KEYS.find((entry) => entry.key === key)?.letters ?? "";
  const spelled = [...DEMO_SHORT_CODE.slice(1, -1)].map((key) => letters(key));
  assert.deepEqual(["F", "A", "S", "L"].map((c, i) => spelled[i].includes(c)), [true, true, true, true]);
});

test("keypad has twelve keys with classic letters", () => {
  assert.deepEqual(DIAL_KEYS.map((entry) => entry.key), ["1", "2", "3", "4", "5", "6", "7", "8", "9", "*", "0", "#"]);
  assert.equal(DIAL_KEYS[8].letters, "WXYZ");
});

test("digit entry appends valid keys, ignores others and caps length", () => {
  let value = "";
  for (const key of DEMO_SHORT_CODE) value = appendDialKey(value, key);
  assert.equal(value, DEMO_SHORT_CODE);
  assert.equal(appendDialKey("12", "a"), "12");
  assert.equal(appendDialKey("12", "12"), "12");
  assert.equal(appendDialKey("1".repeat(DIAL_MAX_LENGTH), "2"), "1".repeat(DIAL_MAX_LENGTH));
});

test("backspace removes one character and clear-safe on empty", () => {
  assert.equal(removeLastDialKey("*32"), "*3");
  assert.equal(removeLastDialKey(""), "");
});

test("paste keeps only dialer characters and respects the cap", () => {
  assert.equal(sanitizeDialInput(" *3275# "), "*3275#");
  assert.equal(sanitizeDialInput("call +92-300"), "92300");
  assert.equal(pasteIntoDial("*", "3275#"), "*3275#");
  assert.equal(pasteIntoDial("1".repeat(19), "2345").length, DIAL_MAX_LENGTH);
});

test("short-code matching is exact and the old code is unrecognised", () => {
  assert.equal(matchDialedCode(""), "empty");
  assert.equal(matchDialedCode("*3275#"), "demo");
  assert.equal(matchDialedCode("*786#"), "unrecognised");
  assert.equal(matchDialedCode("*3275"), "unrecognised");
  assert.equal(matchDialedCode(" *3275#"), "unrecognised");
  assert.match(unrecognisedCodeMessage(), /invalid MMI code.*\*3275#/);
});

test("reply entry accepts digits only", () => {
  assert.equal(appendReplyDigit("1", "2"), "12");
  assert.equal(appendReplyDigit("1", "*"), "1");
  assert.equal(appendReplyDigit("1".repeat(32), "2").length, 32);
});

test("keyboard keys map to dialer actions", () => {
  assert.deepEqual(dialAction("7"), { type: "key", key: "7" });
  assert.deepEqual(dialAction("*"), { type: "key", key: "*" });
  assert.deepEqual(dialAction("#"), { type: "key", key: "#" });
  assert.deepEqual(dialAction("Backspace"), { type: "backspace" });
  assert.deepEqual(dialAction("Enter"), { type: "call" });
  assert.equal(dialAction("a"), null);
});

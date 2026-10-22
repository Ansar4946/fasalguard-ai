import { test } from "node:test";
import assert from "node:assert/strict";
import {
  coreBase,
  demoStep,
  describeError,
  extractReceiptId,
  fetchLedger,
  formatPkrMinor,
  parseLedgerPayload,
  parseReviewScreen,
  parseUssdResponse,
  verifyReceipt,
} from "../src/ussd.mjs";

const ID = "3c63d709-a06d-4aa1-b660-c40d04b8dddb";
const row = {
  id: ID, farmName: "North Field", category: "seed", amountMinor: "32100",
  currency: "PKR", occurredOn: "2026-10-15", channel: "USSD",
};
const review =
  "CON Review expense\nFarm: North Field\nSeason: Rabi\nCategory: Seed\nAmount: PKR 321\nDate: 2026-10-15\n1. Confirm\n2. Cancel";
const reply = (status, body) => async () => ({
  status,
  ok: status >= 200 && status < 300,
  json: async () => {
    if (body === undefined) throw new Error("bad json");
    return body;
  },
});

test("only an HTTPS server address is accepted", () => {
  assert.equal(coreBase("https://api.example.com/api/v1/"), "https://api.example.com/api/v1");
  for (const bad of [undefined, "", "http://192.168.1.2:4000/api/v1"])
    assert.throws(() => coreBase(bad), /HTTPS_REQUIRED/);
});

test("parses screens and receipts like the web simulator", () => {
  assert.deepEqual(parseUssdResponse("CON Choose"), { mode: "continue", content: "Choose" });
  assert.equal(parseUssdResponse("END bye").mode, "end");
  assert.equal(extractReceiptId(`END Expense saved. Receipt ${ID}`), ID);
  assert.equal(extractReceiptId(`CON Expense saved. Receipt ${ID}`), null);
  assert.equal(formatPkrMinor("32100"), "PKR 321.00");
  assert.equal(formatPkrMinor("bad"), "PKR —");
  assert.deepEqual(parseReviewScreen(review), { farmName: "North Field", category: "Seed", amountMinor: "32100" });
});

test("receipt verification needs the exact id and matching amount, farm, category", () => {
  const expected = parseReviewScreen(review);
  assert.equal(verifyReceipt([row], ID, expected).kind, "verified");
  assert.equal(verifyReceipt([], ID, expected).kind, "missing");
  assert.equal(verifyReceipt([{ ...row, id: "9c63d709-a06d-4aa1-b660-c40d04b8dddb" }], ID, expected).kind, "missing");
  assert.deepEqual(verifyReceipt([{ ...row, amountMinor: "1" }], ID, expected), { kind: "mismatch", reason: "amount" });
  assert.deepEqual(verifyReceipt([{ ...row, farmName: "Other" }], ID, expected), { kind: "mismatch", reason: "farm" });
  assert.deepEqual(verifyReceipt([{ ...row, category: "labour" }], ID, expected), { kind: "mismatch", reason: "category" });
  assert.deepEqual(verifyReceipt([{ ...row, channel: "WEB" }], ID, expected), { kind: "mismatch", reason: "channel" });
  assert.equal(verifyReceipt([row], ID, null).kind, "mismatch");
});

test("malformed ledger bodies are errors, never an empty ledger", async () => {
  assert.deepEqual(parseLedgerPayload([]), []);
  for (const bad of [null, {}, [{}], [{ ...row, amountMinor: 5 }], [{ ...row, currency: "USD" }]])
    assert.throws(() => parseLedgerPayload(bad), /LEDGER_MALFORMED/);
  await assert.rejects(fetchLedger("https://x.test/api/v1", "t", reply(200, { records: [] })), /LEDGER_MALFORMED/);
  await assert.rejects(fetchLedger("https://x.test/api/v1", "t", reply(200, undefined)), /MALFORMED/);
  assert.deepEqual(await fetchLedger("https://x.test/api/v1", "t", reply(200, [])), []);
});

test("server failures map to distinct errors and the bearer token is sent", async () => {
  await assert.rejects(fetchLedger("https://x.test/api/v1", "t", reply(401, {})), /UNAUTHORIZED/);
  await assert.rejects(fetchLedger("https://x.test/api/v1", "t", reply(500, {})), /HTTP_500/);
  await assert.rejects(demoStep("http://x.test", "t", {}, reply(200, { text: "x" })), /HTTPS_REQUIRED/);
  await assert.rejects(demoStep("https://x.test/api/v1", "t", {}, reply(200, { nope: 1 })), /MALFORMED/);
  let seen;
  const text = await demoStep(
    "https://x.test/api/v1", "secret-token",
    { eventId: "e", sessionId: "s", input: "" },
    async (url, init) => { seen = { url, init }; return { status: 200, ok: true, json: async () => ({ text: "CON hi" }) }; },
  );
  assert.equal(text, "CON hi");
  assert.equal(seen.url, "https://x.test/api/v1/ussd/demo/callback");
  assert.equal(seen.init.headers.authorization, "Bearer secret-token");
  assert.match(describeError("UNAUTHORIZED"), /session has ended/);
  assert.match(describeError("HTTP_500"), /Retry the same step/);
});

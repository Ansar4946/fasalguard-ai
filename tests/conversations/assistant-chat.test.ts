import assert from "node:assert/strict";
import test from "node:test";
// Node's type-stripping test runner requires the source extension at runtime.
// @ts-expect-error allowImportingTsExtensions is intentionally disabled for the Next.js build.
import { floatToWav, WAV_SAMPLE_RATE } from "../../features/conversations/wav-encoder.ts";
// @ts-expect-error allowImportingTsExtensions is intentionally disabled for the Next.js build.
import { briefingSpeech, newRequestId, parseBriefing, parseChatHistory, parseChatMessage, parseConversationId, parseLatestConversationId, pickVoice } from "../../features/conversations/assistant-chat.ts";

const ID = "3c63d709-a06d-4aa1-b660-c40d04b8dddb";
const answer = {
  id: ID, role: "ASSISTANT", content: "Sow in November.", language: "en", grounding: "GROUNDED",
  citations: [{ id: "9c63d709-a06d-4aa1-b660-c40d04b8dddb", title: "Wheat sowing", revision: 2 }],
};

test("accepts a grounded answer only when it carries citations", () => {
  assert.equal(parseChatMessage(answer)?.citations.length, 1);
  assert.equal(parseChatMessage({ ...answer, citations: [] }), null);
  assert.equal(parseChatMessage({ ...answer, grounding: "ABSTAINED", citations: [] })?.grounding, "ABSTAINED");
});

test("rejects malformed messages and forged citation shapes", () => {
  for (const bad of [null, "x", {}, { ...answer, id: "nope" }, { ...answer, role: "SYSTEM" }, { ...answer, content: 5 },
    { ...answer, citations: "none" }, { ...answer, citations: [{ id: ID, title: "t" }] }, { ...answer, citations: [{ id: ID, title: "t", revision: 1.5 }] }])
    assert.equal(parseChatMessage(bad), null);
});

test("history parsing distinguishes empty from malformed", () => {
  assert.deepEqual(parseChatHistory([]), []);
  assert.equal(parseChatHistory([answer, { bogus: true }]), null);
  assert.equal(parseChatHistory({ records: [] }), null);
});

test("conversation id parsing: empty list is null, malformed is undefined", () => {
  assert.equal(parseLatestConversationId([]), null);
  assert.equal(parseLatestConversationId([{ id: ID }]), ID);
  assert.equal(parseLatestConversationId([{ id: "bad" }]), undefined);
  assert.equal(parseLatestConversationId({}), undefined);
  assert.equal(parseConversationId({ id: ID }), ID);
  assert.equal(parseConversationId({}), null);
});

test("request ids are v4 UUIDs even without crypto.randomUUID", () => {
  const original = crypto.randomUUID;
  Object.defineProperty(crypto, "randomUUID", { value: undefined, configurable: true });
  try {
    const id = newRequestId();
    assert.match(id, /^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/);
    assert.notEqual(id, newRequestId());
  } finally {
    Object.defineProperty(crypto, "randomUUID", { value: original, configurable: true });
  }
});

test("picks an installed voice by locale, falls back to the language, and never invents one", () => {
  const voices = [{ lang: "en-GB", name: "gb" }, { lang: "hi_IN", name: "hindi" }, { lang: "ur-IN", name: "urdu-in" }, { lang: "en-US", name: "us" }];
  assert.equal(pickVoice(voices, "en")?.name, "us");
  assert.equal(pickVoice(voices, "hi")?.name, "hindi");
  assert.equal(pickVoice(voices, "ur")?.name, "urdu-in");
  assert.equal(pickVoice([{ lang: "en-US", name: "us" }], "ur"), null);
  assert.equal(pickVoice([], "hi"), null);
});

test("WAV encoder writes the exact 16 kHz mono 16-bit PCM header the server validates", () => {
  const samples = new Float32Array([0, 0.5, -0.5, 1, -1, 2, -2]);
  const wav = floatToWav(samples);
  const view = new DataView(wav.buffer);
  const tag = (offset: number) => String.fromCharCode(...wav.slice(offset, offset + 4));
  assert.equal(tag(0), "RIFF");
  assert.equal(tag(8), "WAVE");
  assert.equal(tag(12), "fmt ");
  assert.equal(view.getUint16(20, true), 1);
  assert.equal(view.getUint16(22, true), 1);
  assert.equal(view.getUint32(24, true), WAV_SAMPLE_RATE);
  assert.equal(WAV_SAMPLE_RATE, 16000);
  assert.equal(view.getUint16(34, true), 16);
  assert.equal(tag(36), "data");
  assert.equal(view.getUint32(40, true), samples.length * 2);
  assert.equal(wav.length, 44 + samples.length * 2);
  assert.equal(view.getUint32(4, true), wav.length - 8);
  assert.deepEqual([0, 3, 4, 5, 6].map((i) => view.getInt16(44 + i * 2, true)), [0, 32767, -32768, 32767, -32768]);
  assert.equal(floatToWav(new Float32Array(0)).length, 44);
});

const account = {
  id: ID, role: "ASSISTANT", content: "You have 2 farms: Golden rice.", language: "en", grounding: "ACCOUNT_DATA",
  citations: [], sources: [{ type: "ACCOUNT_DATA", label: "Your farms" }],
};

test("account answers carry an ACCOUNT_DATA source and never knowledge citations", () => {
  const parsed = parseChatMessage(account);
  assert.equal(parsed?.grounding, "ACCOUNT_DATA");
  assert.deepEqual(parsed?.sources, [{ type: "ACCOUNT_DATA", label: "Your farms" }]);
  assert.equal(parsed?.citations.length, 0);
  // No source, a forged source type, or knowledge citations mixed in: not shown as account data.
  assert.equal(parseChatMessage({ ...account, sources: [] }), null);
  assert.equal(parseChatMessage({ ...account, sources: [{ type: "KNOWLEDGE", label: "x" }] }), null);
  assert.equal(parseChatMessage({ ...account, citations: answer.citations }), null);
  // A grounded or abstained answer may not smuggle an account source.
  assert.equal(parseChatMessage({ ...answer, sources: account.sources }), null);
  assert.equal(parseChatMessage({ ...answer, grounding: "ABSTAINED", citations: [], sources: account.sources }), null);
  // Old rows without a sources field still parse.
  assert.deepEqual(parseChatMessage(answer)?.sources, []);
});

test("briefing parsing accepts the API shape and rejects malformed digests", () => {
  const ok = { unreadTotal: 2, byCategory: [{ category: "WEATHER", count: 2 }], top: [{ category: "WEATHER", title: "Heavy rain", createdAt: "2026-10-17T00:00:00.000Z" }] };
  assert.equal(parseBriefing(ok)?.unreadTotal, 2);
  assert.deepEqual(parseBriefing({ unreadTotal: 0, byCategory: [], top: [] }), { unreadTotal: 0, byCategory: [], top: [] });
  for (const bad of [null, {}, { ...ok, unreadTotal: -1 }, { ...ok, unreadTotal: 1.5 }, { ...ok, top: [{ title: 1 }] },
    { ...ok, top: [ok.top[0], ok.top[0], ok.top[0], ok.top[0]] }, { ...ok, byCategory: [{ category: "X" }] }])
    assert.equal(parseBriefing(bad), null);
});

test("read-my-warnings text is built from the digest in each language and is silent-safe when empty", () => {
  const digest = parseBriefing({ unreadTotal: 2, byCategory: [], top: [{ category: "WEATHER", title: "Heavy  rain", createdAt: "x" }, { category: "TASK", title: "Water the field", createdAt: "x" }] })!;
  assert.equal(briefingSpeech(digest, "en"), "You have 2 unread warnings. Latest: Heavy rain; Water the field.");
  assert.match(briefingSpeech(digest, "ur"), /2/);
  assert.match(briefingSpeech(digest, "hi"), /2/);
  const none = parseBriefing({ unreadTotal: 0, byCategory: [], top: [] })!;
  assert.equal(briefingSpeech(none, "en"), "You have no unread warnings.");
});

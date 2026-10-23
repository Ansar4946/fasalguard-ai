import assert from "node:assert/strict";
import test from "node:test";
// @ts-expect-error allowImportingTsExtensions is intentionally disabled for the Next.js build.
import * as vs from "../../features/conversations/voice-state.ts";

const run = (events: Parameters<typeof vs.voiceReducer>[1][], from = vs.initialVoiceState) =>
  events.reduce(vs.voiceReducer, from);

test("happy path goes through every state to review", () => {
  const phases: string[] = [];
  let state = vs.initialVoiceState;
  for (const event of [
    { type: "REQUEST" }, { type: "MIC_READY" }, { type: "STOP" }, { type: "PREPARED" },
    { type: "UPLOADED" }, { type: "TRANSCRIBED", text: "gandum" },
  ] as const) {
    state = vs.voiceReducer(state, event);
    phases.push(state.phase);
  }
  assert.deepEqual(phases, ["requesting", "recording", "preparing", "uploading", "transcribing", "review"]);
  assert.equal(state.transcript, "gandum");
});

test("out-of-order events are ignored", () => {
  assert.equal(run([{ type: "MIC_READY" }]).phase, "idle");
  assert.equal(run([{ type: "STOP" }]).phase, "idle");
  assert.equal(run([{ type: "REQUEST" }, { type: "REQUEST" }]).phase, "requesting");
});

test("empty transcript becomes an empty error; failures carry kind and reset", () => {
  const empty = run([{ type: "REQUEST" }, { type: "MIC_READY" }, { type: "STOP" }, { type: "PREPARED" }, { type: "UPLOADED" }, { type: "TRANSCRIBED", text: "  " }]);
  assert.equal(empty.phase, "error");
  assert.equal(empty.error, "empty");
  const denied = run([{ type: "REQUEST" }, { type: "FAIL", kind: "denied" }]);
  assert.equal(denied.error, "denied");
  assert.equal(run([{ type: "RESET" }], denied).phase, "idle");
  assert.equal(run([{ type: "REQUEST" }], denied).phase, "requesting");
});

test("editing cancels auto-send; untouched transcript auto-sends", () => {
  const review = run([{ type: "REQUEST" }, { type: "MIC_READY" }, { type: "STOP" }, { type: "PREPARED" }, { type: "UPLOADED" }, { type: "TRANSCRIBED", text: "hello" }]);
  assert.equal(vs.shouldAutoSend(review), true);
  const edited = vs.voiceReducer(review, { type: "EDIT", text: "hello!" });
  assert.equal(edited.edited, true);
  assert.equal(vs.shouldAutoSend(edited), false);
  assert.equal(vs.AUTO_SEND_DELAY_MS, 1500);
  assert.equal(vs.MAX_RECORDING_SECONDS, 60);
  assert.equal(vs.shouldAutoSend(vs.initialVoiceState), false);
});

test("microphone errors map to friendly kinds", () => {
  assert.equal(vs.micErrorKind("NotAllowedError"), "denied");
  assert.equal(vs.micErrorKind("NotFoundError"), "no-mic");
  assert.equal(vs.micErrorKind("AbortError"), "generic");
  assert.equal(vs.micErrorKind(undefined), "generic");
});

test("level normalisation: silence 0, loud clamps to 1, empty is 0", () => {
  assert.equal(vs.normalizeLevel(new Uint8Array(128).fill(128)), 0);
  const loud = new Uint8Array(128).map((_, i) => (i % 2 ? 255 : 0));
  assert.equal(vs.normalizeLevel(loud), 1);
  const soft = new Uint8Array(128).map((_, i) => (i % 2 ? 138 : 118));
  const level = vs.normalizeLevel(soft);
  assert.ok(level > 0 && level < 0.5, String(level));
  assert.equal(vs.normalizeLevel([]), 0);
});

test("level history keeps a fixed length and clamps", () => {
  let h: number[] = [];
  for (let i = 0; i < 40; i += 1) h = vs.pushLevel(h, i % 2 ? 5 : -1, 28);
  assert.equal(h.length, 28);
  assert.ok(h.every((v) => v >= 0 && v <= 1));
  assert.equal(vs.pushLevel([], 0.5, 4).length, 4);
  assert.equal(vs.barHeightPercent(0), 8);
  assert.equal(vs.barHeightPercent(1), 100);
  assert.equal(vs.barHeightPercent(9), 100);
});

test("transcription errors map to localisable kinds, never raw server text", () => {
  const k = vs.transcriptionErrorKind;
  assert.equal(k(503, "SPEECH_NO_SPEECH", "No speech was detected. Please record again."), "no-speech");
  assert.equal(k(503, undefined, "No speech was detected."), "no-speech");
  assert.equal(k(400, "BAD_REQUEST", "Recording is too short."), "too-short");
  assert.equal(k(400, "SPEECH_MEDIA_INVALID", "Voice recording is too large."), "too-long");
  assert.equal(k(503, "SPEECH_MEDIA_INVALID", "Voice recording format is unsupported."), "format");
  assert.equal(k(503, "SPEECH_PROVIDER_FAILED", "Transcription failed."), "provider");
  assert.equal(k(429, "TOO_MANY_REQUESTS", "ThrottlerException"), "rate-limited");
  assert.equal(k(500, undefined, undefined), "generic");
});

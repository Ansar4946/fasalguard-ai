import assert from "node:assert/strict";
import test from "node:test";
// @ts-expect-error allowImportingTsExtensions is intentionally disabled for the Next.js build.
import { pickSpeechVoice, SPEECH_RATE, stripMarkdown } from "../../features/speech/speech-logic.ts";

const v = (lang: string, name = lang) => ({ lang, name });

test("Urdu prefers ur-PK, then ur-*, then hi-IN, then hi-*, then the browser default", () => {
  const all = [v("en-US"), v("hi-IN"), v("ur_IN"), v("ur-PK"), v("hi-XX")];
  assert.equal(pickSpeechVoice(all, "ur")?.lang, "ur-PK");
  assert.equal(pickSpeechVoice(all.filter((x) => x.lang !== "ur-PK"), "ur")?.lang, "ur_IN");
  assert.equal(pickSpeechVoice([v("en-US"), v("hi-IN")], "ur")?.lang, "hi-IN");
  assert.equal(pickSpeechVoice([v("en-US"), v("hi-XX")], "ur")?.lang, "hi-XX");
  assert.equal(pickSpeechVoice([v("en-US")], "ur"), null);
  assert.equal(pickSpeechVoice([], "ur"), null);
});

test("English prefers en-US then any en voice; never picks an Urdu voice", () => {
  assert.equal(pickSpeechVoice([v("en-GB"), v("en-US"), v("ur-PK")], "en")?.lang, "en-US");
  assert.equal(pickSpeechVoice([v("en-GB"), v("ur-PK")], "en")?.lang, "en-GB");
  assert.equal(pickSpeechVoice([v("ur-PK")], "en"), null);
});

test("rate is 0.95", () => assert.equal(SPEECH_RATE, 0.95));

test("markdown is stripped but the words stay", () => {
  const md = "# Heading\n\n**Bold** and *italic* and `code`.\n- item one\n1. item two\n[link](http://x.y) ![img](a.png)\n> quote\n```js\nskip()\n```\n~~gone~~";
  const out = stripMarkdown(md);
  assert.equal(out, "Heading Bold and italic and code. item one item two link img quote gone");
  assert.equal(stripMarkdown("گندم کی **بوائی** سے پہلے"), "گندم کی بوائی سے پہلے");
  assert.equal(stripMarkdown("   "), "");
});

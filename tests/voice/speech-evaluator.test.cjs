"use strict";

const test = require("node:test");
const assert = require("node:assert/strict");
const { aggregateScores, normalizeText, scoreTranscript, validateManifest } = require("../../scripts/f08-speech-evaluator.cjs");

test("normalizes Urdu punctuation without transliterating crop names", () => {
  assert.equal(normalizeText("گندم، کپاس!"), "گندم کپاس");
});

test("computes WER, CER, and exact normalized crop-term matches", () => {
  const result = scoreTranscript("میری گندم اچھی ہے", "میری گندم ہے", ["گندم", "کپاس"]);
  assert.equal(result.wordErrors, 1);
  assert.equal(result.referenceWords, 4);
  assert.equal(result.matchedTerms, 1);
  assert.equal(result.totalTerms, 2);
  assert.ok(result.characterErrors > 0);
});

test("aggregates weighted error rates rather than averaging sample percentages", () => {
  assert.deepEqual(aggregateScores([
    { wordErrors: 1, referenceWords: 2, characterErrors: 2, referenceCharacters: 4, matchedTerms: 1, totalTerms: 1, latencyMs: 100 },
    { wordErrors: 1, referenceWords: 8, characterErrors: 1, referenceCharacters: 6, matchedTerms: 1, totalTerms: 3, latencyMs: 300 },
  ]), { sampleCount: 2, wer: 0.2, cer: 0.3, cropTermAccuracy: 0.5, meanLatencyMs: 200 });
});

test("requires explicit dataset consent and checksum-pinned samples", () => {
  assert.throws(() => validateManifest({ schemaVersion: 1, samples: [] }, "C:/private/manifest.json"), /explicitly permit/);
  assert.throws(() => validateManifest({ schemaVersion: 1, datasetConsent: { allowedForProviderEvaluation: true, licenseOrConsentRecord: "private-record" }, samples: [{ id: "s1", locale: "ur-PK", contentType: "audio/wav", referenceTranscript: "گندم", cropTerms: [], audioFile: "one.wav" }] }, "C:/private/manifest.json"), /SHA-256/);
});

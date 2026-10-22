#!/usr/bin/env node
const fs = require("node:fs");
const path = require("node:path");

function blocked(message) {
  console.error(`BLOCKED_EXTERNAL: ${message}`);
  process.exit(2);
}
function distance(a, b) {
  const row = Array.from({ length: b.length + 1 }, (_, i) => i);
  for (let i = 1; i <= a.length; i += 1) {
    let previous = row[0];
    row[0] = i;
    for (let j = 1; j <= b.length; j += 1) {
      const old = row[j];
      row[j] = Math.min(
        row[j] + 1,
        row[j - 1] + 1,
        previous + (a[i - 1] === b[j - 1] ? 0 : 1),
      );
      previous = old;
    }
  }
  return row[b.length];
}
function normalized(text) {
  return text
    .normalize("NFKC")
    .toLocaleLowerCase()
    .replace(/[^\p{L}\p{N}\s]/gu, " ")
    .replace(/\s+/g, " ")
    .trim();
}

const manifestPath = process.env.F08_SAMPLE_MANIFEST;
if (!manifestPath) blocked("F08_SAMPLE_MANIFEST is not configured.");
if (!process.env.AZURE_SPEECH_KEY || !process.env.AZURE_SPEECH_REGION)
  blocked("Azure Speech credentials are not configured.");
const manifest = JSON.parse(fs.readFileSync(manifestPath, "utf8"));
if (!Array.isArray(manifest.samples) || !manifest.samples.length)
  blocked("The consented sample manifest is empty.");

const locale = { en: "en-US", ur: "ur-PK", hi: "hi-IN" };
const totals = {
  words: 0,
  wordErrors: 0,
  characters: 0,
  characterErrors: 0,
  cropTerms: 0,
  cropTermsCorrect: 0,
  latencyMs: 0,
};
(async () => {
  for (const sample of manifest.samples) {
    if (
      !sample.consentOrLicense ||
      !sample.reference ||
      !locale[sample.language]
    )
      blocked(
        "Every sample needs consentOrLicense, reference and a supported language.",
      );
    const audioPath = path.resolve(path.dirname(manifestPath), sample.file);
    const audio = fs.readFileSync(audioPath);
    const contentType =
      path.extname(audioPath).toLowerCase() === ".wav"
        ? "audio/wav"
        : "audio/ogg";
    const started = Date.now();
    const response = await fetch(
      `https://${process.env.AZURE_SPEECH_REGION}.stt.speech.microsoft.com/speech/recognition/conversation/cognitiveservices/v1?language=${locale[sample.language]}&format=detailed`,
      {
        method: "POST",
        headers: {
          "Ocp-Apim-Subscription-Key": process.env.AZURE_SPEECH_KEY,
          "content-type": contentType,
        },
        body: audio,
        signal: AbortSignal.timeout(30_000),
      },
    );
    totals.latencyMs += Date.now() - started;
    if (!response.ok)
      throw new Error(
        `Provider returned HTTP ${response.status} for sample ${sample.id}.`,
      );
    const body = await response.json();
    if (body.RecognitionStatus !== "Success" || !body.DisplayText)
      throw new Error(`No transcript for sample ${sample.id}.`);
    const expected = normalized(sample.reference);
    const actual = normalized(body.DisplayText);
    const expectedWords = expected.split(" ").filter(Boolean);
    const actualWords = actual.split(" ").filter(Boolean);
    totals.words += expectedWords.length;
    totals.wordErrors += distance(expectedWords, actualWords);
    totals.characters += [...expected].length;
    totals.characterErrors += distance([...expected], [...actual]);
    for (const term of sample.cropTerms ?? []) {
      totals.cropTerms += 1;
      if (actual.includes(normalized(term))) totals.cropTermsCorrect += 1;
    }
  }
  console.log(
    JSON.stringify(
      {
        provider: "AZURE_SPEECH",
        samples: manifest.samples.length,
        wer: totals.words ? totals.wordErrors / totals.words : null,
        cer: totals.characters
          ? totals.characterErrors / totals.characters
          : null,
        cropTermAccuracy: totals.cropTerms
          ? totals.cropTermsCorrect / totals.cropTerms
          : null,
        averageLatencyMs: Math.round(
          totals.latencyMs / manifest.samples.length,
        ),
      },
      null,
      2,
    ),
  );
})().catch((error) => {
  console.error(
    `RUN_FAIL: ${error instanceof Error ? error.message : "Speech evaluation failed."}`,
  );
  process.exit(1);
});

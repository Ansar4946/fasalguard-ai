#!/usr/bin/env node
"use strict";

const { createHash } = require("node:crypto");
const { readFile } = require("node:fs/promises");
const path = require("node:path");

const ALLOWED_LOCALES = new Set(["ur-PK", "hi-IN", "en-PK", "en-IN", "en-US"]);
const ALLOWED_TYPES = new Set([
  "audio/wav",
  "audio/x-wav",
  "audio/mpeg",
  "audio/ogg",
  "audio/webm",
  "audio/mp4",
]);

function normalizeText(value) {
  return value
    .normalize("NFKC")
    .toLocaleLowerCase("und")
    .replace(/[\p{P}\p{S}]+/gu, " ")
    .replace(/\s+/gu, " ")
    .trim();
}

function editDistance(left, right) {
  const previous = Array.from({ length: right.length + 1 }, (_, index) => index);
  for (let row = 1; row <= left.length; row += 1) {
    const current = [row];
    for (let column = 1; column <= right.length; column += 1) {
      current[column] = Math.min(
        current[column - 1] + 1,
        previous[column] + 1,
        previous[column - 1] + (left[row - 1] === right[column - 1] ? 0 : 1),
      );
    }
    previous.splice(0, previous.length, ...current);
  }
  return previous[right.length];
}

function scoreTranscript(reference, hypothesis, cropTerms = []) {
  const normalizedReference = normalizeText(reference);
  const normalizedHypothesis = normalizeText(hypothesis);
  const referenceWords = normalizedReference ? normalizedReference.split(" ") : [];
  const hypothesisWords = normalizedHypothesis ? normalizedHypothesis.split(" ") : [];
  const referenceCharacters = Array.from(normalizedReference.replace(/\s/gu, ""));
  const hypothesisCharacters = Array.from(normalizedHypothesis.replace(/\s/gu, ""));
  const terms = cropTerms.map(normalizeText).filter(Boolean);
  const matchedTerms = terms.filter((term) => normalizedHypothesis.includes(term)).length;
  return {
    wordErrors: editDistance(referenceWords, hypothesisWords),
    referenceWords: referenceWords.length,
    characterErrors: editDistance(referenceCharacters, hypothesisCharacters),
    referenceCharacters: referenceCharacters.length,
    matchedTerms,
    totalTerms: terms.length,
  };
}

function aggregateScores(samples) {
  const totals = samples.reduce(
    (sum, sample) => {
      for (const key of Object.keys(sum)) sum[key] += sample[key] ?? 0;
      return sum;
    },
    {
      wordErrors: 0,
      referenceWords: 0,
      characterErrors: 0,
      referenceCharacters: 0,
      matchedTerms: 0,
      totalTerms: 0,
      latencyMs: 0,
    },
  );
  const count = samples.length;
  return {
    sampleCount: count,
    wer: totals.referenceWords ? totals.wordErrors / totals.referenceWords : null,
    cer: totals.referenceCharacters ? totals.characterErrors / totals.referenceCharacters : null,
    cropTermAccuracy: totals.totalTerms ? totals.matchedTerms / totals.totalTerms : null,
    meanLatencyMs: count ? totals.latencyMs / count : null,
  };
}

function validateManifest(manifest, manifestPath) {
  if (!manifest || manifest.schemaVersion !== 1 || !Array.isArray(manifest.samples)) {
    throw new Error("Manifest must use schemaVersion 1 and contain a samples array.");
  }
  if (!manifest.datasetConsent || manifest.datasetConsent.allowedForProviderEvaluation !== true) {
    throw new Error("Manifest must explicitly permit provider evaluation for this dataset.");
  }
  if (typeof manifest.datasetConsent.licenseOrConsentRecord !== "string" || !manifest.datasetConsent.licenseOrConsentRecord.trim()) {
    throw new Error("Manifest must name the private consent or license record.");
  }
  if (manifest.samples.length === 0) throw new Error("Manifest contains no speech samples.");
  const base = path.dirname(path.resolve(manifestPath));
  return manifest.samples.map((sample, index) => {
    if (!sample || typeof sample.id !== "string" || !sample.id.trim()) throw new Error(`Sample ${index} has no id.`);
    if (!ALLOWED_LOCALES.has(sample.locale)) throw new Error(`Sample ${sample.id} has an unsupported locale.`);
    if (!ALLOWED_TYPES.has(sample.contentType)) throw new Error(`Sample ${sample.id} has an unsupported content type.`);
    if (typeof sample.referenceTranscript !== "string" || !sample.referenceTranscript.trim()) throw new Error(`Sample ${sample.id} has no reference transcript.`);
    if (!Array.isArray(sample.cropTerms) || sample.cropTerms.some((term) => typeof term !== "string")) throw new Error(`Sample ${sample.id} has invalid crop terms.`);
    if (!/^[a-f0-9]{64}$/i.test(sample.sha256 ?? "")) throw new Error(`Sample ${sample.id} must have a SHA-256 checksum.`);
    const audioPath = path.resolve(base, sample.audioFile ?? "");
    if (audioPath === base || !audioPath.startsWith(`${base}${path.sep}`)) throw new Error(`Sample ${sample.id} audio must be inside the private manifest directory.`);
    return { ...sample, audioPath };
  });
}

async function transcribeAzure({ audio, contentType, locale, region, key, timeoutMs }) {
  const endpoint = new URL(`https://${region}.stt.speech.microsoft.com/speech/recognition/conversation/cognitiveservices/v1`);
  endpoint.searchParams.set("language", locale);
  endpoint.searchParams.set("format", "detailed");
  const started = performance.now();
  const response = await fetch(endpoint, {
    method: "POST",
    headers: {
      "Ocp-Apim-Subscription-Key": key,
      "Content-Type": contentType,
      Accept: "application/json",
    },
    body: audio,
    signal: AbortSignal.timeout(timeoutMs),
  });
  const latencyMs = performance.now() - started;
  if (!response.ok) throw new Error(`Azure Speech returned HTTP ${response.status}.`);
  const body = await response.json();
  const transcript = body?.NBest?.[0]?.Display ?? body?.DisplayText;
  if (typeof transcript !== "string" || !transcript.trim()) throw new Error("Azure Speech returned no transcript.");
  return { transcript, latencyMs, provider: "AZURE_SPEECH", modelId: "conversation-rest-v1" };
}

async function runEvaluation({ manifestPath, region, key, timeoutMs = 30000, transcribe = transcribeAzure }) {
  const manifest = JSON.parse(await readFile(manifestPath, "utf8"));
  const samples = validateManifest(manifest, manifestPath);
  const results = [];
  for (const sample of samples) {
    const audio = await readFile(sample.audioPath);
    if (audio.length === 0 || audio.length > 25 * 1024 * 1024) throw new Error(`Sample ${sample.id} has an invalid audio size.`);
    const checksum = createHash("sha256").update(audio).digest("hex");
    if (checksum !== sample.sha256.toLowerCase()) throw new Error(`Sample ${sample.id} checksum does not match.`);
    const response = await transcribe({ audio, contentType: sample.contentType, locale: sample.locale, region, key, timeoutMs });
    results.push({ id: sample.id, locale: sample.locale, ...scoreTranscript(sample.referenceTranscript, response.transcript, sample.cropTerms), latencyMs: response.latencyMs });
  }
  return {
    status: "RUN_PASS",
    provider: "AZURE_SPEECH",
    evaluatedAt: new Date().toISOString(),
    aggregate: aggregateScores(results),
    byLocale: Object.fromEntries([...new Set(results.map((item) => item.locale))].sort().map((locale) => [locale, aggregateScores(results.filter((item) => item.locale === locale))])),
    samples: results.map(({ id, locale, latencyMs }) => ({ id, locale, latencyMs })),
  };
}

async function main() {
  const manifestPath = process.env.F08_SPEECH_MANIFEST;
  const region = process.env.AZURE_SPEECH_REGION;
  const key = process.env.AZURE_SPEECH_KEY;
  if (!manifestPath || !region || !key) {
    console.error(JSON.stringify({ status: "BLOCKED_EXTERNAL", reason: "F08_SPEECH_MANIFEST, AZURE_SPEECH_REGION, and AZURE_SPEECH_KEY are required." }));
    process.exitCode = 2;
    return;
  }
  if (!/^[a-z0-9-]+$/.test(region)) throw new Error("AZURE_SPEECH_REGION is invalid.");
  const output = await runEvaluation({ manifestPath, region, key, timeoutMs: Number(process.env.F08_SPEECH_TIMEOUT_MS ?? 30000) });
  console.log(JSON.stringify(output, null, 2));
}

if (require.main === module) main().catch((error) => {
  console.error(JSON.stringify({ status: "RUN_FAIL", reason: error instanceof Error ? error.message : "Speech evaluation failed." }));
  process.exitCode = 1;
});

module.exports = { aggregateScores, editDistance, normalizeText, runEvaluation, scoreTranscript, validateManifest };

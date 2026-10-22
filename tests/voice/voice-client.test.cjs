const assert = require("node:assert/strict");
const test = require("node:test");
const fs = require("node:fs");
const ts = require("typescript");
const vm = require("node:vm");

const source = fs.readFileSync(
  "features/conversations/voice-client.ts",
  "utf8",
);
const output = ts.transpileModule(source, {
  compilerOptions: {
    module: ts.ModuleKind.CommonJS,
    target: ts.ScriptTarget.ES2022,
  },
}).outputText;
const moduleRef = { exports: {} };
vm.runInNewContext(output, {
  module: moduleRef,
  exports: moduleRef.exports,
  require,
});
const { parseVoiceCapabilities, recordingFileName, selectRecordingType } =
  moduleRef.exports;

test("capability parser accepts only bounded truthful speech metadata", () => {
  const parsed = parseVoiceCapabilities({
    available: true,
    sttLanguages: ["ur", "bogus"],
    ttsLanguages: ["hi"],
    acceptedContentTypes: ["audio/webm", "text/plain"],
    maxRecordingSeconds: 120,
    consentVersion: "v1",
  });
  assert.deepEqual(Array.from(parsed.sttLanguages), ["ur"]);
  assert.deepEqual(Array.from(parsed.acceptedContentTypes), ["audio/webm"]);
  assert.equal(
    parseVoiceCapabilities({ available: true, maxRecordingSeconds: 0 }),
    null,
  );
});

test("recording type selection never invents unsupported codecs", () => {
  assert.equal(
    selectRecordingType(
      (type) => type === "audio/webm",
      ["audio/mp4", "audio/webm"],
    ),
    "audio/webm",
  );
  assert.equal(
    selectRecordingType(() => false, ["audio/webm"]),
    null,
  );
});

test("recording filenames contain no path input", () => {
  assert.match(
    recordingFileName("audio/mp4", new Date("2026-10-14T00:00:00Z")),
    /^voice-2026-10-14T00-00-00-000Z\.m4a$/,
  );
});

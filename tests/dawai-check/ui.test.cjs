const { test } = require("node:test");
const assert = require("node:assert/strict");
const { load } = require("./load.cjs");

const ui = load("ui");
const strings = load("strings");
const history = load("history");

const NOW = Date.parse("2026-10-23T12:00:00Z");
const t = (lang) => (key) => strings.translate(lang, key);

test("ui: relative time buckets, Latin digits, empty for old or invalid dates", () => {
  assert.match(ui.formatRelativeTime("2026-10-23T11:58:00Z", "en", NOW), /2 minutes ago/);
  assert.match(ui.formatRelativeTime("2026-10-23T09:00:00Z", "en", NOW), /3 hours ago/);
  assert.match(ui.formatRelativeTime("2026-10-22T11:00:00Z", "en", NOW), /yesterday/i);
  assert.match(ui.formatRelativeTime("2026-10-23T11:59:59Z", "en", NOW), /now|second/i);
  assert.equal(ui.formatRelativeTime("2026-10-01T11:00:00Z", "en", NOW), "");
  assert.equal(ui.formatRelativeTime("garbage", "en", NOW), "");
  const urdu = ui.formatRelativeTime("2026-10-23T11:50:00Z", "ur", NOW);
  assert.ok(urdu.length > 0);
  assert.match(urdu, /10/);
  assert.ok(!/[٠-٩۰-۹]/.test(urdu), "digits must stay Latin");
});

test("history: rows carry a relative label next to the absolute date", () => {
  const rows = history.formatHistory(
    [{ id: "1", createdAt: "2026-10-23T11:00:00Z", verdict: "VERIFIED", score: 0, demoDataset: true, brandName: "X" }],
    "en",
    NOW,
  );
  assert.match(rows[0].relativeLabel, /hour ago/);
  assert.match(rows[0].dateLabel, /2026/);
});

test("ui: gray stats and quality classification", () => {
  const w = 40;
  const h = 40;
  const flat = (v) => new Uint8Array(w * h).fill(v);
  const noisy = new Uint8Array(w * h).map((_, i) => ((i * 37) % 7) * 36);
  assert.equal(ui.classifyQuality(1200, 800, ui.computeGrayStats(flat(20), w, h)), "dark");
  assert.equal(ui.classifyQuality(1200, 800, ui.computeGrayStats(flat(240), w, h)), "bright");
  assert.equal(ui.classifyQuality(1200, 800, ui.computeGrayStats(flat(128), w, h)), "blurry");
  assert.equal(ui.classifyQuality(1200, 800, ui.computeGrayStats(noisy, w, h)), "ok");
  assert.equal(ui.classifyQuality(300, 200, ui.computeGrayStats(noisy, w, h)), "tiny");
  assert.deepEqual(ui.computeGrayStats([], 0, 0), { mean: 128, brightRatio: 0, sharpness: 999 });
});

test("ui: every quality hint has a string in both languages", () => {
  for (const key of ["qualityOk", "qualityDark", "qualityBright", "qualityTiny", "qualityBlurry"]) {
    assert.ok(strings.en[key] && strings.ur[key], key);
  }
});

test("ui: highlightMatch flags query words case-insensitively and keeps the full text", () => {
  const parts = ui.highlightMatch("DEMO Imidacloprid 20% SL", "imid 20");
  assert.equal(parts.map((p) => p.text).join(""), "DEMO Imidacloprid 20% SL");
  assert.deepEqual(
    parts.filter((p) => p.match).map((p) => p.text),
    ["Imid", "20"],
  );
  assert.deepEqual(ui.highlightMatch("Confidor", ""), [{ text: "Confidor", match: false }]);
  // regex metacharacters in the query are literal
  assert.doesNotThrow(() => ui.highlightMatch("a+b (c)", "+ ("));
  assert.equal(ui.highlightMatch("a+b", "+").filter((p) => p.match).length, 1);
});

const base = {
  id: "r1",
  createdAt: "2026-10-23T11:00:00Z",
  inputMode: "photo",
  language: "en",
  verdict: "VERIFIED",
  score: 12,
  demoDataset: true,
  extracted: { brandName: "DEMO Imidacloprid 20% SL" },
  matchedProduct: null,
  checks: [
    { code: "a", status: "pass", titleEn: "Name matches", titleUr: "نام ملتا ہے", detailEn: "", detailUr: "" },
    { code: "b", status: "warn", titleEn: "Expiry is close", titleUr: "تاریخ قریب ہے", detailEn: "", detailUr: "" },
  ],
  explanation: "",
  disclaimer: { en: "", ur: "" },
};

test("ui: share text keeps the honesty wording, demo flag and top warnings", () => {
  const text = ui.buildShareText(base, "en", t("en"));
  assert.match(text, /Consistent with the demo list/);
  assert.match(text, /DEMO DATASET/);
  assert.match(text, /Risk score: 12 \/ 100/);
  assert.match(text, /- Expiry is close/);
  assert.ok(!/Name matches/.test(text), "passed checks are not listed");
  assert.match(text, /risk screening, not a lab test/i);
  assert.ok(!/genuine|authentic|\bsafe\b/i.test(text));
});

test("ui: share text omits the score for unreadable labels and works in Urdu", () => {
  const unreadable = { ...base, verdict: "UNREADABLE", score: 0, demoDataset: false, checks: [] };
  const en = ui.buildShareText(unreadable, "en", t("en"));
  assert.ok(!/Risk score/.test(en));
  const ur = ui.buildShareText({ ...base, language: "ur" }, "ur", t("ur"));
  assert.ok(ur.includes("تاریخ قریب ہے"));
  assert.ok(ur.includes(strings.ur.disclaimerShort));
});

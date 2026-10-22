const { test } = require("node:test");
const assert = require("node:assert/strict");
const { load } = require("./load.cjs");

const presentation = load("presentation");
const strings = load("strings");
const image = load("image");
const manual = load("manual");
const history = load("history");

const forbidden = /genuine|authentic|\bsafe\b|safely|\bsafety\b/i;
const forbiddenUr = /اصلی|محفوظ|خالص/;

test("strings: en and ur define exactly the same keys, all non-empty", () => {
  const en = Object.keys(strings.en).sort();
  const ur = Object.keys(strings.ur).sort();
  assert.deepEqual(ur, en);
  for (const key of en) {
    assert.ok(strings.en[key].trim().length > 0, `en.${key} empty`);
    assert.ok(strings.ur[key].trim().length > 0, `ur.${key} empty`);
  }
});

test("strings: Urdu copy is in Urdu script and differs from English", () => {
  const arabicScript = /[؀-ۿ]/;
  for (const key of Object.keys(strings.en)) {
    assert.ok(arabicScript.test(strings.ur[key]), `ur.${key} has no Urdu script`);
  }
});

test("strings: no copy claims a product is genuine, authentic or safe", () => {
  for (const key of Object.keys(strings.en)) {
    assert.ok(!forbidden.test(strings.en[key]), `en.${key}: ${strings.en[key]}`);
    assert.ok(!forbiddenUr.test(strings.ur[key]), `ur.${key}: ${strings.ur[key]}`);
  }
});

test("strings: disclaimer says risk screening, not a lab test, in both languages", () => {
  assert.match(strings.en.disclaimerShort, /risk screening, not a lab test/i);
  assert.ok(strings.ur.disclaimerShort.includes("لیبارٹری"));
});

test("strings: translate falls back to English then the key", () => {
  assert.equal(strings.translate("ur", "title"), strings.ur.title);
  assert.equal(strings.translate("en", "no-such-key"), "no-such-key");
});

test("presentation: every verdict maps to existing string keys in both languages", () => {
  for (const verdict of ["VERIFIED", "SUSPICIOUS", "HIGH_RISK", "UNREADABLE"]) {
    for (const demo of [true, false]) {
      const p = presentation.verdictPresentation(verdict, demo);
      for (const key of [p.titleKey, p.summaryKey, ...p.nextStepKeys]) {
        assert.ok(key in strings.en, `${verdict}: missing en.${key}`);
        assert.ok(key in strings.ur, `${verdict}: missing ur.${key}`);
      }
    }
  }
});

test("presentation: demo VERIFIED uses the demo-list wording and shows the DEMO badge", () => {
  const demo = presentation.verdictPresentation("VERIFIED", true);
  assert.equal(demo.showDemoBadge, true);
  assert.equal(demo.titleKey, "verdictVerifiedDemoTitle");
  assert.equal(strings.en[demo.titleKey], "Consistent with the demo list");
  const real = presentation.verdictPresentation("VERIFIED", false);
  assert.equal(real.showDemoBadge, false);
  assert.equal(real.tone, "success");
  assert.equal(real.icon, "shield-check");
});

test("presentation: tones, retake and demo badge per verdict", () => {
  assert.equal(presentation.verdictPresentation("SUSPICIOUS", false).tone, "warning");
  assert.equal(presentation.verdictPresentation("HIGH_RISK", false).tone, "danger");
  const unreadable = presentation.verdictPresentation("UNREADABLE", false);
  assert.equal(unreadable.tone, "neutral");
  assert.equal(unreadable.showRetake, true);
  assert.equal(presentation.verdictPresentation("HIGH_RISK", true).showDemoBadge, true);
  assert.equal(presentation.verdictPresentation("SUSPICIOUS", false).showRetake, false);
});

test("presentation: risky verdicts tell the farmer what to do", () => {
  const steps = presentation.verdictPresentation("HIGH_RISK", false).nextStepKeys;
  assert.ok(steps.includes("stepHelpline") && steps.includes("stepReceipt") && steps.includes("stepExpert"));
  assert.ok(presentation.verdictPresentation("SUSPICIOUS", false).nextStepKeys.includes("stepExpert"));
});

test("presentation: failures sort first and order is stable", () => {
  const mk = (code, status) => ({ code, status, titleEn: code, titleUr: code, detailEn: "", detailUr: "" });
  const sorted = presentation.sortChecks([mk("a", "pass"), mk("b", "warn"), mk("c", "fail"), mk("d", "unknown"), mk("e", "fail")]);
  assert.deepEqual(sorted.map((c) => c.code), ["c", "e", "b", "d", "a"]);
});

test("presentation: score ring, clamping and similarity percent", () => {
  assert.equal(presentation.clampScore(140), 100);
  assert.equal(presentation.clampScore(-3), 0);
  assert.equal(presentation.clampScore(NaN), 0);
  const full = presentation.scoreRing(100);
  assert.ok(Math.abs(full.dashOffset) < 1e-9);
  const empty = presentation.scoreRing(0);
  assert.ok(Math.abs(empty.dashOffset - empty.circumference) < 1e-9);
  assert.equal(presentation.similarityPercent(0.874), 87);
  assert.equal(presentation.similarityPercent(92), 92);
});

test("presentation: speech text carries verdict, top warnings and disclaimer", () => {
  const result = {
    verdict: "SUSPICIOUS",
    demoDataset: false,
    language: "en",
    explanation: "Expiry looks wrong.",
    checks: [
      { code: "x", status: "pass", titleEn: "Fine", titleUr: "ٹھیک", detailEn: "", detailUr: "" },
      { code: "y", status: "fail", titleEn: "Expired", titleUr: "میعاد ختم", detailEn: "", detailUr: "" },
    ],
  };
  const t = (key) => strings.translate("en", key);
  const text = presentation.buildSpeechText(result, "en", t);
  assert.ok(text.includes(strings.en.verdictSuspiciousTitle));
  assert.ok(text.includes("Expired") && !text.includes("Fine"));
  assert.ok(text.includes("Expiry looks wrong."));
  assert.ok(text.endsWith(strings.en.disclaimerShort));
  const ur = presentation.buildSpeechText(result, "ur", (k) => strings.translate("ur", k));
  assert.ok(ur.includes("میعاد ختم"));
  assert.ok(!ur.includes("Expiry looks wrong."));
});

test("image: target size caps the longest edge at 1600 and keeps aspect ratio", () => {
  const big = image.computeTargetSize(4000, 3000);
  assert.deepEqual([big.width, big.height, big.needsResize], [1600, 1200, true]);
  const tall = image.computeTargetSize(3000, 6000);
  assert.deepEqual([tall.width, tall.height], [800, 1600]);
  const small = image.computeTargetSize(800, 600);
  assert.deepEqual([small.width, small.height, small.needsResize], [800, 600, false]);
  assert.equal(image.computeTargetSize(0, 100).width, 0);
});

test("image: source validation and re-encode decision", () => {
  assert.equal(image.validateSourceFile("application/pdf", 10), "type");
  assert.equal(image.validateSourceFile("image/png", 41 * 1024 * 1024), "tooBig");
  assert.equal(image.validateSourceFile("image/webp", 1000), null);
  assert.equal(image.needsReencode("image/jpeg", 200_000, 1200, 900), false);
  assert.equal(image.needsReencode("image/png", 200_000, 1200, 900), true);
  assert.equal(image.needsReencode("image/jpeg", 200_000, 3000, 900), true);
  assert.equal(image.jpegFileName("IMG 1.HEIC.png"), "IMG 1.HEIC.jpg");
});

test("manual: payload builder trims, drops empties and requires a brand", () => {
  const ok = manual.buildManualPayload(
    { brandName: "  Confidor  ", activeIngredient: " ", registrationNo: " 123 ", expiryDate: "2027-05-01T00:00:00Z" },
    "ur",
    450,
  );
  assert.deepEqual(ok, { ok: true, payload: { brandName: "Confidor", language: "ur", registrationNo: "123", expiryDate: "2027-05-01", priceRs: 450 } });
  assert.deepEqual(manual.buildManualPayload(manual.emptyFields, "en"), { ok: false, error: "brandRequired" });
  const bad = manual.buildManualPayload({ ...manual.emptyFields, brandName: "X", expiryDate: "next year" }, "en", -5);
  assert.deepEqual(bad.payload, { brandName: "X", language: "en" });
});

test("manual: field edits from extracted data are detected", () => {
  const original = manual.fieldsFromExtracted({ brandName: "Confidor ", activeIngredient: null, expiryDate: "2027-05-01" });
  assert.deepEqual(original, { brandName: "Confidor", activeIngredient: "", registrationNo: "", expiryDate: "2027-05-01" });
  assert.equal(manual.fieldsChanged(original, { ...original, brandName: "Confidor " }), false);
  assert.equal(manual.fieldsChanged(original, { ...original, registrationNo: "R-1" }), true);
  assert.equal(manual.parsePrice("1,250"), 1250);
  assert.equal(manual.parsePrice(""), undefined);
  assert.equal(manual.parsePrice("abc"), undefined);
});

test("history: newest first, null titles kept, scores clamped, dates in Latin digits", () => {
  const rows = history.formatHistory(
    [
      { id: "1", createdAt: "2026-10-20T08:00:00Z", verdict: "VERIFIED", score: 91, demoDataset: true, brandName: " Confidor " },
      { id: "2", createdAt: "2026-10-22T08:00:00Z", verdict: "HIGH_RISK", score: 240, demoDataset: false, brandName: null },
    ],
    "ur",
  );
  assert.deepEqual(rows.map((r) => r.id), ["2", "1"]);
  assert.equal(rows[0].title, null);
  assert.equal(rows[0].score, 100);
  assert.equal(rows[1].title, "Confidor");
  assert.equal(rows[1].demoDataset, true);
  assert.match(rows[1].dateLabel, /2026/);
  assert.match(history.formatDate("2026-10-20T08:00:00Z", "en"), /20/);
  assert.equal(history.formatDate("garbage", "en"), "");
});

test("history: list bodies may be an array or {items}", () => {
  assert.deepEqual(history.extractList([1, 2]), [1, 2]);
  assert.deepEqual(history.extractList({ items: [3] }), [3]);
  assert.deepEqual(history.extractList({}), []);
  assert.deepEqual(history.extractList(null), []);
});

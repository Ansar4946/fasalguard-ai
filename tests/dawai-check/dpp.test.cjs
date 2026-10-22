const { test } = require("node:test");
const assert = require("node:assert/strict");
const { load } = require("./load.cjs");

const presentation = load("presentation");
const strings = load("strings");
const ui = load("ui");

const t = (lang) => (key) => strings.translate(lang, key);
const forbiddenEn = /\b(?:registered|genuine|authentic|approved)\b|\bsafe\b|safely|\bsafety\b/i;
const forbiddenUr = /اصلی|محفوظ|خالص/;

const DPP_KEYS = [
  "dppChip",
  "dppChipAria",
  "dppChipNote",
  "dppBadge",
  "dppBadgeNote",
  "verdictDppTitle",
  "verdictDppSummary",
  "verdictUnconfirmedTitle",
  "verdictUnconfirmedSummary",
  "verdictBannedTitle",
  "verdictBannedSummary",
  "verdictBannedPremixTitle",
  "verdictBannedPremixSummary",
  "bannedRefLabel",
  "notifiedMatchTitle",
  "notifiedCategory",
  "notifiedWho",
  "notifiedNotification",
  "notFoundPlain",
  "stepDpp",
  "howIntroDpp",
  "howBannedDpp",
  "howPremix",
  "howNotified",
  "howNotFound",
  "dppSourcePrefix",
  "dppSourceSuffix",
  "sourceLinks",
];

const check = (code, status) => ({ code, status, titleEn: code, titleUr: code, detailEn: "", detailUr: "" });
const dppResult = (over = {}) => ({
  id: "r1",
  createdAt: "2026-10-23T11:00:00Z",
  inputMode: "photo",
  language: "en",
  verdict: "VERIFIED",
  score: 5,
  demoDataset: false,
  listCoverage: "DPP_PARTIAL",
  dataSources: [
    { name: "DPP List of Banned Pesticides", asOf: "2026-10-23", url: "https://plantprotection.gov.pk/a" },
    { name: "DPP Form-16", asOf: "2026-10-23", url: "https://plantprotection.gov.pk/b" },
  ],
  matchedNotified: {
    productText: "Abamectin 1.8% EC.",
    category: "Ins.",
    whoClass: "III",
    notification: "S.R.O. 636(I)/2005 dated 22.06.2005",
  },
  bannedMatch: null,
  extracted: { brandName: "Agrimectin" },
  matchedProduct: null,
  checks: [check("ingredient_notified", "pass")],
  explanation: "",
  disclaimer: { en: "", ur: "" },
  ...over,
});

test("dpp strings: every new key exists in en and ur with real Urdu script", () => {
  for (const key of DPP_KEYS) {
    assert.ok(strings.en[key]?.trim(), `en.${key}`);
    assert.ok(/[؀-ۿ]/.test(strings.ur[key] ?? ""), `ur.${key} has no Urdu script`);
  }
  assert.equal(strings.en.dppChip, "DPP LIST (PARTIAL, 2005)");
  assert.ok(strings.ur.dppChip.includes("ڈی پی پی"));
  assert.equal(strings.en.verdictDppTitle, "Consistent with the DPP notified list");
  assert.equal(strings.en.verdictBannedTitle, "Listed in the DPP banned pesticides list");
});

test("dpp strings: never claim registered / genuine / authentic / approved / safe", () => {
  for (const key of DPP_KEYS) {
    assert.ok(!forbiddenEn.test(strings.en[key]), `en.${key}: ${strings.en[key]}`);
    assert.ok(!forbiddenUr.test(strings.ur[key]), `ur.${key}: ${strings.ur[key]}`);
  }
  assert.match(strings.en.notFoundPlain, /does not mean the product is fake/);
  assert.match(strings.en.notFoundPlain, /dealer or the DPP/);
  assert.match(strings.en.verdictUnconfirmedSummary, /does not mean the product is fake/);
});

test("dpp presentation: DPP VERIFIED says consistent with the DPP notified list and shows the DPP badge, not DEMO", () => {
  const p = presentation.presentResult(dppResult());
  assert.equal(p.showDppBadge, true);
  assert.equal(p.showDemoBadge, false);
  assert.equal(p.titleKey, "verdictDppTitle");
  assert.equal(p.tone, "success");
});

test("dpp presentation: a demo row keeps the DEMO badge even when the DPP lists are loaded", () => {
  const p = presentation.presentResult(dppResult({ demoDataset: true }));
  assert.equal(p.showDemoBadge, true);
  assert.equal(p.showDppBadge, false);
  assert.equal(p.titleKey, "verdictVerifiedDemoTitle");
});

test("dpp presentation: results from an older API (no listCoverage) behave exactly as before", () => {
  const legacy = presentation.presentResult({ verdict: "VERIFIED", demoDataset: false, checks: [] });
  assert.equal(legacy.titleKey, "verdictVerifiedTitle");
  assert.equal(legacy.showDppBadge, false);
  assert.deepEqual(presentation.verdictPresentation("VERIFIED", false), legacy);
});

test("dpp presentation: not found on the partial list is neutral 'could not confirm', never a warning or 'fake'", () => {
  const r = dppResult({ verdict: "SUSPICIOUS", score: 25, matchedNotified: null, checks: [check("ingredient_notified", "unknown"), check("expiry_date", "pass")] });
  assert.equal(presentation.isUnconfirmed(r), true);
  const p = presentation.presentResult(r);
  assert.equal(p.tone, "neutral");
  assert.equal(p.titleKey, "verdictUnconfirmedTitle");
  assert.ok(p.nextStepKeys.includes("stepDpp"));
  for (const key of [p.titleKey, p.summaryKey, ...p.nextStepKeys]) {
    assert.ok(key in strings.en && key in strings.ur, key);
  }
  // A real warning (or a failed check) keeps the ordinary SUSPICIOUS wording.
  const warned = dppResult({ verdict: "SUSPICIOUS", checks: [check("ingredient_notified", "unknown"), check("expiry_date", "warn")] });
  assert.equal(presentation.isUnconfirmed(warned), false);
  assert.equal(presentation.presentResult(warned).titleKey, "verdictSuspiciousTitle");
});

test("dpp presentation: banned ingredient and banned pre-mixture get their own titles", () => {
  const ing = presentation.presentResult(
    dppResult({
      verdict: "HIGH_RISK",
      score: 100,
      matchedNotified: null,
      bannedMatch: { kind: "ingredient", name: "Endosulfan", notificationNumber: "S.R.O. 1329(I)/2012", notificationDate: "2012-10-22" },
    }),
  );
  assert.equal(ing.titleKey, "verdictBannedTitle");
  assert.equal(ing.tone, "danger");
  const premix = presentation.presentResult(
    dppResult({
      verdict: "HIGH_RISK",
      score: 100,
      matchedNotified: null,
      bannedMatch: { kind: "premix", name: "Ammo-phos 450 EC", notificationNumber: "SRO 624(I)/96", notificationDate: "1996-07-15" },
    }),
  );
  assert.equal(premix.titleKey, "verdictBannedPremixTitle");
  // Without a banned match the old high-risk wording is used.
  assert.equal(presentation.presentResult(dppResult({ verdict: "HIGH_RISK", bannedMatch: null })).titleKey, "verdictHighRiskTitle");
});

test("dpp presentation: source dates are formatted in Latin digits in both languages", () => {
  assert.equal(presentation.formatSourceDate("2026-10-23", "en"), "23 Oct 2026");
  assert.equal(presentation.formatSourceDate("2026-10-23", "ur"), "23 اکتوبر 2026");
  assert.equal(presentation.formatSourceDate("nonsense", "en"), "nonsense");
  assert.equal(presentation.latestSourceDate([{ asOf: "2026-10-23" }, { asOf: "2005-06-22" }]), "2026-10-23");
  assert.equal(presentation.latestSourceDate(undefined), null);
});

test("dpp ui: share text carries the DPP badge, banned reference, matched notified entry and source date", () => {
  const ok = ui.buildShareText(dppResult(), "en", t("en"));
  assert.match(ok, /Consistent with the DPP notified list/);
  assert.match(ok, /DPP LIST \(PARTIAL, 2005\)/);
  assert.match(ok, /Abamectin 1\.8% EC\./);
  assert.match(ok, /WHO class III/);
  assert.match(ok, /S\.R\.O\. 636\(I\)\/2005/);
  assert.match(ok, /retrieved 23 Oct 2026/);
  assert.ok(!/DEMO DATASET/.test(ok));
  assert.ok(!forbiddenEn.test(ok));
  const banned = ui.buildShareText(
    dppResult({
      verdict: "HIGH_RISK",
      score: 100,
      matchedNotified: null,
      bannedMatch: { kind: "ingredient", name: "Endosulfan", notificationNumber: "S.R.O. 1329(I)/2012", notificationDate: "2012-10-22" },
    }),
    "en",
    t("en"),
  );
  assert.match(banned, /Listed in the DPP banned pesticides list/);
  assert.match(banned, /Official reference: Endosulfan, S\.R\.O\. 1329\(I\)\/2012/);
  const ur = ui.buildShareText(dppResult(), "ur", t("ur"));
  assert.ok(ur.includes(strings.ur.verdictDppTitle));
  assert.ok(ur.includes("23 اکتوبر 2026"));
});

test("dpp presentation: speech text for a DPP result uses the DPP wording", () => {
  const text = presentation.buildSpeechText(dppResult(), "en", t("en"));
  assert.ok(text.includes(strings.en.verdictDppTitle));
  assert.ok(text.endsWith(strings.en.disclaimerShort));
});

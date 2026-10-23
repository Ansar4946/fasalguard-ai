const test = require("node:test");
const assert = require("node:assert/strict");
const { load } = require("./load.cjs");

const manual = load("manual");
const strings = load("strings");

test("picking a notified suggestion fills brand and ingredient", () => {
  const empty = { brandName: "abam", activeIngredient: "", registrationNo: "", expiryDate: "" };
  const next = manual.fieldsFromSuggestion(empty, { brandName: "Abamectin 1.8% EC", activeIngredient: "Abamectin" });
  assert.equal(next.brandName, "Abamectin 1.8% EC");
  assert.equal(next.activeIngredient, "Abamectin");
});

test("notified tag exists in both languages and avoids forbidden claims", () => {
  assert.ok(strings.en.dppNotifiedTag && strings.ur.dppNotifiedTag);
  assert.doesNotMatch(strings.en.dppNotifiedTag, /registered|genuine|safe|authentic|approved/i);
});

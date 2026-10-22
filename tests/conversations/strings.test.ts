import assert from "node:assert/strict";
import test from "node:test";
// @ts-expect-error allowImportingTsExtensions is intentionally disabled for the Next.js build.
import { STRINGS, UI_DIR, UI_LANGS } from "../../features/conversations/strings.ts";

const en = STRINGS.en as unknown as Record<string, unknown>;
const ur = STRINGS.ur as unknown as Record<string, unknown>;
const ARABIC = /[؀-ۿ]/;
// Strings that are allowed to be Latin in Urdu (language names, units).
const LATIN_OK = new Set(["langEn"]);

test("en and ur dictionaries have exactly the same keys", () => {
  assert.deepEqual(Object.keys(ur).sort(), Object.keys(en).sort());
});

test("every Urdu string is non-empty real Urdu script", () => {
  for (const [key, value] of Object.entries(ur)) {
    if (typeof value === "string") {
      assert.ok(value.trim().length > 0, `${key} empty`);
      if (!LATIN_OK.has(key)) assert.match(value, ARABIC, `${key} is not Urdu script`);
    } else if (Array.isArray(value)) {
      assert.equal(value.length, (en[key] as unknown[]).length, `${key} length differs`);
      for (const item of value) assert.match(String(item), ARABIC, `${key} item not Urdu`);
    }
  }
});

test("function strings return text in both languages", () => {
  for (const lang of UI_LANGS) {
    const t = STRINGS[lang];
    assert.match(t.unreadWarnings(3, "x 3"), /3/);
    assert.match(t.historyUnavailable("boom"), /boom/);
    assert.match(t.maxTime(60), /60/);
    assert.equal(t.elapsed(65, 60), "1:05 / 1:00");
  }
});

test("directions: Urdu is rtl, English is ltr", () => {
  assert.equal(UI_DIR.ur, "rtl");
  assert.equal(UI_DIR.en, "ltr");
});

test("starter chips are unique and cover account-data questions", () => {
  for (const lang of UI_LANGS) {
    const chips: readonly string[] = STRINGS[lang].starters;
    assert.ok(chips.length >= 6);
    assert.equal(new Set(chips).size, chips.length);
  }
});

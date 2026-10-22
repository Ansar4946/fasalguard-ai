import test from "node:test";
import assert from "node:assert/strict";
import { isAllowedApiBase, isDevBundle } from "../src/api-url.mjs";
import { coreBase } from "../src/ussd.mjs";

const LOCAL = ["http://127.0.0.1:4100/api/v1", "http://localhost:8000/api/v1", "http://10.0.2.2:4100/api/v1"];
const REMOTE = ["http://example.com/api/v1", "http://192.168.1.2:4000/api/v1", "http://127.0.0.1.evil.com/api/v1",
  "http://user@127.0.0.1/api", "http://evil.com/#127.0.0.1", "ftp://127.0.0.1/x", "127.0.0.1:4100", "", undefined];

test("release behaviour: only https is accepted, http is rejected even for loopback", () => {
  assert.equal(isAllowedApiBase("https://api.example.com/api/v1", false), true);
  for (const url of [...LOCAL, ...REMOTE]) assert.equal(isAllowedApiBase(url, false), false, String(url));
});

test("dev behaviour: http allowed only for 10.0.2.2, localhost and 127.0.0.1", () => {
  assert.equal(isAllowedApiBase("https://api.example.com/api/v1", true), true);
  for (const url of LOCAL) assert.equal(isAllowedApiBase(url, true), true, url);
  for (const url of REMOTE) assert.equal(isAllowedApiBase(url, true), false, String(url));
});

test("node and release bundles are not dev, so coreBase keeps rejecting http", () => {
  assert.equal(isDevBundle(), false);
  assert.throws(() => coreBase("http://127.0.0.1:4100/api/v1"), /HTTPS_REQUIRED/);
  globalThis.__DEV__ = false;
  try { assert.equal(isDevBundle(), false); assert.throws(() => coreBase("http://localhost/x"), /HTTPS_REQUIRED/); }
  finally { delete globalThis.__DEV__; }
});

test("a development bundle (__DEV__ true) accepts loopback http only", () => {
  globalThis.__DEV__ = true;
  try {
    assert.equal(coreBase("http://127.0.0.1:4100/api/v1/"), "http://127.0.0.1:4100/api/v1");
    assert.throws(() => coreBase("http://example.com/api/v1"), /HTTPS_REQUIRED/);
  } finally { delete globalThis.__DEV__; }
});

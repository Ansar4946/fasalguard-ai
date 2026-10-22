import { test } from "node:test";
import assert from "node:assert/strict";
import { describePush, disablePush, enablePush, refreshPushToken } from "../src/push-registration.mjs";

const BASE = "https://api.example.test/api/v1";
const ID = "3c63d709-a06d-4aa1-b660-c40d04b8dddb";
const TOKEN = "fcm-token-".padEnd(60, "x");

function fakes(over = {}) {
  const saved = { id: over.storedId ?? null };
  const notifications = {
    getPermissions: async () => over.permission ?? { granted: true, canAskAgain: true },
    requestPermissions: async () => over.requested ?? { granted: true, canAskAgain: true },
    getDeviceToken: over.getDeviceToken ?? (async () => ({ type: "android", data: TOKEN })),
  };
  const store = {
    save: async (id) => { saved.id = id; },
    load: async () => saved.id,
    clear: async () => { saved.id = null; },
  };
  const calls = [];
  const fetchImpl = over.fetchImpl ?? (async (url, init) => {
    calls.push({ url, method: init?.method ?? "GET", body: init?.body, auth: init?.headers?.authorization });
    return { status: 200, ok: true, json: async () => ({ id: ID, platform: "ANDROID", active: true, revoked: true }) };
  });
  return { notifications, store, saved, calls, fetchImpl };
}
const run = (over, platform = "ANDROID") => {
  const f = fakes(over);
  return { f, result: enablePush({ base: BASE, accessToken: "bearer-1", platform, notifications: f.notifications, store: f.store, fetchImpl: f.fetchImpl }) };
};

test("registers this phone and remembers the server token id", async () => {
  const { f, result } = run();
  assert.deepEqual(await result, { status: "REGISTERED", id: ID });
  assert.equal(f.saved.id, ID);
  assert.equal(f.calls.length, 1);
  assert.equal(f.calls[0].url, `${BASE}/devices/push-token`);
  assert.equal(f.calls[0].auth, "Bearer bearer-1");
  assert.deepEqual(JSON.parse(f.calls[0].body), { token: TOKEN, platform: "ANDROID" });
});

test("asks for permission only when it is not already granted, and stops if refused", async () => {
  let asked = 0;
  const denied = run({ permission: { granted: false, canAskAgain: true }, requested: { granted: false, canAskAgain: false } });
  denied.f.notifications.requestPermissions = async () => { asked += 1; return { granted: false, canAskAgain: false }; };
  assert.deepEqual(await denied.result, { status: "PERMISSION_DENIED", canAskAgain: false });
  assert.equal(denied.f.calls.length, 0, "no server call without permission");
  assert.equal(denied.f.saved.id, null);
  const already = run();
  already.f.notifications.requestPermissions = async () => { asked += 100; return { granted: true }; };
  await already.result;
  assert.equal(asked, 1, "granted permission is not requested again");
});

test("a build without Firebase configuration reports TOKEN_UNAVAILABLE and registers nothing", async () => {
  const thrown = run({ getDeviceToken: async () => { throw new Error("Default FirebaseApp is not initialized"); } });
  assert.deepEqual(await thrown.result, { status: "TOKEN_UNAVAILABLE" });
  for (const bad of [null, { type: "android", data: "short" }, { type: "ios", data: TOKEN }, { type: "web", data: TOKEN }, { type: "android", data: 42 }]) {
    const r = run({ getDeviceToken: async () => bad });
    assert.deepEqual(await r.result, { status: "TOKEN_UNAVAILABLE" });
    assert.equal(r.f.calls.length, 0);
    assert.equal(r.f.saved.id, null);
  }
});

test("only Android and iOS phones can register", async () => {
  const r = run({}, "WEB");
  assert.deepEqual(await r.result, { status: "UNSUPPORTED_PLATFORM" });
  assert.equal(r.f.calls.length, 0);
  const ios = run({ getDeviceToken: async () => ({ type: "ios", data: TOKEN }) }, "IOS");
  assert.equal((await ios.result).status, "REGISTERED");
});

test("server errors are reported and nothing is remembered locally", async () => {
  for (const [status, code] of [[401, "UNAUTHORIZED"], [500, "HTTP_500"]]) {
    const r = run({ fetchImpl: async () => ({ status, ok: false, json: async () => ({}) }) });
    assert.deepEqual(await r.result, { status: "SERVER_REJECTED", code });
    assert.equal(r.f.saved.id, null);
  }
  const malformed = run({ fetchImpl: async () => ({ status: 201, ok: true, json: async () => ({ id: "not-a-uuid" }) }) });
  assert.deepEqual(await malformed.result, { status: "SERVER_REJECTED", code: "MALFORMED" });
  assert.equal(malformed.f.saved.id, null);
  const insecure = enablePush({ base: "http://insecure.test", accessToken: "t", platform: "ANDROID", ...fakes(), fetchImpl: undefined });
  assert.equal((await insecure).status, "SERVER_REJECTED");
});

test("turning push off removes the server token, then forgets it; repeating is safe", async () => {
  const f = fakes({ storedId: ID });
  assert.deepEqual(await disablePush({ base: BASE, accessToken: "bearer-1", store: f.store, fetchImpl: f.fetchImpl }), { status: "DISABLED" });
  assert.equal(f.calls[0].method, "DELETE");
  assert.equal(f.calls[0].url, `${BASE}/devices/push-token/${ID}`);
  assert.equal(f.saved.id, null);
  assert.deepEqual(await disablePush({ base: BASE, accessToken: "bearer-1", store: f.store, fetchImpl: f.fetchImpl }), { status: "NOT_REGISTERED" });
  assert.equal(f.calls.length, 1);
});

test("a server that no longer knows the token (404) counts as removed; other failures keep it for retry", async () => {
  const gone = fakes({ storedId: ID, fetchImpl: async () => ({ status: 404, ok: false, json: async () => ({}) }) });
  assert.deepEqual(await disablePush({ base: BASE, accessToken: "t", store: gone.store, fetchImpl: gone.fetchImpl }), { status: "DISABLED" });
  assert.equal(gone.saved.id, null);
  const down = fakes({ storedId: ID, fetchImpl: async () => ({ status: 503, ok: false, json: async () => ({}) }) });
  assert.deepEqual(await disablePush({ base: BASE, accessToken: "t", store: down.store, fetchImpl: down.fetchImpl }), { status: "SERVER_REJECTED", code: "HTTP_503" });
  assert.equal(down.saved.id, ID, "kept so the farmer can retry");
});

test("token rotation re-registers only when push is on", async () => {
  const off = fakes();
  assert.deepEqual(await refreshPushToken({ base: BASE, accessToken: "t", platform: "ANDROID", newToken: TOKEN, store: off.store, fetchImpl: off.fetchImpl }), { status: "NOT_REGISTERED" });
  assert.equal(off.calls.length, 0);
  const on = fakes({ storedId: ID });
  const next = "rotated-".padEnd(60, "y");
  assert.deepEqual(await refreshPushToken({ base: BASE, accessToken: "t", platform: "ANDROID", newToken: next, store: on.store, fetchImpl: on.fetchImpl }), { status: "REGISTERED", id: ID });
  assert.equal(JSON.parse(on.calls[0].body).token, next);
  assert.deepEqual(await refreshPushToken({ base: BASE, accessToken: "t", platform: "ANDROID", newToken: "short", store: on.store, fetchImpl: on.fetchImpl }), { status: "TOKEN_UNAVAILABLE" });
});

test("every outcome has farmer-readable wording, and the no-Firebase case is stated plainly", () => {
  for (const status of ["REGISTERED", "DISABLED", "NOT_REGISTERED", "PERMISSION_DENIED", "UNSUPPORTED_PLATFORM", "TOKEN_UNAVAILABLE", "SERVER_REJECTED"])
    assert.ok(describePush(status).length > 10, status);
  assert.match(describePush("TOKEN_UNAVAILABLE"), /no push configuration \(Firebase\)/);
  assert.match(describePush("anything-else"), /unknown/);
});

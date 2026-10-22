import { test } from "node:test";
import assert from "node:assert/strict";
import {
  describeDelivery,
  describeError,
  fetchPreferences,
  fetchUnreadCount,
  listNotifications,
  markAllRead,
  markRead,
  parseNotification,
  parseNotifications,
  parsePreferences,
  parseUnreadCount,
  registerPushToken,
  savePreference,
  unreadLabel,
} from "../src/notifications.mjs";

const ID = "3c63d709-a06d-4aa1-b660-c40d04b8dddb";
const BASE = "https://api.example.test/api/v1";
const row = { id: ID, category: "WEATHER", title: "Inspect", body: "Body", readAt: null, createdAt: "2026-10-15T10:00:00Z", delivery: { SCHEDULED: 1 } };
const reply = (status, body) => async () => ({
  status,
  ok: status >= 200 && status < 300,
  json: async () => {
    if (body === undefined) throw new Error("bad json");
    return body;
  },
});

test("parses notifications strictly and treats a malformed list as an error, not empty", () => {
  assert.equal(parseNotification(row)?.category, "WEATHER");
  for (const bad of [null, {}, { ...row, id: "x" }, { ...row, category: "GOSSIP" }, { ...row, createdAt: "never" }, { ...row, delivery: { SENT: -1 } }])
    assert.equal(parseNotification(bad), null);
  assert.deepEqual(parseNotifications([]), []);
  assert.equal(parseNotifications({ records: [] }), null);
  assert.equal(parseNotifications([row, {}]), null);
});

test("unread count and preferences are validated", () => {
  assert.equal(parseUnreadCount({ count: 2 }), 2);
  for (const bad of [null, {}, { count: -1 }, { count: "1" }]) assert.equal(parseUnreadCount(bad), null);
  const ok = { consentGranted: false, categories: [{ category: "TASK", pushEnabled: true, quietHoursStart: null, quietHoursEnd: null, timezone: "Asia/Karachi" }] };
  assert.equal(parsePreferences(ok)?.consentGranted, false);
  assert.equal(parsePreferences({ ...ok, categories: [{ ...ok.categories[0], quietHoursStart: "99:00" }] }), null);
  assert.equal(parsePreferences({ consentGranted: 1, categories: [] }), null);
});

test("delivery wording never claims more than was recorded", () => {
  assert.equal(describeDelivery({}), "In the app only");
  assert.equal(describeDelivery({ SENT: 1 }), "Push sent (delivery not confirmed)");
  assert.equal(describeDelivery({ DELIVERED: 1 }), "Delivered to your device");
  assert.equal(describeDelivery({ INVALID_TOKEN: 1 }), "Push could not be delivered");
  assert.equal(unreadLabel(null), "Notification count unavailable");
  assert.equal(unreadLabel(1), "1 unread notification");
});

test("API calls send the bearer token over HTTPS only and map failures distinctly", async () => {
  let seen;
  const spy = async (url, init) => {
    seen = { url, init };
    return { status: 200, ok: true, json: async () => [row] };
  };
  assert.equal((await listNotifications(BASE, "secret-token", spy)).length, 1);
  assert.equal(seen.url, `${BASE}/notifications`);
  assert.equal(seen.init.headers.authorization, "Bearer secret-token");
  await assert.rejects(listNotifications("http://insecure.test/api/v1", "t", spy), /HTTPS_REQUIRED/);
  await assert.rejects(listNotifications(BASE, "t", reply(401, {})), /UNAUTHORIZED/);
  await assert.rejects(listNotifications(BASE, "t", reply(500, {})), /HTTP_500/);
  await assert.rejects(listNotifications(BASE, "t", reply(200, { records: [] })), /MALFORMED/);
  await assert.rejects(listNotifications(BASE, "t", reply(200, undefined)), /MALFORMED/);
  assert.equal(await fetchUnreadCount(BASE, "t", reply(200, { count: 4 })), 4);
  await assert.rejects(fetchUnreadCount(BASE, "t", reply(200, { count: "4" })), /MALFORMED/);
  await assert.rejects(fetchPreferences(BASE, "t", reply(200, {})), /MALFORMED/);
  assert.match(describeError("UNAUTHORIZED"), /session has ended/);
});

test("mark read, read all and saving a preference use the right requests", async () => {
  const calls = [];
  const spy = async (url, init) => {
    calls.push({ url, method: init?.method ?? "GET", body: init?.body });
    return { status: 200, ok: true, json: async () => ({}) };
  };
  await markRead(BASE, "t", ID, spy);
  await markAllRead(BASE, "t", spy);
  await savePreference(BASE, "t", { category: "TASK", pushEnabled: false, quietHoursStart: "22:00", quietHoursEnd: "06:00", timezone: "Asia/Karachi" }, spy);
  await savePreference(BASE, "t", { category: "SYSTEM", pushEnabled: true, quietHoursStart: null, quietHoursEnd: null, timezone: "Asia/Karachi" }, spy);
  assert.deepEqual(calls.map((c) => [c.method, c.url.replace(BASE, "")]), [
    ["PATCH", `/notifications/${ID}/read`],
    ["POST", "/notifications/read-all"],
    ["PUT", "/notifications/preferences/TASK"],
    ["PUT", "/notifications/preferences/SYSTEM"],
  ]);
  assert.deepEqual(JSON.parse(calls[2].body), { pushEnabled: false, quietHoursStart: "22:00", quietHoursEnd: "06:00", timezone: "Asia/Karachi" });
  assert.deepEqual(JSON.parse(calls[3].body), { pushEnabled: true, timezone: "Asia/Karachi" });
  assert.throws(() => markRead(BASE, "t", "../../x", spy), /MALFORMED/);
  assert.throws(() => savePreference(BASE, "t", { category: "GOSSIP", pushEnabled: true, timezone: "UTC" }, spy), /MALFORMED/);
});

test("push token registration validates its input before any request", async () => {
  let called = false;
  const spy = async () => {
    called = true;
    return { status: 201, ok: true, json: async () => ({}) };
  };
  assert.throws(() => registerPushToken(BASE, "t", { pushToken: "short", platform: "ANDROID" }, spy), /MALFORMED/);
  assert.throws(() => registerPushToken(BASE, "t", { pushToken: "x".repeat(40), platform: "WEB" }, spy), /MALFORMED/);
  assert.equal(called, false);
  await registerPushToken(BASE, "t", { pushToken: "x".repeat(40), platform: "ANDROID" }, spy);
  assert.equal(called, true);
});

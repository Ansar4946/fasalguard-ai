import assert from "node:assert/strict";
import test from "node:test";
// Node's type-stripping test runner requires the source extension at runtime.
// @ts-expect-error allowImportingTsExtensions is intentionally disabled for the Next.js build.
import { badgeText, describeDelivery, parseNotification, parseNotifications, parsePreferences, parseUnreadCount, unreadLabel } from "../../features/notifications/notifications.ts";

const ID = "3c63d709-a06d-4aa1-b660-c40d04b8dddb";
const row = { id: ID, category: "WEATHER", title: "Inspect", body: "Body", data: {}, readAt: null, createdAt: "2026-10-15T10:00:00Z", delivery: { SCHEDULED: 2 } };

test("accepts a well-formed notification and normalizes a missing delivery summary", () => {
  assert.equal(parseNotification(row)?.category, "WEATHER");
  assert.deepEqual(parseNotification({ ...row, delivery: undefined })?.delivery, {});
  assert.equal(parseNotification({ ...row, readAt: "2026-10-15T11:00:00Z" })?.readAt, "2026-10-15T11:00:00Z");
});

test("rejects malformed notifications instead of showing them", () => {
  for (const bad of [null, "x", {}, { ...row, id: "nope" }, { ...row, category: "GOSSIP" }, { ...row, title: 5 }, { ...row, createdAt: "yesterday" },
    { ...row, readAt: "soon" }, { ...row, delivery: [] }, { ...row, delivery: { SENT: -1 } }, { ...row, delivery: { SENT: 1.5 } }])
    assert.equal(parseNotification(bad), null);
});

test("a list is empty only when the response really is an empty array", () => {
  assert.deepEqual(parseNotifications([]), []);
  assert.equal(parseNotifications({ records: [] }), null);
  assert.equal(parseNotifications(null), null);
  assert.equal(parseNotifications([row, { bogus: true }]), null);
  assert.equal(parseNotifications([row])?.length, 1);
});

test("unread count must be a non-negative integer", () => {
  assert.equal(parseUnreadCount({ count: 3 }), 3);
  assert.equal(parseUnreadCount({ count: 0 }), 0);
  for (const bad of [null, {}, { count: -1 }, { count: 1.5 }, { count: "2" }]) assert.equal(parseUnreadCount(bad), null);
});

test("preferences are validated strictly", () => {
  const ok = { consentGranted: true, categories: [{ category: "TASK", pushEnabled: false, quietHoursStart: "22:00", quietHoursEnd: "06:00", timezone: "Asia/Karachi" }] };
  assert.equal(parsePreferences(ok)?.categories[0].quietHoursStart, "22:00");
  for (const bad of [null, {}, { consentGranted: "yes", categories: [] }, { consentGranted: true, categories: [{ ...ok.categories[0], quietHoursStart: "25:00" }] },
    { consentGranted: true, categories: [{ ...ok.categories[0], category: "X" }] }, { consentGranted: true, categories: [null] }])
    assert.equal(parsePreferences(bad), null);
});

test("delivery text never claims more than the recorded status", () => {
  assert.equal(describeDelivery({}), "In the app only");
  assert.equal(describeDelivery({ SCHEDULED: 1 }), "Push scheduled");
  assert.equal(describeDelivery({ SENT: 1 }), "Push sent (delivery not confirmed)");
  assert.equal(describeDelivery({ SENT: 1, DELIVERED: 1 }), "Delivered to your device");
  assert.equal(describeDelivery({ FAILED: 1 }), "Push could not be delivered");
  assert.equal(describeDelivery({ INVALID_TOKEN: 1 }), "Push could not be delivered");
});

test("badge and labels are honest about zero, unknown and large counts", () => {
  assert.equal(badgeText(0), null);
  assert.equal(badgeText(null), null);
  assert.equal(badgeText(7), "7");
  assert.equal(badgeText(250), "99+");
  assert.equal(unreadLabel(null), "Notification count unavailable");
  assert.equal(unreadLabel(0), "No unread notifications");
  assert.equal(unreadLabel(1), "1 unread notification");
  assert.equal(unreadLabel(2), "2 unread notifications");
});

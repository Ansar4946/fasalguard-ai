// Notification client logic for the mobile app. Mirrors features/notifications/notifications.ts in the
// web app (parsers and honest delivery wording); keep the two in step. Authenticated, HTTPS only.
import { coreBase } from "./ussd.mjs";

export const CATEGORIES = ["SATELLITE", "WEATHER", "DIAGNOSIS", "EXPERT", "OUTBREAK", "TASK", "SYSTEM"];
export const CATEGORY_LABELS = {
  SATELLITE: "Satellite",
  WEATHER: "Weather",
  DIAGNOSIS: "Crop scan",
  EXPERT: "Expert",
  OUTBREAK: "Outbreak",
  TASK: "Task",
  SYSTEM: "System",
};

const uuid = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const isCategory = (value) => typeof value === "string" && CATEGORIES.includes(value);
const isTime = (value) => value === null || (typeof value === "string" && /^([01]\d|2[0-3]):[0-5]\d$/.test(value));

export function parseNotification(value) {
  if (!value || typeof value !== "object") return null;
  const row = value;
  if (
    typeof row.id !== "string" ||
    !uuid.test(row.id) ||
    !isCategory(row.category) ||
    typeof row.title !== "string" ||
    typeof row.body !== "string" ||
    typeof row.createdAt !== "string" ||
    Number.isNaN(Date.parse(row.createdAt)) ||
    !(row.readAt === null || (typeof row.readAt === "string" && !Number.isNaN(Date.parse(row.readAt))))
  )
    return null;
  const delivery = row.delivery ?? {};
  if (!delivery || typeof delivery !== "object" || Array.isArray(delivery)) return null;
  const counts = {};
  for (const [status, count] of Object.entries(delivery)) {
    if (typeof count !== "number" || !Number.isInteger(count) || count < 0) return null;
    counts[status] = count;
  }
  return { id: row.id, category: row.category, title: row.title, body: row.body, readAt: row.readAt, createdAt: row.createdAt, delivery: counts };
}

/** A malformed list is an error, never an empty inbox. */
export function parseNotifications(value) {
  if (!Array.isArray(value)) return null;
  const items = value.map(parseNotification);
  return items.some((item) => item === null) ? null : items;
}

export function parseUnreadCount(value) {
  const count = value && typeof value === "object" ? value.count : undefined;
  return typeof count === "number" && Number.isInteger(count) && count >= 0 ? count : null;
}

export function parsePreferences(value) {
  if (!value || typeof value !== "object") return null;
  if (typeof value.consentGranted !== "boolean" || !Array.isArray(value.categories)) return null;
  const categories = [];
  for (const row of value.categories) {
    if (!row || typeof row !== "object") return null;
    if (!isCategory(row.category) || typeof row.pushEnabled !== "boolean" || !isTime(row.quietHoursStart) || !isTime(row.quietHoursEnd) || typeof row.timezone !== "string")
      return null;
    categories.push({ category: row.category, pushEnabled: row.pushEnabled, quietHoursStart: row.quietHoursStart, quietHoursEnd: row.quietHoursEnd, timezone: row.timezone });
  }
  return { consentGranted: value.consentGranted, categories };
}

/** SENT means the provider accepted the push, not that a phone received it. */
export function describeDelivery(delivery) {
  const n = (status) => delivery[status] ?? 0;
  if (n("DELIVERED") > 0) return "Delivered to your device";
  if (n("SENT") > 0) return "Push sent (delivery not confirmed)";
  if (n("SCHEDULED") > 0) return "Push scheduled";
  if (n("FAILED") > 0 || n("INVALID_TOKEN") > 0) return "Push could not be delivered";
  return "In the app only";
}

export function unreadLabel(count) {
  if (count === null) return "Notification count unavailable";
  if (count === 0) return "No unread notifications";
  return `${count} unread notification${count === 1 ? "" : "s"}`;
}

async function request(base, token, path, init, fetchImpl) {
  const response = await fetchImpl(`${coreBase(base)}${path}`, {
    ...init,
    headers: {
      accept: "application/json",
      authorization: `Bearer ${token}`,
      ...(init?.body ? { "content-type": "application/json" } : {}),
    },
    signal: AbortSignal.timeout(15000),
  });
  if (response.status === 401) throw new Error("UNAUTHORIZED");
  if (!response.ok) throw new Error(`HTTP_${response.status}`);
  return response.json().catch(() => {
    throw new Error("MALFORMED");
  });
}

export async function listNotifications(base, token, fetchImpl = fetch) {
  const items = parseNotifications(await request(base, token, "/notifications", {}, fetchImpl));
  if (!items) throw new Error("MALFORMED");
  return items;
}

export async function fetchUnreadCount(base, token, fetchImpl = fetch) {
  const count = parseUnreadCount(await request(base, token, "/notifications/unread-count", {}, fetchImpl));
  if (count === null) throw new Error("MALFORMED");
  return count;
}

export function markRead(base, token, id, fetchImpl = fetch) {
  if (!uuid.test(id)) throw new Error("MALFORMED");
  return request(base, token, `/notifications/${id}/read`, { method: "PATCH" }, fetchImpl);
}

export function markAllRead(base, token, fetchImpl = fetch) {
  return request(base, token, "/notifications/read-all", { method: "POST", body: "{}" }, fetchImpl);
}

export async function fetchPreferences(base, token, fetchImpl = fetch) {
  const prefs = parsePreferences(await request(base, token, "/notifications/preferences", {}, fetchImpl));
  if (!prefs) throw new Error("MALFORMED");
  return prefs;
}

/** Saves one category, keeping its existing quiet hours and time zone. */
export function savePreference(base, token, preference, fetchImpl = fetch) {
  if (!isCategory(preference.category)) throw new Error("MALFORMED");
  const quiet = preference.quietHoursStart && preference.quietHoursEnd;
  return request(
    base,
    token,
    `/notifications/preferences/${preference.category}`,
    {
      method: "PUT",
      body: JSON.stringify({
        pushEnabled: preference.pushEnabled,
        ...(quiet ? { quietHoursStart: preference.quietHoursStart, quietHoursEnd: preference.quietHoursEnd } : {}),
        timezone: preference.timezone,
      }),
    },
    fetchImpl,
  );
}

/**
 * Registers this phone's push token with the server. Obtaining the token itself needs the native
 * Firebase setup (google-services.json and a device build), which this release does not include.
 */
export function registerPushToken(base, token, { pushToken, platform }, fetchImpl = fetch) {
  if (typeof pushToken !== "string" || pushToken.length < 20 || !["ANDROID", "IOS"].includes(platform))
    throw new Error("MALFORMED");
  return request(base, token, "/devices/push-token", { method: "POST", body: JSON.stringify({ token: pushToken, platform }) }, fetchImpl);
}

/** Removes one of the caller's own push tokens (the server returns 404 for anyone else's). */
export function deletePushToken(base, token, id, fetchImpl = fetch) {
  if (!uuid.test(id)) throw new Error("MALFORMED");
  return request(base, token, `/devices/push-token/${id}`, { method: "DELETE" }, fetchImpl);
}

export function describeError(code) {
  switch (code) {
    case "HTTPS_REQUIRED":
      return "A secure server address is not configured, so notifications are unavailable.";
    case "UNAUTHORIZED":
      return "Your session has ended. Sign in again to see your notifications.";
    case "MALFORMED":
      return "The server response was not understood. Nothing was assumed.";
    default:
      return "The server could not be reached. Try again.";
  }
}

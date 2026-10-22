export const CATEGORIES = ["SATELLITE", "WEATHER", "DIAGNOSIS", "EXPERT", "OUTBREAK", "TASK", "SYSTEM"] as const;
export type Category = (typeof CATEGORIES)[number];

export const CATEGORY_LABELS: Record<Category, string> = {
  SATELLITE: "Satellite",
  WEATHER: "Weather",
  DIAGNOSIS: "Crop scan",
  EXPERT: "Expert",
  OUTBREAK: "Outbreak",
  TASK: "Task",
  SYSTEM: "System",
};

export interface NotificationItem {
  id: string;
  category: Category;
  title: string;
  body: string;
  readAt: string | null;
  createdAt: string;
  delivery: Record<string, number>;
}

export interface CategoryPreference {
  category: Category;
  pushEnabled: boolean;
  quietHoursStart: string | null;
  quietHoursEnd: string | null;
  timezone: string;
}
export interface Preferences {
  consentGranted: boolean;
  categories: CategoryPreference[];
}

const uuid = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const isCategory = (value: unknown): value is Category =>
  typeof value === "string" && (CATEGORIES as readonly string[]).includes(value);
const isTime = (value: unknown): value is string | null =>
  value === null || (typeof value === "string" && /^([01]\d|2[0-3]):[0-5]\d$/.test(value));

export function parseNotification(value: unknown): NotificationItem | null {
  if (!value || typeof value !== "object") return null;
  const row = value as Record<string, unknown>;
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
  const counts: Record<string, number> = {};
  for (const [status, count] of Object.entries(delivery)) {
    if (typeof count !== "number" || !Number.isInteger(count) || count < 0) return null;
    counts[status] = count;
  }
  return {
    id: row.id,
    category: row.category,
    title: row.title,
    body: row.body,
    readAt: row.readAt as string | null,
    createdAt: row.createdAt,
    delivery: counts,
  };
}

/** A malformed list is an error, never an empty inbox. */
export function parseNotifications(value: unknown): NotificationItem[] | null {
  if (!Array.isArray(value)) return null;
  const items = value.map(parseNotification);
  return items.some((item) => item === null) ? null : (items as NotificationItem[]);
}

export function parseUnreadCount(value: unknown): number | null {
  if (!value || typeof value !== "object") return null;
  const count = (value as { count?: unknown }).count;
  return typeof count === "number" && Number.isInteger(count) && count >= 0 ? count : null;
}

export function parsePreferences(value: unknown): Preferences | null {
  if (!value || typeof value !== "object") return null;
  const raw = value as { consentGranted?: unknown; categories?: unknown };
  if (typeof raw.consentGranted !== "boolean" || !Array.isArray(raw.categories)) return null;
  const categories: CategoryPreference[] = [];
  for (const entry of raw.categories as unknown[]) {
    if (!entry || typeof entry !== "object") return null;
    const row = entry as Record<string, unknown>;
    if (
      !isCategory(row.category) ||
      typeof row.pushEnabled !== "boolean" ||
      !isTime(row.quietHoursStart) ||
      !isTime(row.quietHoursEnd) ||
      typeof row.timezone !== "string"
    )
      return null;
    categories.push({
      category: row.category,
      pushEnabled: row.pushEnabled,
      quietHoursStart: row.quietHoursStart,
      quietHoursEnd: row.quietHoursEnd,
      timezone: row.timezone,
    });
  }
  return { consentGranted: raw.consentGranted, categories };
}

/**
 * Describes what actually happened to the push, never more: SENT means the provider accepted it,
 * not that a phone received it. No delivery rows means the notification exists only in the app.
 */
export function describeDelivery(delivery: Record<string, number>): string {
  const n = (status: string) => delivery[status] ?? 0;
  if (n("DELIVERED") > 0) return "Delivered to your device";
  if (n("SENT") > 0) return "Push sent (delivery not confirmed)";
  if (n("SCHEDULED") > 0) return "Push scheduled";
  if (n("FAILED") > 0 || n("INVALID_TOKEN") > 0) return "Push could not be delivered";
  return "In the app only";
}

export function unreadLabel(count: number | null): string {
  if (count === null) return "Notification count unavailable";
  if (count === 0) return "No unread notifications";
  return `${count} unread notification${count === 1 ? "" : "s"}`;
}

export function badgeText(count: number | null): string | null {
  if (!count) return null;
  return count > 99 ? "99+" : String(count);
}

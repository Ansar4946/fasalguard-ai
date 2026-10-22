"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import {
  CATEGORIES,
  CATEGORY_LABELS,
  describeDelivery,
  parseNotifications,
  parsePreferences,
  type Category,
  type CategoryPreference,
  type NotificationItem,
  type Preferences,
} from "@/features/notifications/notifications";

export const NOTIFICATIONS_CHANGED = "fasalguard:notifications-changed";

class HttpError extends Error {
  constructor(
    message: string,
    readonly status: number,
  ) {
    super(message);
  }
}

async function call(path: string, init?: RequestInit): Promise<unknown> {
  const response = await fetch(path, { cache: "no-store", ...init });
  const body: unknown = await response.json().catch(() => null);
  if (!response.ok) {
    const message =
      body &&
      typeof body === "object" &&
      typeof (body as { error?: { message?: unknown } }).error?.message === "string"
        ? (body as { error: { message: string } }).error.message
        : "Notifications are unavailable right now.";
    throw new HttpError(message, response.status);
  }
  return body;
}

type ListState =
  | { status: "loading" }
  | { status: "ready"; items: NotificationItem[] }
  | { status: "error"; message: string; items: NotificationItem[] | null }
  | { status: "unauthorized" };

const tone: Record<Category, string> = {
  SATELLITE: "bg-sky-100 text-sky-900",
  WEATHER: "bg-amber-100 text-amber-900",
  DIAGNOSIS: "bg-brand-soft text-brand",
  EXPERT: "bg-brand-soft text-brand",
  OUTBREAK: "bg-red-100 text-danger",
  TASK: "bg-slate-100 text-slate-700",
  SYSTEM: "bg-slate-100 text-slate-700",
};

function when(iso: string): string {
  return new Date(iso).toLocaleString("en-PK", { dateStyle: "medium", timeStyle: "short" });
}

export function NotificationsInbox() {
  const [state, setState] = useState<ListState>({ status: "loading" });
  const [filter, setFilter] = useState<"all" | "unread">("all");
  const [category, setCategory] = useState<"ALL" | Category>("ALL");
  const [busy, setBusy] = useState(false);
  const [actionError, setActionError] = useState<string | null>(null);
  const mounted = useRef(true);
  const ticket = useRef(0);

  const refresh = useCallback(async () => {
    const mine = ++ticket.current;
    try {
      const items = parseNotifications(await call("/api/notifications"));
      if (!items) throw new Error("The notification list was not understood.");
      if (!mounted.current || mine !== ticket.current) return;
      setState({ status: "ready", items });
    } catch (reason) {
      if (!mounted.current || mine !== ticket.current) return;
      if (reason instanceof HttpError && reason.status === 401) {
        // Never keep another account's notifications on screen after the session ends.
        setState({ status: "unauthorized" });
        return;
      }
      const message = reason instanceof Error ? reason.message : "Notifications are unavailable.";
      setState((current) => ({
        status: "error",
        message,
        items: current.status === "ready" ? current.items : current.status === "error" ? current.items : null,
      }));
    }
  }, []);

  useEffect(() => {
    mounted.current = true;
    const mine = ++ticket.current;
    call("/api/notifications").then(
      (body) => {
        if (!mounted.current || mine !== ticket.current) return;
        const items = parseNotifications(body);
        setState(
          items
            ? { status: "ready", items }
            : { status: "error", message: "The notification list was not understood.", items: null },
        );
      },
      (reason: unknown) => {
        if (!mounted.current || mine !== ticket.current) return;
        setState(
          reason instanceof HttpError && reason.status === 401
            ? { status: "unauthorized" }
            : {
                status: "error",
                message: reason instanceof Error ? reason.message : "Notifications are unavailable.",
                items: null,
              },
        );
      },
    );
    return () => {
      mounted.current = false;
    };
  }, []);

  function announce() {
    window.dispatchEvent(new Event(NOTIFICATIONS_CHANGED));
  }

  async function markRead(id: string) {
    if (busy) return;
    setBusy(true);
    setActionError(null);
    try {
      await call(`/api/notifications/${id}/read`, { method: "PATCH" });
      if (!mounted.current) return;
      setState((current) =>
        current.status === "ready"
          ? {
              status: "ready",
              items: current.items.map((item) =>
                item.id === id && !item.readAt ? { ...item, readAt: new Date().toISOString() } : item,
              ),
            }
          : current,
      );
      announce();
    } catch (reason) {
      if (mounted.current) setActionError(reason instanceof Error ? reason.message : "Could not mark as read.");
    } finally {
      if (mounted.current) setBusy(false);
    }
  }

  async function markAllRead() {
    if (busy) return;
    setBusy(true);
    setActionError(null);
    try {
      await call("/api/notifications/read-all", { method: "POST" });
      await refresh();
      announce();
    } catch (reason) {
      if (mounted.current) setActionError(reason instanceof Error ? reason.message : "Could not mark all as read.");
    } finally {
      if (mounted.current) setBusy(false);
    }
  }

  const items = state.status === "ready" ? state.items : state.status === "error" ? state.items : null;
  const unread = items?.filter((item) => !item.readAt).length ?? 0;
  const shown = (items ?? []).filter(
    (item) => (filter === "all" || !item.readAt) && (category === "ALL" || item.category === category),
  );

  return (
    <section aria-labelledby="inbox-heading" className="space-y-4">
      <div className="flex flex-wrap items-center gap-2">
        <h2 id="inbox-heading" className="sr-only">
          My notifications
        </h2>
        {(["all", "unread"] as const).map((value) => (
          <button
            key={value}
            type="button"
            onClick={() => setFilter(value)}
            aria-pressed={filter === value}
            className={`min-h-9 rounded-full px-4 text-xs font-bold ${filter === value ? "bg-brand text-white" : "border border-border bg-white"}`}
          >
            {value === "all" ? "All" : "Unread"}
          </button>
        ))}
        <label className="ml-auto text-xs font-bold">
          <span className="sr-only">Category</span>
          <select
            value={category}
            onChange={(event) => setCategory(event.target.value as "ALL" | Category)}
            className="h-9 rounded-lg border border-border bg-white px-3 text-xs font-normal"
          >
            <option value="ALL">All categories</option>
            {CATEGORIES.map((value) => (
              <option key={value} value={value}>
                {CATEGORY_LABELS[value]}
              </option>
            ))}
          </select>
        </label>
        <button
          type="button"
          onClick={() => void markAllRead()}
          disabled={busy || unread === 0}
          className="min-h-9 rounded-full border border-brand px-4 text-xs font-bold text-brand disabled:opacity-40"
        >
          Mark all as read
        </button>
      </div>

      <div aria-live="polite">
        {state.status === "loading" && (
          <p className="rounded-2xl border border-border bg-white p-6 text-sm text-muted">Loading notifications…</p>
        )}
        {state.status === "unauthorized" && (
          <p role="alert" className="rounded-2xl bg-red-50 p-5 text-sm font-semibold text-danger">
            Your session has ended. Sign in again to see your notifications.
          </p>
        )}
        {state.status === "error" && (
          <div role="alert" className="rounded-2xl bg-red-50 p-5 text-sm font-semibold text-danger">
            Notifications are unavailable: {state.message}
            {state.items ? " Showing the last list loaded; it may be out of date." : ""}
            <button
              type="button"
              onClick={() => {
                setState((current) => (current.status === "error" && current.items ? current : { status: "loading" }));
                void refresh();
              }}
              className="ml-3 min-h-9 rounded-full border border-danger px-4 text-xs font-bold"
            >
              Retry
            </button>
          </div>
        )}
        {actionError && (
          <p role="alert" className="mt-2 rounded-2xl bg-red-50 p-3 text-sm font-semibold text-danger">
            {actionError}
          </p>
        )}
        {state.status === "ready" && state.items.length === 0 && (
          <div className="rounded-2xl border border-border bg-white p-8 text-center">
            <h3 className="font-extrabold">No notifications yet</h3>
            <p className="mt-1 text-xs text-muted">
              Weather, scan, expert and task updates for your farms will appear here.
            </p>
          </div>
        )}
        {items && items.length > 0 && shown.length === 0 && (
          <div className="rounded-2xl border border-border bg-white p-8 text-center">
            <h3 className="font-extrabold">No matching notifications</h3>
            <p className="mt-1 text-xs text-muted">Change the filter to see other updates.</p>
          </div>
        )}
        {shown.length > 0 && (
          <ul className="grid gap-4 lg:grid-cols-2" aria-label="Notifications">
            {shown.map((item) => (
              <li
                key={item.id}
                className={`flex flex-col rounded-2xl border bg-white p-5 shadow-sm ${item.readAt ? "border-border" : "border-brand"}`}
              >
                <div className="flex items-start gap-3">
                  <div className="min-w-0 flex-1">
                    <h3 className="text-sm font-extrabold leading-5" dir="auto">
                      {!item.readAt && <span className="mr-2 inline-block size-2 rounded-full bg-brand" aria-label="Unread" />}
                      {item.title}
                    </h3>
                    <p className="mt-1 text-xs text-muted">{when(item.createdAt)}</p>
                  </div>
                  <span className={`rounded px-2 py-1 text-[10px] font-extrabold ${tone[item.category]}`}>
                    {CATEGORY_LABELS[item.category]}
                  </span>
                </div>
                <p className="mt-3 whitespace-pre-wrap text-sm leading-6" dir="auto">
                  {item.body}
                </p>
                <div className="mt-auto flex flex-wrap items-center justify-between gap-2 pt-4">
                  <span className="text-[11px] text-muted">{describeDelivery(item.delivery)}</span>
                  {!item.readAt && (
                    <button
                      type="button"
                      onClick={() => void markRead(item.id)}
                      disabled={busy}
                      className="min-h-9 rounded-full bg-brand px-4 text-xs font-extrabold text-white disabled:opacity-50"
                    >
                      Mark as read
                    </button>
                  )}
                </div>
              </li>
            ))}
          </ul>
        )}
      </div>

      <NotificationSettings />
    </section>
  );
}

type PrefState =
  | { status: "loading" }
  | { status: "ready"; prefs: Preferences }
  | { status: "error"; message: string };

function NotificationSettings() {
  const [state, setState] = useState<PrefState>({ status: "loading" });
  const [note, setNote] = useState<Record<string, string>>({});
  const mounted = useRef(true);

  useEffect(() => {
    mounted.current = true;
    call("/api/notifications/preferences").then(
      (body) => {
        if (!mounted.current) return;
        const prefs = parsePreferences(body);
        setState(
          prefs ? { status: "ready", prefs } : { status: "error", message: "Settings were not understood." },
        );
      },
      (reason: unknown) => {
        if (mounted.current)
          setState({ status: "error", message: reason instanceof Error ? reason.message : "Settings are unavailable." });
      },
    );
    return () => {
      mounted.current = false;
    };
  }, []);

  async function save(pref: CategoryPreference) {
    const label = CATEGORY_LABELS[pref.category];
    if (!!pref.quietHoursStart !== !!pref.quietHoursEnd) {
      setNote((current) => ({ ...current, [pref.category]: "Set both a start and an end time, or clear both." }));
      return;
    }
    if (pref.quietHoursStart && pref.quietHoursStart === pref.quietHoursEnd) {
      setNote((current) => ({ ...current, [pref.category]: "Start and end must be different." }));
      return;
    }
    setNote((current) => ({ ...current, [pref.category]: "Saving…" }));
    try {
      await call(`/api/notifications/preferences/${pref.category}`, {
        method: "PUT",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({
          pushEnabled: pref.pushEnabled,
          ...(pref.quietHoursStart ? { quietHoursStart: pref.quietHoursStart, quietHoursEnd: pref.quietHoursEnd } : {}),
          timezone: pref.timezone,
        }),
      });
      if (mounted.current) setNote((current) => ({ ...current, [pref.category]: `${label} settings saved.` }));
    } catch (reason) {
      if (mounted.current)
        setNote((current) => ({
          ...current,
          [pref.category]: reason instanceof Error ? reason.message : "Could not save.",
        }));
    }
  }

  function edit(category: Category, change: Partial<CategoryPreference>) {
    setState((current) =>
      current.status === "ready"
        ? {
            status: "ready",
            prefs: {
              ...current.prefs,
              categories: current.prefs.categories.map((pref) =>
                pref.category === category ? { ...pref, ...change } : pref,
              ),
            },
          }
        : current,
    );
    setNote((current) => ({ ...current, [category]: "" }));
  }

  return (
    <details className="rounded-2xl border border-border bg-white p-5">
      <summary className="cursor-pointer text-sm font-extrabold">Notification settings</summary>
      {state.status === "loading" && <p className="mt-3 text-sm text-muted">Loading settings…</p>}
      {state.status === "error" && (
        <p role="alert" className="mt-3 text-sm font-semibold text-danger">
          Settings are unavailable: {state.message}
        </p>
      )}
      {state.status === "ready" && (
        <div className="mt-3 space-y-4">
          {!state.prefs.consentGranted && (
            <p role="status" className="rounded-xl bg-amber-50 p-3 text-xs text-amber-950">
              Push notifications are off because you have not agreed to receive them. Updates still appear in this list.
            </p>
          )}
          <p className="text-xs text-muted">
            Quiet hours delay push messages until the end of the window. Updates are still listed here straight away.
          </p>
          {state.prefs.categories.map((pref) => (
            <fieldset key={pref.category} className="rounded-xl border border-border p-3">
              <legend className="px-1 text-xs font-extrabold">{CATEGORY_LABELS[pref.category]}</legend>
              <div className="flex flex-wrap items-end gap-3">
                <label className="flex min-h-9 items-center gap-2 text-xs">
                  <input
                    type="checkbox"
                    checked={pref.pushEnabled}
                    onChange={(event) => edit(pref.category, { pushEnabled: event.target.checked })}
                  />
                  Push
                </label>
                <label className="text-xs">
                  Quiet from
                  <input
                    type="time"
                    value={pref.quietHoursStart ?? ""}
                    onChange={(event) => edit(pref.category, { quietHoursStart: event.target.value || null })}
                    className="ml-2 h-9 rounded-lg border border-border px-2"
                  />
                </label>
                <label className="text-xs">
                  until
                  <input
                    type="time"
                    value={pref.quietHoursEnd ?? ""}
                    onChange={(event) => edit(pref.category, { quietHoursEnd: event.target.value || null })}
                    className="ml-2 h-9 rounded-lg border border-border px-2"
                  />
                </label>
                <span className="text-[11px] text-muted">{pref.timezone}</span>
                <button
                  type="button"
                  onClick={() => void save(pref)}
                  className="min-h-9 rounded-full border border-brand px-4 text-xs font-bold text-brand"
                >
                  Save {CATEGORY_LABELS[pref.category]}
                </button>
              </div>
              {note[pref.category] && (
                <p role="status" className="mt-2 text-xs">
                  {note[pref.category]}
                </p>
              )}
            </fieldset>
          ))}
        </div>
      )}
    </details>
  );
}

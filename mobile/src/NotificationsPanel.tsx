import { useCallback, useEffect, useRef, useState } from "react";
import { isAllowedApiBase } from "./api-url.mjs";
import { Pressable, StyleSheet, Switch, Text, View } from "react-native";
import {
  CATEGORY_LABELS,
  describeDelivery,
  describeError,
  fetchPreferences,
  listNotifications,
  markAllRead,
  markRead,
  savePreference,
  unreadLabel,
} from "./notifications.mjs";
import { describePush, disablePush, enablePush, refreshPushToken } from "./push-registration.mjs";
import {
  devicePlatform,
  nativeNotifications,
  onTokenChange,
  showForegroundNotifications,
  tokenStore,
} from "./push";

type Item = {
  id: string;
  category: keyof typeof CATEGORY_LABELS;
  title: string;
  body: string;
  readAt: string | null;
  createdAt: string;
  delivery: Record<string, number>;
};
type Pref = {
  category: keyof typeof CATEGORY_LABELS;
  pushEnabled: boolean;
  quietHoursStart: string | null;
  quietHoursEnd: string | null;
  timezone: string;
};
type ListState =
  | { status: "loading" }
  | { status: "ready"; items: Item[] }
  | { status: "error"; message: string; items: Item[] | null }
  | { status: "unauthorized" };

function stamp(iso: string): string {
  return new Date(iso).toLocaleString("en-PK", { dateStyle: "medium", timeStyle: "short" });
}

export function NotificationsPanel({
  accessToken,
  coreUrl,
}: {
  accessToken: string;
  coreUrl: string | undefined;
}) {
  const [state, setState] = useState<ListState>({ status: "loading" });
  const [busy, setBusy] = useState(false);
  const [actionError, setActionError] = useState<string | null>(null);
  const [prefs, setPrefs] = useState<{ consentGranted: boolean; categories: Pref[] } | null>(null);
  const [prefError, setPrefError] = useState<string | null>(null);
  const [pushOn, setPushOn] = useState(false);
  const [pushMessage, setPushMessage] = useState<string | null>(null);
  const mounted = useRef(true);
  const ticket = useRef(0);
  const base = coreUrl ?? "";

  const load = useCallback(async () => {
    const mine = ++ticket.current;
    try {
      const items = (await listNotifications(base, accessToken)) as Item[];
      if (!mounted.current || mine !== ticket.current) return;
      setState({ status: "ready", items });
    } catch (reason) {
      if (!mounted.current || mine !== ticket.current) return;
      const code = reason instanceof Error ? reason.message : "";
      if (code === "UNAUTHORIZED") {
        // Never keep another account's notifications on screen after the session ends.
        setState({ status: "unauthorized" });
        return;
      }
      setState((current) => ({
        status: "error",
        message: describeError(code),
        items: current.status === "ready" || current.status === "error" ? current.items : null,
      }));
    }
  }, [accessToken, base]);

  useEffect(() => {
    mounted.current = true;
    const mine = ++ticket.current;
    listNotifications(base, accessToken).then(
      (items) => {
        if (mounted.current && mine === ticket.current) setState({ status: "ready", items: items as Item[] });
      },
      (reason: unknown) => {
        if (!mounted.current || mine !== ticket.current) return;
        const code = reason instanceof Error ? reason.message : "";
        setState(
          code === "UNAUTHORIZED"
            ? { status: "unauthorized" }
            : { status: "error", message: describeError(code), items: null },
        );
      },
    );
    fetchPreferences(base, accessToken).then(
      (value) => {
        if (mounted.current) setPrefs(value as { consentGranted: boolean; categories: Pref[] });
      },
      (reason: unknown) => {
        if (mounted.current) setPrefError(describeError(reason instanceof Error ? reason.message : ""));
      },
    );
    tokenStore.load().then(
      (id) => {
        if (mounted.current) setPushOn(Boolean(id));
      },
      () => undefined,
    );
    return () => {
      mounted.current = false;
    };
  }, [accessToken, base]);

  // While push is on, keep the server's copy of this phone's token current if the platform rotates it.
  useEffect(() => {
    if (!pushOn) return undefined;
    showForegroundNotifications();
    return onTokenChange((newToken) => {
      void refreshPushToken({
        base,
        accessToken,
        platform: devicePlatform,
        newToken,
        store: tokenStore,
      });
    });
  }, [pushOn, base, accessToken]);

  async function togglePhonePush() {
    await act(async () => {
      if (pushOn) {
        const result = await disablePush({ base, accessToken, store: tokenStore });
        if (!mounted.current) return;
        if (result.status === "DISABLED" || result.status === "NOT_REGISTERED") setPushOn(false);
        setPushMessage(describePush(result.status));
        return;
      }
      const result = await enablePush({
        base,
        accessToken,
        platform: devicePlatform,
        notifications: nativeNotifications,
        store: tokenStore,
      });
      if (!mounted.current) return;
      setPushOn(result.status === "REGISTERED");
      setPushMessage(describePush(result.status));
    });
  }

  async function act(action: () => Promise<unknown>) {
    if (busy) return;
    setBusy(true);
    setActionError(null);
    try {
      await action();
    } catch (reason) {
      if (mounted.current) setActionError(describeError(reason instanceof Error ? reason.message : ""));
    } finally {
      if (mounted.current) setBusy(false);
    }
  }

  async function togglePush(pref: Pref, value: boolean) {
    const next = { ...pref, pushEnabled: value };
    await act(async () => {
      await savePreference(base, accessToken, next);
      if (mounted.current)
        setPrefs((current) =>
          current
            ? { ...current, categories: current.categories.map((c) => (c.category === pref.category ? next : c)) }
            : current,
        );
    });
  }

  const items = state.status === "ready" || state.status === "error" ? state.items : null;
  const unread = items?.filter((item) => !item.readAt).length ?? 0;
  const disabled = !isAllowedApiBase(coreUrl);

  return (
    <View style={styles.card}>
      <Text style={styles.heading}>Notifications</Text>
      <Text accessibilityLiveRegion="polite">{items ? unreadLabel(unread) : ""}</Text>
      {disabled && <Text style={styles.error}>{describeError("HTTPS_REQUIRED")}</Text>}

      <View style={styles.row}>
        <Pressable
          accessibilityRole="button"
          accessibilityLabel="Refresh notifications"
          onPress={() => void load()}
          disabled={busy || disabled}
          style={[styles.outline, (busy || disabled) && styles.dim]}
        >
          <Text>Refresh</Text>
        </Pressable>
        <Pressable
          accessibilityRole="button"
          accessibilityLabel="Mark all as read"
          onPress={() =>
            void act(async () => {
              await markAllRead(base, accessToken);
              await load();
            })
          }
          disabled={busy || unread === 0}
          style={[styles.outline, (busy || unread === 0) && styles.dim]}
        >
          <Text>Mark all as read</Text>
        </Pressable>
      </View>

      {state.status === "loading" && <Text>Loading notifications…</Text>}
      {state.status === "unauthorized" && (
        <Text style={styles.error} accessibilityRole="alert">
          {describeError("UNAUTHORIZED")}
        </Text>
      )}
      {state.status === "error" && (
        <Text style={styles.error} accessibilityRole="alert">
          Notifications are unavailable: {state.message}
          {state.items ? " Showing the last list loaded; it may be out of date." : ""}
        </Text>
      )}
      {actionError && (
        <Text style={styles.error} accessibilityRole="alert">
          {actionError}
        </Text>
      )}
      {state.status === "ready" && state.items.length === 0 && (
        <Text>No notifications yet. Weather, scan, expert and task updates will appear here.</Text>
      )}
      {items?.map((item) => (
        <View key={item.id} style={[styles.item, !item.readAt && styles.unread]}>
          <Text style={styles.itemTitle}>
            {!item.readAt ? "● " : ""}
            {item.title}
          </Text>
          <Text style={styles.meta}>
            {CATEGORY_LABELS[item.category]} · {stamp(item.createdAt)}
          </Text>
          <Text>{item.body}</Text>
          <Text style={styles.meta}>{describeDelivery(item.delivery)}</Text>
          {!item.readAt && (
            <Pressable
              accessibilityRole="button"
              accessibilityLabel={`Mark ${item.title} as read`}
              onPress={() =>
                void act(async () => {
                  await markRead(base, accessToken, item.id);
                  if (mounted.current)
                    setState((current) =>
                      current.status === "ready"
                        ? {
                            status: "ready",
                            items: current.items.map((x) =>
                              x.id === item.id ? { ...x, readAt: new Date().toISOString() } : x,
                            ),
                          }
                        : current,
                    );
                })
              }
              disabled={busy}
              style={[styles.outline, busy && styles.dim]}
            >
              <Text>Mark as read</Text>
            </Pressable>
          )}
        </View>
      ))}

      <Text style={styles.subheading}>Push settings</Text>
      {prefError && (
        <Text style={styles.error} accessibilityRole="alert">
          Settings are unavailable: {prefError}
        </Text>
      )}
      {prefs && !prefs.consentGranted && (
        <Text style={styles.notice}>
          Push is off because you have not agreed to receive notifications. Updates still appear above.
        </Text>
      )}
      {prefs && (
        <Text style={styles.meta}>Quiet hours are set on the website.</Text>
      )}
      <View style={styles.prefRow}>
        <Text style={styles.flex}>{pushOn ? "Push is on for this phone" : "Push is off for this phone"}</Text>
        <Pressable
          accessibilityRole="button"
          accessibilityLabel={pushOn ? "Turn off push on this phone" : "Turn on push on this phone"}
          onPress={() => void togglePhonePush()}
          disabled={busy || disabled}
          style={[styles.outline, (busy || disabled) && styles.dim]}
        >
          <Text>{pushOn ? "Turn off" : "Turn on"}</Text>
        </Pressable>
      </View>
      {pushMessage && (
        <Text style={styles.notice} accessibilityLiveRegion="polite">
          {pushMessage}
        </Text>
      )}
      {prefs?.categories.map((pref) => (
        <View key={pref.category} style={styles.prefRow}>
          <Text style={styles.flex}>
            {CATEGORY_LABELS[pref.category]}
            {pref.quietHoursStart ? ` · quiet ${pref.quietHoursStart}–${pref.quietHoursEnd}` : ""}
          </Text>
          <Switch
            value={pref.pushEnabled}
            disabled={busy}
            onValueChange={(value) => void togglePush(pref, value)}
            accessibilityLabel={`${CATEGORY_LABELS[pref.category]} push notifications`}
          />
        </View>
      ))}
    </View>
  );
}

const styles = StyleSheet.create({
  card: { padding: 12, gap: 10, backgroundColor: "#fff", borderRadius: 12 },
  heading: { fontSize: 19, fontWeight: "600" },
  subheading: { fontSize: 16, fontWeight: "600", marginTop: 8 },
  row: { flexDirection: "row", gap: 8, flexWrap: "wrap" },
  outline: { minHeight: 44, paddingHorizontal: 14, borderRadius: 12, borderWidth: 1, borderColor: "#075f3d", justifyContent: "center", alignSelf: "flex-start" },
  dim: { opacity: 0.5 },
  error: { padding: 10, backgroundColor: "#fef2f2", color: "#b91c1c", borderRadius: 10, fontWeight: "600" },
  notice: { padding: 10, backgroundColor: "#fffbeb", borderRadius: 10 },
  item: { padding: 10, gap: 4, borderWidth: 1, borderColor: "#e2e8f0", borderRadius: 12 },
  unread: { borderColor: "#075f3d", backgroundColor: "#f0fdf4" },
  itemTitle: { fontWeight: "700" },
  meta: { fontSize: 12, color: "#64748b" },
  prefRow: { flexDirection: "row", alignItems: "center", gap: 8, minHeight: 44 },
  flex: { flex: 1 },
});

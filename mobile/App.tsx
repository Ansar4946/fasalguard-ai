import { useEffect, useState } from "react";
import {
  TextInput,
  SafeAreaView,
  ScrollView,
  Text,
  Button,
  View,
  StyleSheet,
} from "react-native";
import * as ImagePicker from "expo-image-picker";
import { manipulateAsync, SaveFormat } from "expo-image-manipulator";
import { File } from "expo-file-system";
import type { SQLiteDatabase } from "expo-sqlite";
import { openStore, capture } from "./src/store";
import { currentSession, clearSession, devSignIn, type Session } from "./src/session";
import { history } from "./src/database.mjs";
import { syncPending, pullChanges } from "./src/sync.mjs";
import { installedModels, inferLocal } from "./src/models";
import { UssdDemo } from "./src/UssdDemo";
import { NotificationsPanel } from "./src/NotificationsPanel";
import { disablePush } from "./src/push-registration.mjs";
import { tokenStore } from "./src/push";

export default function App() {
  const [db, setDb] = useState<SQLiteDatabase | null>(null),
    [session, setSession] = useState<Session | null>(null);
  const [items, setItems] = useState<
      { client_id: string; payload: string; state: string }[]
    >([]),
    [fieldIndex, setFieldIndex] = useState(0);
  const [message, setMessage] = useState("Opening private offline history…"),
    [busy, setBusy] = useState(false);
  const [devId, setDevId] = useState(""),
    [devPw, setDevPw] = useState("");
  useEffect(() => {
    let active = true;
    let opened: SQLiteDatabase | null = null;
    void (async () => {
      const store = await openStore();
      opened = store;
      if (!active) {
        await store.closeAsync();
        return;
      }
      const account = await currentSession();
      if (!active) return;
      setDb(store);
      setSession(account);
      if (account) setItems(await history(store, account.ownerId));
      setMessage(
        account
          ? "Captures remain on this device when offline."
          : "Secure sign-in integration is not available in this release.",
      );
    })().catch((error) => {
      // Development diagnostics only; the farmer-facing message below is unchanged.
      if (__DEV__) console.warn("openStore failed:", String(error));
      if (active)
        setMessage(
          "Private offline storage is unavailable. Captures have not been saved.",
        );
    });
    return () => {
      active = false;
      if (opened) void opened.closeAsync();
    };
  }, []);
  async function operation(action: () => Promise<void>) {
    if (busy) return;
    setBusy(true);
    try {
      await action();
    } catch (error) {
      // Development diagnostics only (error code/message, never request bodies or tokens).
      if (__DEV__) console.warn("operation failed:", String(error));
      const code = error instanceof Error ? error.message : "";
      setMessage(
        code === "SIGN_IN_REQUIRED"
          ? "Sign in again to sync. Saved captures remain on this device."
          : code === "SYNC_CONFLICT_RETAINED"
            ? "A capture conflicts with an existing record. It has been retained for review."
            : code.startsWith("SYNC_")
              ? "Sync is unavailable. Your saved captures remain available for retry."
              : [
                    "Select an authenticated field and crop season first.",
                    "Photo permission denied. Your existing history is unchanged.",
                    "Choose a clear crop photo, at least 320px and at most 10 MiB/20MP.",
                  ].includes(code)
                ? code
                : "Operation could not complete. Existing history is retained.",
      );
    } finally {
      setBusy(false);
    }
  }
  async function choose(camera: boolean) {
    await operation(async () => {
      if (!db || !session || !session.fields[fieldIndex])
        throw new Error("Select an authenticated field and crop season first.");
      const permission = camera
        ? await ImagePicker.requestCameraPermissionsAsync()
        : await ImagePicker.requestMediaLibraryPermissionsAsync();
      if (!permission.granted)
        throw new Error(
          "Photo permission denied. Your existing history is unchanged.",
        );
      const result = camera
        ? await ImagePicker.launchCameraAsync({
            mediaTypes: ["images"],
            quality: 0.9,
          })
        : await ImagePicker.launchImageLibraryAsync({
            mediaTypes: ["images"],
            quality: 0.9,
          });
      if (result.canceled) return;
      const asset = result.assets[0];
      if (
        (asset.fileSize ?? 0) > 10 * 1024 * 1024 ||
        asset.width * asset.height > 20000000 ||
        Math.min(asset.width, asset.height) < 320
      )
        throw new Error(
          "Choose a clear crop photo, at least 320px and at most 10 MiB/20MP.",
        );
      // Re-encode a clean private JPEG; original EXIF is not part of the synced payload.
      const normalized = await manipulateAsync(asset.uri, [], {
        compress: 0.95,
        format: SaveFormat.JPEG,
      });
      try {
        const field = session.fields[fieldIndex],
          model = installedModels.find(
            (x) => x.manifest.cropId === field.cropId,
          );
        let prediction = null,
          modelFailed = false,
          runtimeMissing = false;
        if (model) {
          try {
            prediction = await inferLocal(normalized.uri, model, field.cropId);
          } catch (error) {
            modelFailed = true;
            if (
              error instanceof Error &&
              error.message === "NATIVE_RUNTIME_UNAVAILABLE"
            )
              runtimeMissing = true;
          }
        }
        await capture(db, session, field, normalized.uri, prediction);
        setItems(await history(db, session.ownerId));
        setMessage(
          prediction
            ? "Local screening saved. Expert verification is still required."
            : runtimeMissing
              ? "On-device inference is unavailable: the native ONNX runtime is not part of this build. Photo saved without a prediction."
              : modelFailed
              ? "Offline model failed validation or inference. Photo saved without a prediction."
              : "Photo saved locally. No approved offline model is available for this crop; no diagnosis was generated.",
        );
      } finally {
        const temp = new File(normalized.uri);
        if (temp.exists) temp.delete();
      }
    });
  }
  return (
    <SafeAreaView style={styles.page}>
      <ScrollView contentContainerStyle={styles.content}>
        <Text style={styles.title}>Fasal Guard</Text>
        <Text style={styles.heading}>Offline crop screening</Text>
        <Text>
          AI screening is not a confirmed disease diagnosis. Seek expert advice
          before treatment.
        </Text>
        <Text accessibilityRole="alert" style={styles.message}>
          {message}
        </Text>
        {__DEV__ && !session && (
          // DEVELOPMENT BUILDS ONLY: __DEV__ is false in release bundles so this form is not shipped.
          <View style={styles.row}>
            <Text style={styles.heading}>Developer sign-in (debug build)</Text>
            {/* Uncontrolled on purpose: a controlled value re-renders mid-keystroke and garbles input on slow emulators. */}
            <TextInput
              testID="dev-identifier"
              accessibilityLabel="Email"
              autoCapitalize="none"
              autoCorrect={false}
              placeholder="email"
              onChangeText={setDevId}
              style={styles.input}
            />
            <TextInput
              testID="dev-password"
              accessibilityLabel="Password"
              autoCapitalize="none"
              autoCorrect={false}
              secureTextEntry
              placeholder="password"
              onChangeText={setDevPw}
              style={styles.input}
            />
            <Button
              title="Sign in (dev)"
              disabled={busy || !db || !devId || !devPw}
              onPress={() =>
                void operation(async () => {
                  const result = await devSignIn(
                    process.env.EXPO_PUBLIC_CORE_API_URL ?? "",
                    process.env.EXPO_PUBLIC_PLATFORM_API_URL,
                    devId,
                    devPw,
                  );
                  const account = await currentSession();
                  setSession(account);
                  if (account && db) setItems(await history(db, account.ownerId));
                  setMessage(
                    result.contextLoaded
                      ? "Signed in (dev build)."
                      : "Signed in (dev build). Offline field context is unavailable on this backend, so no fields are cached.",
                  );
                })
              }
            />
          </View>
        )}
        {!installedModels.length && (
          <Text>No approved offline classifier is installed.</Text>
        )}
        {session?.fields.map((field, index) => (
          <View key={field.cropSeasonId} style={styles.row}>
            <Button
              title={`${index === fieldIndex ? "✓ " : ""}${field.name}`}
              disabled={busy}
              onPress={() => setFieldIndex(index)}
            />
          </View>
        ))}
        {session && session.fields.length === 0 && (
          <Text>
            No cached field/crop season. Connect to refresh your account
            context.
          </Text>
        )}
        <Button
          title="Take crop photo"
          disabled={busy || !db || !session}
          onPress={() => void choose(true)}
        />
        <Button
          title="Choose crop photo"
          disabled={busy || !db || !session}
          onPress={() => void choose(false)}
        />
        <Button
          title="Sync saved captures"
          disabled={busy || !db || !session}
          onPress={() =>
            void operation(async () => {
              const count = await syncPending(
                db!,
                session,
                process.env.EXPO_PUBLIC_PLATFORM_API_URL,
              );
              const pulled = await pullChanges(
                db!,
                session,
                process.env.EXPO_PUBLIC_PLATFORM_API_URL,
              );
              setItems(await history(db!, session!.ownerId));
              setMessage(
                `${count} capture(s) synced. Images remain on their original device; reports are unverified.${pulled.hasMore ? " Sync again for more history." : ""}`,
              );
            })
          }
        />
        {session && (
          <NotificationsPanel
            accessToken={session.accessToken}
            coreUrl={process.env.EXPO_PUBLIC_CORE_API_URL}
          />
        )}
        {session && (
          <UssdDemo
            accessToken={session.accessToken}
            coreUrl={process.env.EXPO_PUBLIC_CORE_API_URL}
          />
        )}
        <Text style={styles.heading}>Private history</Text>
        {!items.length && <Text>No saved captures for this account.</Text>}
        {items.map((item) => {
          const value = JSON.parse(item.payload);
          return (
            <View key={item.client_id} style={styles.row}>
              <Text>
                {value.capturedAt} · {item.state}
              </Text>
              <Text>
                {value.prediction
                  ? `${value.prediction.label} — model score ${value.prediction.score.toFixed(3)} (unverified)`
                  : "No prediction generated"}
              </Text>
            </View>
          );
        })}
        {session && (
          <Button
            title="Sign out"
            disabled={busy}
            onPress={() =>
              void operation(async () => {
                // Best effort: stop this phone receiving the signed-out farmer's pushes. If the phone is
                // offline the server keeps the token until it is rebound or goes stale.
                await disablePush({
                  base: process.env.EXPO_PUBLIC_CORE_API_URL ?? "",
                  accessToken: session.accessToken,
                  store: tokenStore,
                }).catch(() => undefined);
                await clearSession();
                setSession(null);
                setItems([]);
                setMessage("Signed out. Private history is hidden.");
              })
            }
          />
        )}
      </ScrollView>
    </SafeAreaView>
  );
}
const styles = StyleSheet.create({
  page: { flex: 1, backgroundColor: "#edf5e9" },
  content: { padding: 24, gap: 16 },
  title: { fontSize: 26, fontWeight: "700", color: "#075f3d" },
  heading: { fontSize: 19, fontWeight: "600" },
  message: { padding: 12, backgroundColor: "#fff" },
  input: { borderWidth: 1, borderColor: "#999", borderRadius: 8, padding: 8, marginVertical: 6, backgroundColor: "#fff" },
  row: { padding: 12, backgroundColor: "#fff", borderRadius: 12 },
});

// Push registration orchestration. The native pieces (permission prompt, device token, secure storage)
// are injected so the flow is unit-testable without a device. Registration is always an explicit
// farmer action; nothing here runs silently.
import { deletePushToken, registerPushToken } from "./notifications.mjs";

const uuid = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const NATIVE_TOKEN_TYPES = { ANDROID: "android", IOS: "ios" };

/**
 * Asks for permission, reads this phone's FCM/APNs token and registers it with the server.
 *
 * Outcomes: REGISTERED | PERMISSION_DENIED | UNSUPPORTED_PLATFORM | TOKEN_UNAVAILABLE | SERVER_REJECTED.
 * TOKEN_UNAVAILABLE is what a build without Firebase configuration reports; it is never faked.
 */
export async function enablePush({ base, accessToken, platform, notifications, store, fetchImpl = fetch }) {
  if (!NATIVE_TOKEN_TYPES[platform]) return { status: "UNSUPPORTED_PLATFORM" };
  let permission = await notifications.getPermissions();
  if (!permission.granted) permission = await notifications.requestPermissions();
  if (!permission.granted) return { status: "PERMISSION_DENIED", canAskAgain: permission.canAskAgain !== false };

  let device;
  try {
    device = await notifications.getDeviceToken();
  } catch {
    return { status: "TOKEN_UNAVAILABLE" };
  }
  if (
    !device ||
    device.type !== NATIVE_TOKEN_TYPES[platform] ||
    typeof device.data !== "string" ||
    device.data.length < 20
  )
    return { status: "TOKEN_UNAVAILABLE" };

  let registered;
  try {
    registered = await registerPushToken(base, accessToken, { pushToken: device.data, platform }, fetchImpl);
  } catch (error) {
    return { status: "SERVER_REJECTED", code: error instanceof Error ? error.message : "UNKNOWN" };
  }
  if (!registered || typeof registered.id !== "string" || !uuid.test(registered.id))
    return { status: "SERVER_REJECTED", code: "MALFORMED" };
  await store.save(registered.id);
  return { status: "REGISTERED", id: registered.id };
}

/** Removes this phone's token from the server, then forgets it locally. Safe to repeat. */
export async function disablePush({ base, accessToken, store, fetchImpl = fetch }) {
  const id = await store.load();
  if (!id) return { status: "NOT_REGISTERED" };
  try {
    await deletePushToken(base, accessToken, id, fetchImpl);
  } catch (error) {
    const code = error instanceof Error ? error.message : "UNKNOWN";
    // The server no longer knows this token (404): treat it as already removed.
    if (code !== "HTTP_404") return { status: "SERVER_REJECTED", code };
  }
  await store.clear();
  return { status: "DISABLED" };
}

/** Re-registers after the platform rotates the token. Does nothing unless the farmer enabled push. */
export async function refreshPushToken({ base, accessToken, platform, newToken, store, fetchImpl = fetch }) {
  if (!(await store.load())) return { status: "NOT_REGISTERED" };
  if (typeof newToken !== "string" || newToken.length < 20) return { status: "TOKEN_UNAVAILABLE" };
  try {
    const registered = await registerPushToken(base, accessToken, { pushToken: newToken, platform }, fetchImpl);
    if (!registered || typeof registered.id !== "string" || !uuid.test(registered.id))
      return { status: "SERVER_REJECTED", code: "MALFORMED" };
    await store.save(registered.id);
    return { status: "REGISTERED", id: registered.id };
  } catch (error) {
    return { status: "SERVER_REJECTED", code: error instanceof Error ? error.message : "UNKNOWN" };
  }
}

export function describePush(status) {
  switch (status) {
    case "REGISTERED":
      return "Push is on for this phone.";
    case "DISABLED":
      return "Push is off for this phone.";
    case "NOT_REGISTERED":
      return "Push is off for this phone.";
    case "PERMISSION_DENIED":
      return "Notification permission was not granted. You can allow it in the phone's app settings.";
    case "UNSUPPORTED_PLATFORM":
      return "Push is only available on Android and iOS phones.";
    case "TOKEN_UNAVAILABLE":
      return "This build of the app has no push configuration (Firebase), so this phone cannot receive push yet. Updates still appear in the list.";
    case "SERVER_REJECTED":
      return "The server did not accept the request. Try again later.";
    default:
      return "Push status is unknown.";
  }
}

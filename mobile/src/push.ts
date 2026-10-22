import * as Notifications from "expo-notifications";
import * as SecureStore from "expo-secure-store";
import { Platform } from "react-native";

const KEY = "fasalguard.push.token-id.v1";

export const devicePlatform: "ANDROID" | "IOS" | "WEB" =
  Platform.OS === "android" ? "ANDROID" : Platform.OS === "ios" ? "IOS" : "WEB";

/** Thin native adapter: the only place that touches the permission prompt and the device token. */
export const nativeNotifications = {
  async getPermissions() {
    const permission = await Notifications.getPermissionsAsync();
    return { granted: permission.granted, canAskAgain: permission.canAskAgain };
  },
  async requestPermissions() {
    // Android 13+ needs a notification channel to exist before the permission prompt can appear.
    if (Platform.OS === "android")
      await Notifications.setNotificationChannelAsync("default", {
        name: "Farm updates",
        importance: Notifications.AndroidImportance.DEFAULT,
      });
    const permission = await Notifications.requestPermissionsAsync();
    return { granted: permission.granted, canAskAgain: permission.canAskAgain };
  },
  async getDeviceToken() {
    const token = await Notifications.getDevicePushTokenAsync();
    return { type: token.type as string, data: typeof token.data === "string" ? token.data : "" };
  },
};

/** The server-side token id lives in the encrypted store so a later sign-out can remove it. */
export const tokenStore = {
  save: (id: string) => SecureStore.setItemAsync(KEY, id),
  load: () => SecureStore.getItemAsync(KEY),
  clear: () => SecureStore.deleteItemAsync(KEY),
};

/** Show pushes that arrive while the app is open, quietly. */
export function showForegroundNotifications(): void {
  Notifications.setNotificationHandler({
    handleNotification: () =>
      Promise.resolve({
        shouldShowBanner: true,
        shouldShowList: true,
        shouldPlaySound: false,
        shouldSetBadge: false,
      }),
  });
}

/** Calls back when the platform rotates the token; returns an unsubscribe function. */
export function onTokenChange(callback: (token: string) => void): () => void {
  const subscription = Notifications.addPushTokenListener((token) => {
    if (typeof token.data === "string") callback(token.data);
  });
  return () => subscription.remove();
}

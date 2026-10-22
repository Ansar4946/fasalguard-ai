import * as SecureStore from "expo-secure-store";
import { isAllowedApiBase, isDevBundle } from "./api-url.mjs";
import { validateSession } from "./session-contract.mjs";

export type Session = {
  ownerId: string;
  accessToken: string;
  fields: {
    fieldId: string;
    farmId: string;
    cropSeasonId: string;
    cropId: string;
    name: string;
  }[];
};
const key = "fasalguard.offline.session.v1";
// Host authentication integration calls this only after obtaining a verified session.
// Do not connect this to the legacy identifier-only login endpoint.
export async function installAuthenticatedSession(
  accessToken: string,
  platformBase: string,
) {
  if (!isAllowedApiBase(platformBase)) throw new Error("HTTPS_REQUIRED");
  const response = await fetch(
    `${platformBase.replace(/\/$/, "")}/offline-scans/context`,
    {
      headers: { authorization: `Bearer ${accessToken}` },
      signal: AbortSignal.timeout(15000),
    },
  );
  if (!response.ok) throw new Error("AUTHENTICATED_CONTEXT_UNAVAILABLE");
  const body = await response.json();
  const account = validateSession({ ...body, accessToken });
  await SecureStore.setItemAsync(key, JSON.stringify(account));
}
export async function currentSession(): Promise<Session | null> {
  const stored = await SecureStore.getItemAsync(key);
  if (!stored) return null;
  try {
    return validateSession(JSON.parse(stored));
  } catch {
    return null;
  }
}
export async function clearSession() {
  await SecureStore.deleteItemAsync(key);
}

/**
 * DEVELOPMENT BUILDS ONLY (__DEV__). Lets a developer sign in on an emulator against a local
 * backend: logs in to the core API, then installs the session through the normal validated path.
 * If the platform API's offline-scan context is unavailable (feature flag off locally) the session
 * is stored with no cached fields so the notifications/USSD panels can be exercised; the offline
 * capture screen then correctly shows "no cached field". Refuses to run in a release bundle.
 */
export async function devSignIn(
  coreBase: string,
  platformBase: string | undefined,
  identifier: string,
  password: string,
): Promise<{ contextLoaded: boolean }> {
  if (!isDevBundle()) throw new Error("DEV_ONLY");
  if (!isAllowedApiBase(coreBase)) throw new Error("HTTPS_REQUIRED");
  const response = await fetch(`${coreBase.replace(/\/$/, "")}/auth/login`, {
    method: "POST",
    headers: { "content-type": "application/json", accept: "application/json" },
    body: JSON.stringify({
      identifier,
      password,
      device: { deviceIdentifier: `android-dev-${Date.now()}`, platform: "android" },
    }),
    signal: AbortSignal.timeout(15000),
  });
  if (!response.ok) throw new Error(`LOGIN_HTTP_${response.status}`);
  const body = await response.json();
  const accessToken: string = body?.tokens?.accessToken;
  const ownerId: string = body?.user?.id;
  try {
    if (!platformBase) throw new Error("NO_PLATFORM_URL");
    await installAuthenticatedSession(accessToken, platformBase);
    return { contextLoaded: true };
  } catch {
    const account = validateSession({ ownerId, accessToken, fields: [] });
    await SecureStore.setItemAsync(key, JSON.stringify(account));
    return { contextLoaded: false };
  }
}

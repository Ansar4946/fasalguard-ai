// Single place that decides whether an API base URL may be used.
//
// Release rule (unchanged): https:// only.
// DEBUG-ONLY exception: when React Native's __DEV__ is true (Metro dev bundle, never a release
// bundle where __DEV__ is false) plain http:// is accepted ONLY for the emulator/loopback hosts
// 10.0.2.2, localhost and 127.0.0.1, so a developer can point the app at a local backend through
// `adb reverse`. Any other http:// host is rejected in every build.
const DEV_HTTP_HOSTS = new Set(["10.0.2.2", "localhost", "127.0.0.1"]);

/** True only inside a development bundle. Node (tests) and release bundles report false. */
export function isDevBundle() {
  return typeof __DEV__ !== "undefined" && __DEV__ === true;
}

export function isAllowedApiBase(value, dev = isDevBundle()) {
  if (typeof value !== "string" || !value) return false;
  if (value.startsWith("https://")) return true;
  if (!dev) return false;
  const match = /^http:\/\/([^/:?#@]+)(?::\d{1,5})?(?:[/?#]|$)/.exec(value);
  return Boolean(match) && DEV_HTTP_HOSTS.has(match[1].toLowerCase());
}

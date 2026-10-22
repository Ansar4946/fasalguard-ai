# Mobile dependency triage (npm audit, mobile/)

Date: 2026-10-16. Baseline: 22 vulnerabilities (15 high, 7 moderate). Expo SDK 57 / React Native 0.86.3.

## Root causes (only three advisories; the other 19 entries are npm's transitive "via" chain)

| Advisory | Package (installed) | Severity | Patched version exists? | Shipped in APK? | Reachable? |
|---|---|---|---|---|---|
| GHSA-vfj7-8cjw-p6xm (braces <=3.0.3, stack exhaustion DoS on deeply nested brace patterns) | braces 3.0.3 via micromatch 4.0.8 via metro-file-map (Metro bundler) | high | NO (3.0.3 is latest) | No, build-time/dev-server only | No at runtime. Input is file globs from our own repo/Metro config, not attacker-controlled |
| GHSA-86w9-cpqp-85rv (node-forge <=1.4.0, PKCS#1 v1.5 signature forgery via nested DigestAlgorithm) | node-forge 1.4.0 via @expo/cli and @expo/code-signing-certificates | high | NO (1.4.0 is latest) | No, Expo CLI tooling (code-signing manifests for EAS Update, which this app does not use) | No. We do not verify RSA signatures with it |
| GHSA-w5hq-g745-h8pq (uuid <11.1.1, missing buffer bounds check in v3/v5/v6 with `buf`) | uuid 7.0.3 via xcode 3.0.1 via @expo/config-plugins (prebuild) | moderate | YES | No, prebuild config plugin (iOS pbxproj editing) | No (xcode only calls `uuid.v4()` without a buffer) |

Classification of all 22: every one is dev/build-time tooling (@expo/*, metro*, @react-native/community-cli-plugin,
xcode, node-forge, braces, micromatch, uuid). The `react-native` and `expo` rows are flagged only because they
depend on these tools. None of the 22 packages is loaded by the shipped Hermes bundle; the app's runtime
JS dependencies (react, expo-* modules, onnxruntime-react-native, @noble/ciphers, jpeg-js) have no advisories.
(`npm audit --omit=dev` still lists 15 because `expo`/`react-native` carry their CLI tooling as dependencies; that
is a packaging fact, not runtime exposure.)

## Actions taken

1. `expo` 57.0.28 -> 57.0.30 (the `expo install --check` target, same SDK 57). No other SDK-range change applied.
2. `overrides: { "xcode": { "uuid": "^11.1.1" } }` (scoped override; uuid 11.1.1 installed). Clears the uuid advisory
   and all 7 moderate findings. xcode only uses `uuid.v4()`, API-compatible.
3. Added devDependency `patch-package ^8.0.1` + `postinstall` (see below). It brings `find-yarn-workspace-root`
   which depends on the same unpatched micromatch/braces, so npm now counts 2 more dev-only highs.
4. Rejected: `npm audit fix --force` (proposes `expo@44.0.6` and `react-native@0.72.17`, i.e. 13 SDKs of downgrade,
   incompatible with this app). Not applied.
5. Not changed, flagged: `expo install --check` also suggests `typescript ~6.0.3` and `@types/react ~19.2.4`
   (installed 5.9.3 / 19.3.0). Left as is; typecheck passes; a TS 6 move is a separate decision.

## Result

`npm audit`: 17 high / 0 moderate (was 15 high + 7 moderate), all build-time. Remaining items have NO upstream fix:
re-check weekly (`npm audit`, then bump Expo patch releases) and when braces > 3.0.3 / node-forge > 1.4.0 publish,
add scoped overrides. Mitigations: do not run `expo start` / Metro on untrusted networks or with untrusted globs; do
not use EAS Update code signing; build in CI with a pinned lockfile (`npm ci`). CI job `.github/workflows/mobile.yml`
fails only on critical production advisories.

Verification (local, Windows, Node 24): `npm run lint` clean, `npm run typecheck` clean, `npm test` 30/30 pass.

## onnxruntime-react-native patch (persisted)

`node_modules/onnxruntime-react-native/android/build.gradle` used `VersionNumber.parse(...)`, removed in Gradle 9.
The fix (compare `REACT_NATIVE_MINOR_VERSION < 71`, already defined in that file) is now `mobile/patches/onnxruntime-react-native+1.24.3.patch`
(756 bytes, one hunk), applied by `postinstall: patch-package`. Verified by extracting the pristine
`npm pack onnxruntime-react-native@1.24.3` tarball into an empty directory and running patch-package: "onnxruntime-react-native@1.24.3 ✔".
If the package version changes the patch will fail the install loudly; re-evaluate whether upstream fixed it then.
Not verified: a full `npm ci` from scratch and an actual Gradle 9 Android build.

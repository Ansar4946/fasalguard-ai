# Mobile app on the Android emulator (debug build)

Date: 2026-10-16. App: `mobile/` (pk.fasalguard.mobile), Expo SDK 57 / RN 0.86.3 / Gradle 9.3.1, x86_64 debug build on AVD `fasal_push_test`.

## Status

| Item | Result |
| --- | --- |
| `gradlew assembleDebug` (x86_64) | Builds. The earlier `:expo SoftwareComponent 'release' not found` did not recur. |
| App installs and boots on the emulator | Yes, after the three fixes below. No FATAL/AndroidRuntime crash in logcat. |
| Encrypted local store (SQLCipher) opens | Yes, after fix 3. |
| Developer sign-in form renders, accepts the demo account | Yes (screenshots 02, 03). |
| Sign-in against the core API | NOT VERIFIED. The attempt returned `LOGIN_HTTP_500`, then `429` throttling. Docker Desktop was no longer running at that moment (see Blocker). |
| Dashboard/farms, USSD `*786#` keypad, notifications panel, "Turn on push" result, offline/scan screen with a session | NOT REACHED. They only render after sign-in. Nothing here is claimed as working. |

Screenshots are in `docs/qa/mobile-emulator/`: `01-launch.png` (bundling), `02-signin.png` (app booted, sign-in form), `03-credentials-entered.png`, `04-signed-in.png` (shows the failure banner "Operation could not complete"), `05-signin-failed-backend-down.png`. The other PNGs in that folder (`typed*.png`, `reload-check*.png`, `signin-result.png`, `after-openssl.png`) were created by another session driving the same emulator, not by this run.

## Blocker

After the app booted, `POST http://127.0.0.1:4100/api/v1/auth/login` returned 500 from the app. A later curl returned 429 (rate limit hit by repeated attempts). At that point `docker info` could not reach the daemon, Docker Desktop and vmmem were not running, and nothing listened on :8000 (platform API) or Postgres/Redis. Only the host processes on :3100 (web) and :4100 (core API) were alive. The host was at its commit limit earlier in the session (Gradle JVM crashed with "paging file too small"), which is the likely reason Docker Desktop went away. This run did not restart Docker or the stack, per instructions. To finish the verification: start Docker Desktop, bring the stack back (`stack-demo.sh`), wait a minute for the login throttle to expire, then press "Sign in (dev)" in the already-open app (email and password fields still filled).

## Problems found and fixed

1. **Red screen "[runtime not ready]: Cannot read property 'install' of null".**
   Root cause: `onnxruntime-react-native` was never autolinked. It ships a legacy `unimodule.json`, so `expo-modules-autolinking` treated it as an Expo module that conflicts with its Gradle project and skipped it (`PackageList.java` contained only `ExpoModulesPackage`). Its JS then called `NativeModules.Onnxruntime.install()` on import, at app start.
   Fixes: (a) `mobile/patches/onnxruntime-react-native+1.24.3.patch` now also adds `react-native.config.js`, which makes it link as a normal RN library (the autolinking config now lists it). (b) `src/onnx-runtime.mjs` + `src/models.ts` load the runtime lazily inside `inferLocal`; an unlinked runtime reports `NATIVE_RUNTIME_UNAVAILABLE`, and `App.tsx` shows an honest "native ONNX runtime is not part of this build" message. Test: `tests/onnx-runtime.test.mjs`.
2. **No sign-in UI existed** (by design the app waits for a verified host sign-in). Added a development-only sign-in form (`__DEV__` only, absent from release bundles): `devSignIn` in `src/session.ts` logs in to the core API, then installs the session through the normal validated path. The platform API's `/offline-scans/context` returns 404 on this backend (offline sync feature flag off), so the dev session is stored with no cached fields; the capture screen then says no field is cached.
3. **"Private offline storage is unavailable."** `libexpo-sqlite.so` (SQLCipher) failed with `dlopen failed: library "libcrypto.so" not found`. expo-sqlite declares the OpenSSL AAR `compileOnly` and AGP does not package its prefab `.so` files. Fix: `plugins/sqlcipher-openssl.gradle` extracts the per-ABI `libcrypto.so`/`libssl.so` from the same AAR into the APK, applied by `plugins/with-sqlcipher-openssl.js` (registered in `app.json`, so `expo prebuild` reproduces it). The APK now contains `lib/x86_64/libcrypto.so` and `libssl.so`.
4. **http URLs rejected** (HTTPS_REQUIRED). New `src/api-url.mjs`: https is always allowed; plain http is allowed only when `__DEV__` is true and the host is exactly `10.0.2.2`, `localhost` or `127.0.0.1`. Used by `session.ts`, `ussd.mjs`, `sync.mjs` (so `notifications.mjs`) and both panels. Release and Node behaviour is unchanged. Tests: `tests/api-url.test.mjs` (release rejects http even for loopback and rejects look-alike hosts such as `127.0.0.1.evil.com`).

Verification: `npm test` 36 pass / 0 fail, `tsc --noEmit` clean, eslint clean.

Gotchas: the emulator is slow (swiftshader, low RAM). The sign-in fields are uncontrolled inputs because a controlled value garbled typing. Do not press Back with the keyboard closed (it leaves the app). Only one session should drive `adb input` at a time. Gradle needs headroom: stop idle JVMs first; it crashed with "paging file too small" until they were stopped.

Containers stopped by this run: `fasalguard-platform-web-1`, `fasalguard-platform-api-1`, `fasalguard-platform-worker-1` (old-code app containers, not removed).

## How to run it again

```sh
# 1. Backend up (core :4100, platform :8000), then in mobile/ (first time: npm ci, which runs patch-package)
cd mobile
export ANDROID_HOME=D:/dev/android-sdk ANDROID_SDK_ROOT=D:/dev/android-sdk NODE_ENV=development
# 2. Build the x86_64 debug APK (about 5 to 20 min; one heavy command at a time)
cd android && ./gradlew.bat assembleDebug -PreactNativeArchitectures=x86_64 \
  -Dorg.gradle.jvmargs=-Xmx2g -Pkotlin.compiler.execution.strategy=in-process \
  -Dorg.gradle.parallel=false -Dorg.gradle.workers.max=2 --console=plain; ./gradlew.bat --stop; cd ..
# 3. Emulator
D:/dev/android-sdk/emulator/emulator -avd fasal_push_test -memory 2048 -gpu swiftshader_indirect -no-snapshot &
ADB=D:/dev/android-sdk/platform-tools/adb
$ADB wait-for-device; until [ "$($ADB shell getprop sys.boot_completed | tr -d '\r')" = 1 ]; do sleep 5; done
# 4. Ports and install (reverse makes http://127.0.0.1:PORT work inside the emulator)
$ADB reverse tcp:8081 tcp:8081; $ADB reverse tcp:4100 tcp:4100; $ADB reverse tcp:8000 tcp:8000
$ADB install -r android/app/build/outputs/apk/debug/app-debug.apk
# 5. Metro with the API URLs (http allowed only in this debug build, loopback only)
EXPO_PUBLIC_CORE_API_URL=http://127.0.0.1:4100/api/v1 EXPO_PUBLIC_PLATFORM_API_URL=http://127.0.0.1:8000/api/v1 \
EXPO_GOOGLE_SERVICES_FILE=./google-services.json npx expo start --dev-client --port 8081 &
$ADB shell monkey -p pk.fasalguard.mobile -c android.intent.category.LAUNCHER 1
# 6. In the app: "Developer sign-in (debug build)", demo.farmer@example.com / the demo password, "Sign in (dev)".
```

Screenshots: `adb exec-out screencap -p > docs/qa/mobile-emulator/NN-name.png`. Crashes: `adb logcat -d | grep -E "FATAL EXCEPTION|ReactNativeJS"`.

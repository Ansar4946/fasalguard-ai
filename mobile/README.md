# F06 mobile client

This is a disabled offline-screening foundation, not a working crop classifier release.
No model weights are bundled. Secure sign-in integration, native builds/runtime testing,
real database integration and dependency remediation are blocked. Read ../docs/features/F06.md.

Use `npm ci`, `npm run typecheck`, `npm test`, `npx expo prebuild --platform android`,
then the native toolchain. SQLCipher and ONNX require a native build; Expo Go is insufficient.
The app fails closed if encrypted SQLite is unavailable. Do not connect it to the existing
identifier-only login endpoint. A verified host authentication flow must call
installAuthenticatedSession using HTTPS. Never put secrets in EXPO_PUBLIC_PLATFORM_API_URL.

No arbitrary model download or cloud inference fallback exists. installedModels is deliberately
empty. Model enablement requires a reviewed app release with licensed/evaluated weights and
matching approved server model_versions metadata. Client results are unverified screening.

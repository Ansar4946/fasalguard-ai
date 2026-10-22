# QA6: auth password enforcement, CSP/security headers, PostgreSQL integration, outage behaviour

Date: 2026-10-16. Scope: verification only, no application code was edited. Everything ran on disposable containers `qa6-pg` (postgis 17, port 55446) and `qa6-redis` (port 56446), both removed at the end, plus a local API (`node dist/main.js`, `NODE_ENV=development`, port 4046) and the existing production build of the web app (`next start`, port 3046, `NODE_ENV=production`, `WEB_APP_URL` unset so the origin check falls back to same-origin over http). Playwright Chromium headless. The host had internet access, so Leaflet tiles from OSM and Esri really loaded.

Scripts: `docs/qa/qa6/` (`run-integration.sh`, `rerun-clean.sh`, `jest.qa6.config.cjs`, `jest.qa6-gap.config.cjs`, `throttle-gap.setup.cjs`, `start-stack.sh`, `start-api.sh`, `browser.cjs`, `session-probe.cjs`). Logs: `docs/qa/qa6-logs/`. No secrets are recorded; the DB password is a throwaway default in the scripts.

Status keys: PASS, FAIL (defect), BLOCKED (could not be exercised, reason given).

## Deviations from the documented procedure (read first)

1. Cold `ts-jest` type-checking pushes `AppModule` bootstrap past the specs' hard-coded 30 s `beforeAll` on this memory-limited host: the stock config failed all 4 auth tests twice (`auth-integration.log`, `auth-integration-run2.log`, "Exceeded timeout of 30000 ms for a hook"). All numbers below use `docs/qa/qa6/jest.qa6.config.cjs`, which is the repo config with ts-jest `isolatedModules: true, diagnostics: false` (no type check). Test code and application code are unchanged.
2. Several specs refuse to run unless the DB is named `f07_test`, `f08_test`, `f09_test`, `f10_test`, `f12_test` or `yield_test`. Those were cloned from the migrated `qa6` DB with `CREATE DATABASE ... TEMPLATE`. A first single-process run of all specs together (`all-integration.log`) was invalid for that reason (8 suites "failed to run" on the DB-name guard) and is not counted.
3. Web: `next start` of a production build must run with `NODE_ENV=production`; the CSP and HSTS in the build are therefore the production variants. Cookies are `Secure` and Chromium accepted them on `http://localhost`.
4. The speech provider is not configured (`Real speech service is not configured.`), so for `/assistant` only the three speech BFF endpoints (capabilities, consent, transcribe/synthesize) were stubbed in Playwright. Presign, upload and the CSP behaviour are real.

## 1. PostgreSQL integration specs (real counts)

Each spec run alone with `--runInBand --forceExit` against a freshly migrated DB (`run-integration.sh`, logs in `qa6-logs/integration/`), failures re-run on clean clones (`qa6-logs/integration-clean/`).

| Spec | Result | Notes |
|---|---|---|
| auth | 3 of 4 pass | PASS 4 of 4 when a 62 s gap is inserted before test 4 (`auth-integration-run5-gap.log`). See defect D1. |
| assistant-grounding (F10) | 16 of 16 pass | matches F10.md |
| notifications (F12) | 24 of 24 pass | matches F12.md |
| farm-finance (F09) | 8 of 8 pass | F09.md records 7 |
| voice-assistant (F08) | 4 of 4 pass | |
| market | 2 of 2 pass | |
| market-workflow | 6 of 6 pass | |
| database-geospatial | 9 of 9 pass | |
| farm-digital-twin | 4 of 4 pass | |
| farm-management | 5 of 5 pass | |
| offline-sync | 4 of 4 pass | |
| media | 5 of 5 pass | |
| expert-review | 1 of 1 pass | |
| knowledge | 2 of 2 pass on a clean DB | first run on the shared DB timed out at the 5 s `beforeAll` (cold import), passed on rerun |
| billing | 5 of 5 tests pass, suite exits 1 | `afterAll` cleanup FK error, defect D2 |
| growth | 3 of 3 tests pass, suite exits 1 | `afterAll` cleanup FK error, defect D2 |
| outbreak-geospatial | 1 of 2 pass | defect D3 |
| yield (F13) | 8 of 10 pass | defect D4 |

Totals: 18 specs, 114 tests. 111 pass (counting auth at 4 with the gap), 3 fail (outbreak 1, yield 2), plus 2 suites that report "failed to run" after all their tests passed (billing, growth). With the stock timing, auth is 3 of 4 (so 110 pass, 4 fail).

Defects (test/fixture or application, not fixed here):

- D1 (auth test 4, 429): `POST /auth/login` is limited to 5 per 60 s per client IP. The spec makes 3 negative logins plus 2 positive ones in tests 2 and 3, so test 4's login is the 6th and gets `429 Too Many Requests`. Either the throttle needs to be keyed/raised for the test or the spec needs a reset. Deterministic (reproduced 3 times); passes with a 62 s gap.
- D2 (billing, growth): `DELETE FROM users` in `afterAll` violates `subscription_payments_verified_by_user_id_fkey` (billing.integration-spec.ts:68) and `farmer_profiles_referred_by_user_id_fkey` (growth.integration-spec.ts:54). Test data leaks and the suite reports failure. Reproduced on a fresh DB.
- D3 (outbreak-geospatial "prevents duplicate farmer verification at database level"): `INSERT INTO farmer_profiles(user_id,full_name)` omits `referral_code`, which is NOT NULL after the referral migration. Stale fixture. Reproduced on a fresh DB.
- D4 (yield): converted value is 2965.159 kg/ha where the spec expects 2965.157 for 30 maund/acre (2 tests, import and reference range). Either the unit constant in the importer or the expected value is off by 0.002; it is a rounding-level discrepancy but the test is red.

## 2. Login requires the password

| Check | Result | Evidence |
|---|---|---|
| AUTH-1 identifier-only POST to web `/api/auth/login` | PASS | 400, no cookie, no token in body |
| AUTH-1b empty password via web BFF | PASS | 400 |
| AUTH-1c identifier-only POST to the Nest API `/auth/login` | PASS | 400, no token |
| AUTH-2a wrong password via BFF | PASS | 401 `INVALID_CREDENTIALS`, no cookie |
| AUTH-2b wrong password in the UI | PASS | alert "No account found for that email or phone number.", stays on `/login`, 0 `fg_*` cookies |
| AUTH-3 correct password in the UI | PASS | lands on `/dashboard`; `fg_access` and `fg_refresh` set, httpOnly, secure, SameSite=Lax |
| Known-password user from the register endpoint can sign in | PASS | user created via `/auth/register` with a known password (the endpoint onboarding calls); sign-in as AUTH-3 |
| AUTH-4 `/api/auth/onboarding` | PASS (partial) | 201, session cookies set, `emailDelivery=failed` (no SMTP). Onboarding generates a random password that is only emailed, so signing in with a known password through onboarding itself is BLOCKED (no SMTP, no way to read the setup token). |

Note: the error text for a wrong password on an existing account says "No account found for that email or phone number" (code `INVALID_CREDENTIALS`); this is a misleading message, not an enumeration leak, but it is wrong for the wrong-password case.

## 3. CSP and security headers (production build)

Headers present on `/login`: Content-Security-Policy, X-Content-Type-Options, X-Frame-Options, Referrer-Policy, Permissions-Policy, Cross-Origin-Opener-Policy, Strict-Transport-Security (CSP-0 PASS).

CSP served: `default-src 'self'; script-src 'self' 'unsafe-inline'; style-src 'self' 'unsafe-inline'; img-src 'self' data: blob: https://*.tile.openstreetmap.org https://server.arcgisonline.com https://lh3.googleusercontent.com https:; font-src 'self' data:; connect-src 'self'; media-src 'self' data: blob:; worker-src 'self' blob:; object-src 'none'; base-uri 'self'; form-action 'self'; frame-ancestors 'none'`.

Method: a `securitypolicyviolation` listener injected before page scripts, plus console messages matching "Content Security Policy", plus `requestfailed` entries with `ERR_BLOCKED_BY_CSP`; non-CSP failures (here only `net::ERR_ABORTED` from navigations and cancelled prefetches or superseded tiles) are listed separately.

| Page | Result | Detail |
|---|---|---|
| `/login` (anonymous), `/dashboard`, `/farms`, `/farms/new`, `/farms/{id}`, `/farms/{id}/edit`, `/farms/{id}/fields`, `/fields` (redirects to `/farms`), `/satellite`, `/radar`, `/weather`, `/market-intelligence`, `/learning`, `/scan`, `/tasks`, `/alerts`, `/irrigation`, `/analytics` | PASS (18 pages) | 0 violations, 0 CSP console messages, 0 CSP-blocked requests (`browser-main.log`). |
| Leaflet maps | PASS | `/dashboard` 9 of 9 tiles loaded, `/farms/new` 6 of 6, `/farms/{id}` 4 of 4, `/farms/{id}/edit` 6 of 6 with field polygons drawn; OSM and Esri tiles loaded from the real hosts. `/satellite`, `/radar`, `/fields` render no map without data, so those map components were not exercised (BLOCKED for satellite and radar maps). |
| CSP-IMG probe | PASS | OSM and Esri images load, no violation. Note `https:` in `img-src` makes the named hosts redundant: any https image is allowed. |
| CSP-NEG negative control | PASS | `fetch('https://example.com/')` blocked by `connect-src`, `<script src=https://example.com/x.js>` blocked by `script-src-elem`, so the policy is actually enforced. |
| `/assistant` page load, mic and playback path | FAIL | one violation, below. |
| Permissions-Policy `microphone=(self)` | PASS | `document.featurePolicy.allowsFeature('microphone')` is true |
| Mic recording with fake device, permission granted | PASS | Start recording then Stop recording works; MediaRecorder starts |
| Permission not granted | PASS | graceful message "Microphone could not be started.", no violation |
| Audio playback: "Play transcript" with stubbed synthesize | PASS | `data:audio/wav` plays, status "Playing generated speech." |
| `media-src` `data:` and `blob:` audio | PASS | `loadeddata` and `loadedmetadata` |

CSP violation found (FAIL):

- Directive `connect-src 'self'`. Console message: `Connecting to 'https://mock-storage.invalid/upload/voice-note%2F...webm?temporary=1' violates the following Content Security Policy directive: "connect-src 'self'". The action has been blocked.` Source: the Next static chunk of `components/conversations/farmer-assistant.tsx`, `fetch(presign.upload.url, { method: 'PUT', body: blob })`. The UI then shows "Failed to fetch" and the voice note is never transcribed. The host here is the mock storage provider, but any real storage provider (Alibaba OSS signed URL, S3) is a different origin and is blocked the same way. `components/scan/image-upload.tsx` uses the same presign then browser `PUT` pattern (read from code; the scan upload was not exercised in the browser), so crop-scan image upload is expected to break too. Fix direction: add the storage origin to `connect-src` (from config) or proxy uploads through the same origin.

## 4. Postgres stopped mid-session

Setup: signed in through the UI, then `docker stop qa6-pg`. During the outage `GET {API}/auth/me` with a valid token returns 503 `SESSION_STORE_UNAVAILABLE`.

| Check | Result | Evidence |
|---|---|---|
| OUT-0 signed in | PASS | `/dashboard`, 2 cookies |
| OUT-1a Next `proxy.ts` on a protected page (no JS) | PASS | 307 to `/login?reason=session-unavailable`, no `Set-Cookie`, so the proxy itself keeps cookies |
| OUT-1b BFF `GET /api/auth/me` during the outage | FAIL | returns 401 and sets `fg_access` and `fg_refresh` cleared; cookies are gone |
| OUT-1 cookies retained after authenticated navigation | FAIL | `/dashboard` lands on `/login?reason=session-unavailable` with 0 cookies; next navigations `/farms`, `/assistant` land on `/login?returnTo=...` |
| OUT-2 navigation stays on the page (not a login redirect) | FAIL | redirected to the login page |
| OUT-3 recovery after `docker start qa6-pg` | FAIL | API `/auth/me` recovered (200) but the browser is on `/login?returnTo=%2Fdashboard`; the user must sign in again |

Root cause: `app/api/auth/me/route.ts` calls `fetchCurrentUser` (lib/auth/server-session.ts), which returns null for any non-2xx response, then tries refresh (which fails with 500 while the DB is down) and calls `clearSessionCookies()` with a 401. The redirected-to login page mounts `AuthProvider`, which calls this route (`features/auth/auth-provider.tsx`), so the proxy's careful 503 handling is undone one request later. The route has a `catch` returning 503, but it is never reached because non-OK statuses are not thrown.

## 5. Related defect found: API rate limit logs users out (RL-1, FAIL)

`proxy.ts` calls `GET /auth/me` for every matched request, including Next RSC prefetches, and the API limits requests to 120 per minute per user (`RATE_LIMIT_PER_MINUTE`, in memory). A normal browsing session reproduces it: in the default configuration the sweep was bounced to `/login?reason=session-unavailable` at `/satellite` (about 8 pages in), then `/login?returnTo=...` for every later page (first run, and again with the default limit in `session-probe.log`: `/auth/me` returned 429 at the 6th page). Direct reproduction: 140 `GET /auth/me` produced 42 to 88 responses of 429, then BFF `/api/auth/me` returned 401, cleared both cookies, and the proxy redirected to `/login?returnTo=%2Fdashboard`. A 429 (like a 503) must not be treated as an invalid session. The CSP page sweep was therefore run with `RATE_LIMIT_PER_MINUTE=10000`; pages that were bounced are reported BLOCKED by the script, and with the raised limit all 18 pages were actually exercised.

Also note: login is limited to 5 per minute per client IP and the web server is the only client IP the API sees unless `TRUST_PROXY` is configured, so all web users share one login bucket by default.

## Summary

- Integration: 111 of 114 tests pass, 2 suites report cleanup errors, 3 tests fail (D1 to D4 above).
- Password is required at the web BFF and at the API: PASS. Known-password sign-in: PASS.
- CSP: no violations on 18 pages and maps; one real violation, `connect-src 'self'` blocking presigned upload PUTs (voice note, and by code, scan images). FAIL.
- Postgres outage: FAIL, the session is destroyed by `/api/auth/me` after the proxy's redirect; the same flaw logs users out on a rate-limit 429.
- BLOCKED: real speech provider, onboarding-generated password (needs SMTP), satellite and radar map rendering (no data), real scan upload in browser.

Cleanup: web and API processes stopped, `qa6-pg` and `qa6-redis` removed, no listeners on 3046, 4046, 55446 or 56446.

# Authentication & Session Security Audit

Audited: 2026-08-17. Scope: `services/api/src/domain/auth/`, `services/api/src/domain/auth/guards/`, `lib/auth/server-session.ts`, `proxy.ts`. Pre-existing `docs/AUTH_ARCHITECTURE.md` is accurate and consistent with everything below; this doc goes deeper and adds explicit file:line citations plus the one open item it doesn't cover.

## Overall verdict

This is an above-average implementation for an early-stage codebase. Password hashing, refresh-token rotation with reuse detection, server-side-revocable sessions, ownership scoping, and production config hardening are all done correctly. **The one genuine P0 is not in the auth logic itself — it's that real-looking credentials are committed to `services/api/.env.example` and already pushed to the GitHub remote** (see Finding #1).

## Registration / login / password storage

- `auth.service.ts` `register()` (lines 35-80): checks for an existing account by lowercase email, hashes with **Argon2id** (`memoryCost: 19456, timeCost: 2, parallelism: 1`), creates `users` + `farmer_profiles` + `consents` + a device row inside one DB transaction.
- `login()` (lines 81-115): looks up by email-or-phone, verifies with `argon2.verify`, rejects on missing hash / inactive status / bad password with the **same generic `INVALID_CREDENTIALS` message** in every case — no username enumeration via differing errors.

## Password setup / reset

- `password-reset.service.ts` `requestSetup()`: generates a 32-byte random token, stores only its **SHA-256 hash**, TTL-bound (default 30 min), invalidates any prior unused token first. Raw token is never persisted.
- `completeSetup()`: requires `used_at IS NULL AND expires_at > now()`, uses `FOR UPDATE` row lock to prevent race/replay, marks the token used inside the same transaction as the password update.
- OTP: a provider abstraction exists (`otp/production-otp.provider.ts`, `otp/development-otp.provider.ts`), but **no controller route currently exposes an OTP endpoint at all** — dormant regardless of `OTP_PROVIDER` setting. Production config validation forbids `OTP_PROVIDER=development` in production either way.

## Session mechanism: JWT access token + opaque rotating refresh token

- Access token: signed JWT (`{sub, sid, role, type:'access'}`), 15-minute default TTL, secret/issuer/audience from config via `getOrThrow` (no silent fallback).
- Refresh token: **opaque 48-byte random value, not a JWT**, stored server-side only as its SHA-256 hash (`auth_sessions.refresh_token_hash`).
- `refresh()` row-locks the session (`FOR UPDATE`), detects **reuse of an already-revoked refresh token** and revokes the entire token family in that case (`REFRESH_TOKEN_REUSED`) — this is the correct pattern for detecting a stolen/replayed refresh token, and it's implemented, not just documented.
- Every rotation records `replaced_by_session_id`, giving a full audit chain.
- `logout()` revokes only the session tied to the exact refresh token supplied — multi-device friendly, doesn't kill other sessions.
- Self-service session management exists and is correctly scoped: `GET /auth/sessions`, `DELETE /auth/sessions/:id`, `DELETE /auth/sessions` all filter `WHERE ... AND user_id=$2` server-side — a user cannot revoke another user's session by guessing a session ID.

## `GET /auth/me` and per-request validation

- The heavy lifting is in `guards/jwt-auth.guard.ts`, not `/me`. On **every** protected request it:
  1. Verifies JWT signature + explicit issuer/audience.
  2. Rejects a non-`access`-type token (so a refresh token, or a token minted for another purpose, can't be replayed as an access token).
  3. **Re-queries the DB on every request**, requiring `revoked_at IS NULL AND expires_at>now() AND status='active' AND deleted_at IS NULL` — revoking a session or suspending a user takes effect immediately, not after the JWT's 15-minute expiry.
  4. Populates `req.user.role` from the **freshly-queried DB role**, not the JWT's `role` claim — a stale/forged role claim in an old JWT cannot grant elevated access after a server-side role change.

## Route protection / RBAC

- `app.module.ts:99-104` registers `ThrottlerGuard → JwtAuthGuard → RolesGuard` as global `APP_GUARD`s — **every route is authenticated and role-checked by default**, deny-unless-`@Public()`. Confirmed only `register/login/refresh/password/setup*` are `@Public()`.
- `RolesGuard`: no `@Roles()` metadata = auth-only route; present = must match or `403 INSUFFICIENT_ROLE`.
- Verified class-level role gates: `FarmManagementController`/`CropScanController` → `Farmer` only; `ExpertReviewController` → expert/admin roles; `ConsultationController` → shared farmer+reviewer with service-level scoping on top.

## Resource ownership (IDOR) — checked and sound

Every controller/service pair reviewed (farms, fields, crop-scans, expert-review, consultations) scopes by the **authenticated principal's ID joined server-side**, never a client-supplied ID alone:

- `farm-management.service.ts` `requireFarm()`/`requireField()` filter `WHERE f.id=$1 AND fp.user_id=$2`, throwing `NotFoundException` (not `Forbidden`) on mismatch — a farm owned by someone else looks identical to a nonexistent farm, which is the correct anti-enumeration behavior. Ownership is checked both at read and baked into the write predicate (belt-and-suspenders against TOCTOU races).
- `expert-review.service.ts` prevents an `AGRICULTURE_EXPERT` from assigning a case to any expert ID other than themselves, and re-verifies the acting expert is `verified` before confirm/reject actions.
- **No IDOR found** in the paths reviewed.

## Cookie / browser session bridge (`lib/auth/server-session.ts`, `proxy.ts`)

- Cookies `fg_access`/`fg_refresh`: `httpOnly: true`, `secure: NODE_ENV==='production'`, `sameSite: 'lax'`, `path: '/'`. Access cookie `maxAge` correctly mirrors the backend's actual token TTL. Clear-cookie flags match set-cookie flags exactly (a common source of "logout doesn't actually clear the cookie" bugs — not present here).
- `mutationOriginAllowed()` rejects cross-origin mutations by comparing `Origin` to the request URL's origin; a missing `Origin` header is correctly rejected in production, only tolerated in dev.
- `proxy.ts` gates all protected route prefixes via `/auth/me`, refresh-and-retry once, and role-gates `/expert/*`/`/government/*` — explicitly a **navigation-level** gate only; actual authorization is (correctly) enforced again server-side by the Nest guards, so this is defense-in-depth, not the sole control.

## Findings

### P0 — Real-looking credentials committed to git and already pushed to the remote
`services/api/.env.example` is headed "Development placeholders only. Never reuse these values in production," but contains filled-in values that don't match that pattern — every other unset secret in the same file (`ROBOFLOW_API_KEY`, `QWEN_API_KEY`, `SENTINEL_HUB_CLIENT_SECRET`, `OSS_ACCESS_KEY_SECRET`) is correctly left blank:
- `SMTP_HOST=alimuhammadansar31@gmail.com` (a personal Gmail address used as a hostname — also a functional bug, not just a leak, since it's not a valid SMTP host)
- `SMTP_USER=alimuhammadansar31@gmail.com`
- `SMTP_PASSWORD=umli jqlm ibgq fcqe` — formatted exactly like a live **Google App Password**
- `GEMINI_API_KEY=AQ.Ab8RN6InDkYKp9T9lKEmg81sc5EF3iK20YzO0KfjjGKFo5xFaA` — filled in, unlike the other blank provider keys in the same file

Confirmed via `git log`/`git ls-remote`: this file entered the repo in the single foundational commit `c5b9ff01` and that commit is the current `HEAD` on **both `master` and `fasalgurard-v1` on `origin` (`github.com/Ansar4946/fasalguard-ai`)** — i.e. these values are live on the remote right now, not just local scratch. Repo visibility (public/private) could not be verified from this environment (no `gh` CLI available) — **treat as potentially public and act accordingly.**

**Action needed (user decision, not something this audit performed): rotate the Gmail app password and the Gemini API key immediately; replace both in `services/api/.env.example` with actually-empty placeholders matching the root `.env.example` convention; if the repo has ever been public, consider scrubbing git history.**

### P1 — Frontend refresh-cookie lifetime is hardcoded, not sourced from backend config
`lib/auth/server-session.ts:9` and `proxy.ts:11` both hardcode `30 * 86400` seconds (30 days) for the refresh cookie's `maxAge`, rather than reading the backend's configurable `REFRESH_TOKEN_TTL_DAYS` (default 30, configurable 1-90). If an operator changes `REFRESH_TOKEN_TTL_DAYS` without updating both frontend literals, the browser cookie can outlive or undercut the real server-side session validity. Low severity in practice — the backend guard re-checks `auth_sessions.expires_at` on every request regardless (see "GET /auth/me" above) — but confusing/wasteful, and already flagged as a known limitation in the pre-existing `docs/AUTH_ARCHITECTURE.md:22`. Fix: centralize this value (e.g. expose it via a config endpoint or build-time env var shared by both sides).

### P1 — `crop-scan.service.ts:129` ownership-check query references a nonexistent column
Not an auth *bypass* (it fails closed with a Postgres error rather than skipping the check), but worth flagging here since it's in the ownership-check code path. Full detail in `docs/DATABASE_ARCHITECTURE.md`.

## Explicitly checked and found sound — no action needed

- No missing ownership checks / IDOR in farms, fields, crop-scans, expert-review, consultations.
- No weak/default JWT secret possible in practice — production config validator actively blocks weak secrets (<48 chars or containing `'replace-with'`), wildcard CORS, `ENABLE_SWAGGER=true`, unauthenticated Sentry DSN, missing SMTP config, dev OTP provider, and incomplete storage/AI provider credentials for whichever provider is selected.
- Cookie flags correct and consistent between set and clear.
- Refresh-token rotation with reuse detection and row-locked family revocation is correctly implemented.
- Global auth + role guards are applied by default to all routes; `@Public()` opt-out is minimal and deliberate.
- No `synchronize`/schema-drift risk — `synchronize:false` explicit in both TypeORM entry points.
- No hardcoded secrets found in application source code itself (only in the `.env.example` file, per the P0 above).

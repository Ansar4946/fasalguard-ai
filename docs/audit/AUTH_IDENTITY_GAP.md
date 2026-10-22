> Imported historical audit. See [WORKSPACE_REVALIDATION.md](WORKSPACE_REVALIDATION.md) for current paths, verification limits, and corrections.

# Authentication & Identity Gap Analysis (Phase B)

Date 2026-10-13. Scope: OpenFarm `884a6156` as run in `fasalguard-phaseb`, plus the legacy FasalGuard app (read-only). This document **recommends**; nothing here is implemented.

## 1. How OpenFarm authenticates today (verified)

```
Browser ──Google OAuth (NextAuth v4, PKCE S256)──▶ apps/web
   │  signIn callback: upsertUser(email,name) → users + default org + owner membership (direct SQL from web)
   │  session: NextAuth JWT cookie, 30-day maxAge
   ▼
POST /api/auth/token (needs NextAuth session) ──mints HS256 JWT {sub,email,name}, 1 h──▶ browser
   ▼
FastAPI  Authorization: Bearer <JWT>  +  X-Org-Id: <uuid>
   get_current_user: verify HS256 with OPENFARM_JWT_SECRET (no iss/aud)
   get_org_context:  membership(org,user) AND org not soft-deleted → role
TiTiler  ?access_token=<same JWT>  (signature check only)
```

| # | Check | Result | Class | Evidence |
|---|---|---|---|---|
| A1 | Only configured login provider | `{"google": …}`, nothing else | RUN_PASS | `logs/web_checks.log` (`/api/auth/providers`) |
| A2 | Google sign-in request is well-formed | 302 to `accounts.google.com/o/oauth2/v2/auth`, `response_type=code`, PKCE `S256`, `state`; `client_id=your-google-client-id` (placeholder) | RUN_PASS (request) | `logs/web_checks.log` |
| A3 | Real Google browser login | Not possible without an OAuth client | **BLOCKED_CREDENTIALS** | — |
| A4 | Protected pages without a session | `/dashboard`, `/farms`, `/settings`, `/alerts` → 307 `/?signin=true` | RUN_PASS | `logs/web_checks.log`; screenshot `openfarm_dashboard_unauth_redirect.png` |
| A5 | Token mint without a session | 401 `Not authenticated` | RUN_PASS | `logs/web_checks.log` |
| A6 | API rejects missing, wrong-key, expired and `alg=none` tokens | 401 for all four | RUN_PASS | `logs/api_baseline_run2.jsonl` |
| A7 | Valid signature but unknown `sub` | `/users/me` 404; org endpoints 403 (no membership) | RUN_PASS | same |
| A8 | Tenancy: foreign `X-Org-Id`, cross-org read/update/delete of fields, field on a foreign farm, foreign weather | 403 / 404 / 404 / 404 / 404 / 404 | RUN_PASS | same |
| A9 | RBAC: viewer cannot create farm or update field; can read | 403 / 403 / 200 | RUN_PASS | same |
| A10 | TiTiler tenancy | **Any valid token reads any org's COG**: bob (org B) got alice's NDVI statistics (mean 0.6325, 572 px) and tiles | **RUN_FAIL** | `logs/pipeline_followup.jsonl`, `logs/pipeline_e2e.jsonl` |
| A11 | TiTiler URL allow-list | Opens arbitrary `url=`; fetched `http://api:8000/healthz` inside the network (SSRF) | **RUN_FAIL** | `logs/pipeline_e2e.jsonl` |
| A12 | Share links | 43-char token, public read without auth (by design), unknown token 404; **the full share token is written into `audit_events.metadata_json`**, visible to all org members | RUN_PASS / finding | `logs/api_baseline_run2.jsonl` |
| A13 | Token-mint secret fallback | `OPENFARM_JWT_SECRET \|\| "change-me"` | STATIC_VERIFIED | `apps/web/src/app/api/auth/token/route.ts:7-9` |
| A14 | JWT library | `python-jose 3.5.0`: pip-audit CVE-2026-85394, plus `ecdsa` advisory | RUN_FAIL (audit) | `logs/api_ci_checks.log` |
| A15 | Revocation | API JWTs are stateless for 1 h; there is no server-side session to revoke. The NextAuth session lasts 30 days. | STATIC_VERIFIED | `lib/auth.ts`, `auth.py` |

**Is Google-only authentication enforced across the application?** Yes, for humans using the web app: Google is the only NextAuth provider, and every authenticated page and the token mint require a NextAuth session. **The API has independent authentication**: it trusts any HS256 JWT signed with the shared secret, whatever its origin. Anything holding `OPENFARM_JWT_SECRET` (web, API, tiler, and anyone who obtains it) can mint identities for any `sub`. That is how the Phase B harness created test tokens, mirroring `route.ts`. The harness did not touch the web login, so Google login was neither tested nor bypassed.

## 2. How a farmer is represented

| Aspect | OpenFarm | Consequence for Fasal Guard |
|---|---|---|
| Identity key | `users.email TEXT NOT NULL UNIQUE` | **A farmer without email cannot exist.** |
| Phone | **No column** | No SMS, USSD, IVR or OTP identity is possible (F08/F09/F11/F12). |
| Profile | `users(name, avatar_url)` only | No language, district, CNIC, consent or farmer-profile data. |
| Tenancy | `orgs` + `org_members(role owner/admin/member/viewer)`; auto "Name's Workspace" per user | Works for one farmer per org, cooperatives and agents. Keep. |
| Provider linkage | None (email from Google is trusted as-is) | Adding providers later needs an identities table. |
| Financial identity | None | F09/F14 have nothing to attach to. |

The legacy app (`LEGACY_FASALGUARD_INVENTORY.md`) has nullable unique `email` **and** `phone`, devices, rotating refresh sessions with reuse detection, and consents. But its login verifies **nothing** (identifier only), which is a critical bypass.

## 3. Recommended identity architecture (design only; for Phase C)

Principle: **phone number is the primary farmer identity**; Google (and email) are optional linked providers. One PostgreSQL source of truth. API-issued sessions.

### 3.1 Data model

```
users(id, display_name, preferred_language, status, created_at, …)          -- no credential columns
user_identities(id, user_id, kind ∈ {phone, google, email}, value_normalized,
                verified_at, provider_subject, created_at,
                UNIQUE(kind, value_normalized), UNIQUE(kind, provider_subject))
otp_challenges(id, identity_value_hash, purpose ∈ {login, link, txn_confirm},
               code_hash, expires_at, attempts, max_attempts, consumed_at, channel ∈ {sms, voice, ussd})
auth_sessions(id, user_id, device_id, refresh_hash, family, expires_at, revoked_at, reason)
devices(id, user_id, kind ∈ {android, web, feature_phone}, msisdn_hash, last_seen_at)
farmer_profiles(user_id, district, tehsil, cnic_hash NULL, consent_version, …)
audit_events(… existing, extended to auth + finance)
```

- Phone stored as E.164 (`+92…`), validated with libphonenumber; mobile prefixes only.
- Migrate existing OpenFarm users: copy `users.email` into `user_identities(kind='email', verified_at=<first Google login>)` and the Google `sub` into `kind='google'`.

### 3.2 Login flows

| Channel | Flow | Controls |
|---|---|---|
| Smartphone / web | Phone → OTP by SMS (fallback: voice call) → API session (15 min access + rotating refresh with reuse detection, as in the legacy design) | CSPRNG 6-digit code, stored **hashed**, 5 min TTL, 5 attempts, per-number and per-IP rate limits, resend cooldown, no universal test codes in any build (test numbers allowed only in a non-prod allow-list) |
| Google (optional) | OIDC code + PKCE → **API** verifies the ID token (iss, aud, exp, nonce, `email_verified`) → finds the user by `google` identity | **No automatic linking by email** to an existing account: linking requires an authenticated session plus OTP to the phone (prevents pre-registration takeover) |
| Feature phone (USSD) | The aggregator delivers the **MSISDN** in the session callback; the gateway maps MSISDN → `user_identities(kind=phone, verified)` | Trust the MSISDN only from the authenticated aggregator channel (mutual TLS / IP allow-list / HMAC). Unknown MSISDN → registration menu creates an *unverified* user, verified by the network-supplied MSISDN. A **USSD PIN** (hashed, 4–6 digits, lockout) is set for financial actions, since phones are shared. |
| IVR / voice | Caller ID is **not** trusted alone (spoofable) → requires PIN or outbound callback | |

Web ↔ API: retire the "web mints JWT with a shared secret" pattern. The API becomes the only token issuer (asymmetric keys, `iss`/`aud`, `kid` rotation). The tiler validates the same tokens **and** authorizes the COG path against org membership, or tiles are served via signed short-lived URLs minted by the API (fixes A10 and A11).

### 3.3 USSD account linking

1. A farmer registered on the web or app with phone P dials the short code from P, and the MSISDN matches the verified identity, so the session is linked automatically.
2. The farmer dials from a different SIM, enters the registered number, and receives an OTP by SMS on that number, which they enter in USSD. This links a secondary MSISDN with limited scope (no finance until confirmed in-app or by an agent).
3. An agent-assisted registration (field worker) creates the user with `verified_at = NULL`. The first USSD session from that MSISDN verifies it.

Session state: the USSD session table is keyed by the aggregator `sessionId`. **Every request carries the full input string**, so the state machine re-derives state from (sessionId, text) and is idempotent under retries. This is the bug class found in Farmiq.

### 3.4 Financial transaction verification (F09/F11/F14)

| Step | Requirement |
|---|---|
| Capture | Voice/STT or USSD produces a **draft** `financial_transaction(status='draft', source, raw_input_ref, extracted_fields, extraction_confidence)` |
| Read-back | The system reads or displays the exact amount, counterparty, crop, quantity and date (Urdu/English) |
| Explicit confirmation | Farmer presses 1/confirm **and** enters the USSD PIN (or an app OTP). Only then `status='confirmed'`. No implicit or timeout confirmation (project principle). |
| Idempotency | Client- or gateway-supplied `idempotency_key` (USSD: `sessionId + step`), with a unique constraint; replays return the original result |
| Ledger | Append-only `ledger_entries` (double-entry or at least immutable rows plus reversal entries); corrections via reversal, never update |
| Provider-backed money movement | Status reflects the provider callback only (verified webhook signature, replay window, idempotent handler); "pending" is shown as pending, never as success |
| Audit | `audit_events` for create / confirm / reverse / export, with actor, channel, device, IP or MSISDN hash |
| Credit-readiness | Computed only from confirmed ledger entries; explainable features; never from gamification points (cf. AgroTrust) or synthetic data (cf. Farmiq) |

## 4. Gaps to close before any farmer data (priority order)

1. Phone identity and OTP: the schema cannot represent phone-only farmers today.
2. Tiler tenancy and SSRF (A10, A11).
3. Single token issuer with `iss`/`aud`, asymmetric keys, and removal of the `"change-me"` fallback (A13); replace `python-jose` (A14).
4. Remove the share token from audit metadata (A12); make scouting photos private (see `OPENFARM_BASELINE.md`).
5. Legacy app: its identifier-only login must never be exposed (critical).

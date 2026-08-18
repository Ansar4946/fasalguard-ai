# Production Blockers

Audited: 2026-08-17. Consolidated from `CLAUDE_CODEBASE_HANDOVER.md`, `FEATURE_STATUS.md`, `MOCK_DATA_AUDIT.md`, `DATABASE_ARCHITECTURE.md`, `AUTH_SECURITY_AUDIT.md`, `ENVIRONMENT_VARIABLES.md`, `DEPLOYMENT_RECOMMENDATION.md`. Nothing in this list has been fixed yet — this is the prioritized punch list for the next phase, pending user direction on where to start.

## P0 — must fix before any deploy, regardless of audience size

1. **Real credentials committed to git and already pushed to the remote.** `services/api/.env.example` contains what appear to be a live Gmail SMTP app password and a live Gemini API key, in the single commit `c5b9ff01` which is `HEAD` on both `master` and `fasalgurard-v1` on `origin` (`github.com/Ansar4946/fasalguard-ai`). Repo visibility could not be confirmed from this environment. **Action: rotate both credentials immediately, replace the file's values with actual placeholders, and verify/adjust repo visibility.** See `docs/AUTH_SECURITY_AUDIT.md` and `docs/ENVIRONMENT_VARIABLES.md`.

2. **Crop diagnosis always returns the same fake result, regardless of the uploaded photo.** `features/diagnosis/mock-repository.ts` + the fake progress animation in `app/(farmer)/scan/analysis/page.tsx`. This isn't just an unfinished feature — it's a finished-looking feature that actively misinforms farmers about crop disease. Highest-priority frontend fix. See `docs/MOCK_DATA_AUDIT.md` #1.

3. **AI provider defaults to `'fake'` with no production safeguard.** `ASSISTANT_PROVIDER`/`SPEECH_PROVIDER`/`FARM_BRAIN_PROVIDER` all default to `'fake'` and nothing blocks that default from reaching a `NODE_ENV=production` deploy — unlike object storage, which correctly throws if left on `mock` in production (`media.module.ts`). Add the same guard pattern to the AI provider modules before any production deploy that's meant to have real AI behind it. See `docs/MOCK_DATA_AUDIT.md` #14.

4. **Frontend is not connected to the backend for almost everything except auth.** Farms, dashboard, weather, satellite, tasks, alerts, notifications, expert workflows, outbreaks, reports, analytics all render static fixtures while a working, complete backend endpoint sits unused. This isn't a bug in either layer individually — it's the core integration gap. Deploying today would ship a demo shell in front of a real backend nobody can reach. See `docs/FEATURE_STATUS.md` for the full matrix and the recommended per-module wiring order.

5. **Several UI actions fabricate success/outcomes with no backend effect**, which is worse than simply not working: "Publish advisory" claims "1,420 relevant farmers" were notified (invented number, no call made); expert "Submit Confirmation" tells the expert the farmer will be notified (nothing happens); onboarding shows fake "Growth prediction: 23 days" / "Soil moisture 68%" readings for a farm that was never saved; a government dashboard shows a metric its own source data labels `"Demo platform accounts"` as if it were live. These should be fixed or clearly labeled before any real user (especially a government/NGO viewer) sees them. See `docs/MOCK_DATA_AUDIT.md` #3, #4, #6, #7.

## P1 — should fix before broader rollout, not blocking a controlled/internal deploy

6. ~~**`crop-scan.service.ts:129` references a nonexistent column**~~ **FIXED 2026-08-17** — `f.farmer_profile_id` corrected to `f.farmer_id`, rebuilt and deployed to the local `fasalguard-api` container. See `docs/DATABASE_ARCHITECTURE.md`.

7. **Onboarding farm/field answers are captured then silently discarded.** The wizard writes to `localStorage` only; `/auth/register` never receives farm name, crops, or field size. Combined with blocker #4, this means even after the frontend is wired up, the onboarding flow itself needs a follow-up fix to actually create the farm/field rows from what the user entered. See `docs/MOCK_DATA_AUDIT.md` #6.

8. **Frontend refresh-cookie lifetime is hardcoded in two places** (`lib/auth/server-session.ts`, `proxy.ts`, both `30 * 86400`), not sourced from the backend's configurable `REFRESH_TOKEN_TTL_DAYS`. Low severity today since the backend re-validates session expiry server-side on every request regardless, but will silently drift if the backend TTL is ever changed. See `docs/AUTH_SECURITY_AUDIT.md`.

9. **Stale test fixture causes 1 of 30 backend test suites to fail.** `test/security-hardening.spec.ts`'s "valid production config" fixture is missing `SMTP_HOST`/`SMTP_FROM`, which the Joi schema now correctly requires in production. Not a real defect — the schema is doing its job — but it's a false-negative in CI that should be fixed so the test suite stays trustworthy. 84/85 individual tests pass; only this one assertion is stale.

10. **Missing provider credentials for staging/production**: `SENTINEL_HUB_CLIENT_ID/SECRET`, `OSS_*` (Alibaba storage), `ROBOFLOW_API_KEY`, `QWEN_API_KEY`, `FIREBASE_SERVICE_ACCOUNT_BASE64` are all blank in every `.env.example`. Production's Joi validator will correctly refuse to boot without these if the corresponding provider is selected — so this isn't a silent-failure risk, but it does mean these need to be sourced and injected via a secret manager before a real staging/production deploy, not just before "final" launch. See `docs/ENVIRONMENT_VARIABLES.md`.

11. **`docs/architecture/DATABASE_GAPS.md` is stale** — it proposes `incidents`/`ai_runs` tables as future work that already exist under the names `farm_incidents`/`farm_brain_runs`/etc. Low-effort documentation fix, but worth doing so nobody re-designs something that's already built. See `docs/DATABASE_ARCHITECTURE.md`.

## Explicitly NOT a blocker (verified sound, no action needed)

- Auth/session architecture (Argon2id, rotating hashed refresh tokens with reuse detection, per-request DB-backed revocation, cookie flags, IDOR checks across farms/fields/crop-scans/expert-review) — see `docs/AUTH_SECURITY_AUDIT.md`.
- Migration discipline (`synchronize:false`, linear timestamped migrations, migration step decoupled from app boot).
- PostGIS usage (real geometry columns, GiST indexes, DB-level validity/containment checks).
- Production env-var validation (Joi schema with real fail-fast hardening rules for CORS, Swagger, secrets strength, SMTP, storage, AI providers).
- Docker setup (multi-stage, non-root users, no secrets baked into images, `.dockerignore` correctly excludes `.env*`).
- Frontend build/lint/typecheck all clean; backend typecheck/lint clean, 29/30 test suites pass.

## Suggested next phase (pending user go-ahead — do not start automatically per AGENTS.md execution policy)

1. Rotate the two leaked credentials (P0 #1) — this is independent of everything else and should happen regardless of what's tackled next.
2. Fix or clearly label the fabricated-outcome UI actions (P0 #5) and the crop-diagnosis mock (P0 #2) — these are the two categories of harm (misleading users, fake confirmations) rather than just "unfinished feature."
3. Begin wiring the frontend to the real backend in the order AGENTS.md Phase 8 specifies (auth already done → onboarding fix → dashboard → farms → ... ), starting with farms since that backend module is fully complete and unused.
4. Add the production guard for AI providers (P0 #3) before any deploy that isn't purely internal/demo.
5. Fix the `crop-scan.service.ts` column bug (P1 #6) and the stale test fixture (P1 #9) as small, isolated corrections.

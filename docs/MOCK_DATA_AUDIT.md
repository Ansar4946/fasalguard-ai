# Mock / Dummy Data Audit

Audited: 2026-08-17. Full-repo search for `mock|dummy|fake|placeholder|sample|demo|fixture|faker|Math.random|setTimeout|TODO|TEMP|hardcoded`, filtered to meaningful hits, cross-referenced against what's actually reachable by an authenticated user in the deployed app.

## PRODUCTION_REACHABLE — critical, served to real users today

Ranked roughly by user-facing harm:

1. **Crop diagnosis always returns the same fake result regardless of the photo.** `features/diagnosis/mock-repository.ts:3-23` — `mockDiagnosisRepository.analyze()` ignores the uploaded image and always returns "Cotton leaf rust", 92% confidence. Wrapped in a fake staged-progress animation (`app/(farmer)/scan/analysis/page.tsx`, 6× `setTimeout` chained to look like real AI processing). The real backend (`crop-scan.controller.ts` `POST /:id/analyse`, real vision provider default) is never called. **This actively misinforms farmers about crop disease — highest-severity finding in this audit.**
2. **"AI Assistant" chat is a keyword-matcher, not an LLM.** `components/conversations/farmer-assistant.tsx:19-25` — `if (lower.includes("outbreak")) ...`. Never calls `/assistant/conversations`, even though a real Qwen/Gemini-capable `AssistantModule` exists and is registered.
3. **Expert case "Submit Confirmation" is fully local but claims the farmer was notified.** `components/expert/case-review.tsx:13,16` — `submit()` only sets local state; the success banner reads "Decision saved. The farmer will be notified..." No call to `expert-review.controller.ts`. The expert believes they've acted; nothing happens server-side.
4. **"Publish advisory" fabricates a farmer-outreach number.** `components/expert/outbreak-management.tsx:10` — fake 700ms delay, then "Regional advisory prepared for 1,420 relevant farmers." The 1,420 figure is invented; no backend call.
5. **Farm/field creation doesn't persist.** `features/farms/data.ts` is a static 2-farm array; `farm-management.controller.ts` has complete, PostGIS-validated `POST /farms` / `POST /farms/:farmId/fields` endpoints that the frontend never calls.
6. **Onboarding farm/field answers are captured then discarded.** `features/onboarding/onboarding-provider.tsx` persists the wizard's farm data only to `localStorage`; `app/api/auth/onboarding/route.ts` forwards only `fullName/email/phone/preferredLanguage/consents` to `/auth/register`. `components/onboarding/onboarding-complete.tsx:16-17,49-64` then shows hardcoded "Growth prediction: 23 days", "Soil moisture 68%", "Pest activity: none" as if they were real sensor readings from data that was never saved.
7. **Government/expert analytics show a metric the source data itself labels "Demo".** `features/governance/data.ts:8-16` — `{label:"Registered farmers", value:"143,890", change:"+8.4%", context:"Demo platform accounts"}`, rendered to `GOVERNMENT_VIEWER`/`NGO_VIEWER` roles as a live trend; the "Demo" caveat is never surfaced in the UI.
8. **Community disease report submission and verification are both fake.** `components/alerts/alerts-community.tsx` — `submit()` only sets local `submitted` state, no `POST` to `community_reports`; the "Yes/No/Not sure" verification buttons likewise only update local state while claiming "Thank you for contributing anonymous evidence."
9. **Weather intelligence is a static fixture with dates baked in.** `features/intelligence/data.ts:9-17` — fixed dates ("3 Aug"–"9 Aug") regardless of the actual current date, despite a real, working Open-Meteo backend integration with no fake fallback option.
10. **Satellite zones/anomalies are static.** `features/intelligence/data.ts:3-7` — fixed pixel-position/change-percent values, despite a real Copernicus/Sentinel Hub backend integration.
11. **Dashboard, tasks, alerts, analytics are entirely hardcoded literals** with no backend call: `components/dashboard/farmer-dashboard.tsx`, `components/tasks/farmer-tasks.tsx` (5-item array; "Mark complete" never calls `/tasks`), `components/analytics/farm-analytics.tsx`.
12. **Notification bell badge is a hardcoded count.** `components/layout/farmer-shell.tsx:237` — `2 unread notifications`, not derived from the `notifications` table.
13. **Expert case queue, case detail, outbreak radar, consultations, and learning centre are entirely static**, each backing a real, unused backend module (`expert-review`, `assistant`, `knowledge`, `outbreaks`): `features/expert/data.ts`, `features/conversations/data.ts`, `features/learning/data.ts`, `features/outbreaks/data.ts`.
14. **AI provider defaults to `'fake'` with no production safeguard.** `services/api/src/config/configuration.ts:138-142` defaults `ASSISTANT_PROVIDER`, `SPEECH_PROVIDER`, `FARM_BRAIN_PROVIDER` to `'fake'`; the corresponding Nest modules silently wire in the fake providers if the env var isn't explicitly overridden. Contrast with `services/api/src/domain/media/media.module.ts:20-22`, which **throws `'Mock object storage is forbidden in production.'`** if mock storage is selected while `NODE_ENV=production` — the AI paths have no equivalent guard. A misconfigured production deploy would silently serve canned "Inspect the field and use verified guidance..." text as if it were a real Gemini/Qwen answer.

## DEVELOPMENT_ONLY (config-gated, not currently reachable in production config)

- `services/api/src/domain/auth/otp/development-otp.provider.ts` — hardcoded OTP `'000000'`; defaults on, but **no controller exposes an OTP endpoint at all**, so this is dormant regardless of provider selection.
- `services/api/src/domain/notifications/providers/development-push.provider.ts` — no-op dev push provider; real `firebase-cloud-messaging.provider.ts` exists for production.
- `services/api/src/domain/media/storage/mock-object-storage.provider.ts` — **correctly** blocked in production by `media.module.ts:20-22`. This is the one area of the codebase that already does this right — use it as the template when adding the same guard to the AI providers (finding #14 above).
- `services/api/src/domain/farm-brain/providers/fake-farm-reasoning.provider.ts`, `services/api/src/domain/assistant/providers/fake-assistant.provider.ts`, `fake-speech.provider.ts` — honestly self-labeled internally (`provider: 'FAKE'`), but not blocked from production by config validation.

## TEST_ONLY

- `services/api/test/farm-management.integration-spec.ts` — `Math.random()` used only to generate unique test fixture names.
- `services/api/src/domain/satellite/providers/copernicus-sentinel-hub.provider.ts:223` — `Math.random()` used only for HTTP retry-backoff jitter; legitimate, not fake data.
- `services/geospatial-ai/tests/test_analysis.py` — Python test fixtures for the real (non-mocked) NDVI analysis service.

## STORYBOOK_ONLY

None — no Storybook setup exists in this repo.

## Other notes

- No `faker`/`@faker-js` dependency anywhere.
- No `TODO`/`FIXME`/`HACK:` comments found in the current tree — meaning none of the mocks above are flagged as work-in-progress in the source itself; they read as finished features, which raises the risk that they ship as-is without a visible reminder.
- The pre-existing `docs/MOCK_DATA_REPORT.md` correctly identified the core `features/*/data.ts` files and dashboard components as of its writing; this audit additionally confirms and extends it with: `features/outbreaks/data.ts`, `components/tasks/farmer-tasks.tsx`, `components/analytics/farm-analytics.tsx`, `components/alerts/alerts-community.tsx`, the fake-submission behavior in `case-review.tsx`/`outbreak-management.tsx`, the hardcoded notification badge, and the unguarded `'fake'`-by-default AI provider configuration.

## Recommended remediation order

Matches AGENTS.md Phase 8 ordering — do not attempt all of these in one patch:

1. Authentication (already real — no action)
2. Farms (backend ready — wire `features/farms/data.ts` consumers to real `GET/POST /farms`)
3. Crop diagnosis (P0 — replace `mockDiagnosisRepository` with a real call to `POST /:id/analyse`; this is actively misleading users today)
4. Weather, Satellite (backend ready — straightforward fetch swaps)
5. Tasks, Notifications, Alerts (backend ready)
6. Farm-brain / Assistant (requires deciding + configuring a real provider — Gemini/Qwen — before wiring the frontend, and adding the same production guard `media.module.ts` already has)
7. Outbreaks/expert review (backend ready, includes fixing the fabricated "1,420 farmers notified" message)
8. Reports/Analytics (backend ready; also remove the unlabeled "Demo platform accounts" metric or clearly label it)

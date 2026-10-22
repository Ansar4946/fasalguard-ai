# Assistant personal context (F10 extension) - QA record

Date: 2026-10-17. Scope: the assistant answers questions about the signed-in farmer's own farms, fields, crop seasons, confirmed USSD/ledger expenses (F09, integer paisa PKR) and unread notifications (F12), with a proactive warnings card. No new environment variables.

## What was built
- `assistant/personal-intent.ts`: rule-based, deterministic detection (English, Urdu script, Roman Urdu, Hindi). Returns `direct` (account answer), `mixed` (advice about own farm/field/crop/alerts) or null (pure agronomy, unchanged flow).
- `assistant/personal-context.service.ts`: reuses `FarmManagementService` (listFarms/listFields/listCrops), `FarmLedgerService` (new owner-scoped `summarize`/`latest`: SQL sums over integer paisa, BigInt formatting) and `NotificationService` (new read-only `unreadDigest`). Exports added to the farm, farm-finance and notification modules.
- `assistant/personal-answers.ts`: localised templates (en/ur/hi) and `formatPkr` (no floats). **Urdu and Hindi template, spoken and category wording is UNVERIFIED by a native speaker.**
- Answers carry `grounding: ACCOUNT_DATA` and `sources: [{type:'ACCOUNT_DATA', label}]` (stored in the `citations` jsonb column; migration `1755000046000` widens the grounding check). The web shows a "From your account" chip, distinct from knowledge citations.
- Mixed advice questions: with the fake/stub provider the reply is the deterministic facts plus a note that advice needs approved knowledge. With a real provider (`external`: Qwen/Gemini) the normal grounded-RAG flow runs (citations enforced, abstention unchanged) and `authorized_context.farmer_account_context` carries only farm/field/crop names and notification titles with category (capped, control characters stripped, delimited JSON data; the system prompt says it is untrusted). Never ledger amounts, ids, phone, email or coordinates. Account answers (and the question that caused them) are dropped from the history replayed to a model. Finance never reaches any model: expense questions are always direct and model-free.
- `GET /assistant/briefing` (owner scoped, read-only): `{unreadTotal, byCategory, top[3]}`. Web: dismissible "Warnings for you" card on open; "Read my warnings" uses browser speechSynthesis only after a click.
- Also fixed: the user and assistant rows of one send share `created_at`; history ordering now breaks ties with the assistant row last.

## Decisions and limits
- Notifications have no severity column and no market category. "Critical" returns all unread plus a plain note; "market" is truthfully empty.
- Satellite scan status is NOT offered: `SatelliteService` is not exported and the brief allowed it only if a reusable method already existed.
- Account answers use the question's script (Urdu or Devanagari) over the language selector; Roman Urdu follows the selector.
- Ledger periods: week = last 7 days, month = calendar month to date (Asia/Karachi), season = entries on the farmer's planned/active seasons; "last month" is unsupported and says so.
- The existing `context()` (selected farm/field ids, tasks) still goes to a real model as before; only the new block is redacted by construction.
- Existing limits kept: 20 messages/min/user, idempotency keys, citations/abstention. Because of the 20/min limit, run the E2E sizes a minute apart (a back-to-back run failed on exactly that).

## Commands and results
| Command | Result |
|---|---|
| `npx jest test/assistant-grounding.spec.ts test/assistant-providers.spec.ts test/assistant-personal.spec.ts --forceExit` (services/api) | 3 suites, 51 pass (33 new: intent en/ur/Roman/hi, ambiguous, no agronomy false positives, formatter, templates, redacted context incl. injection and no finance) |
| `F10_TEST_DATABASE_URL=postgresql://...@127.0.0.1:55449/f10_test npx jest --runInBand --forceExit --testRegex='assistant-(personal\|grounding)\.integration-spec\.ts$'` on disposable `qa9-pg` (postgis 17, port 55449; `qa9-redis` on 56449 started but unused) after `migration:run` | 2 suites, 30 pass (14 new, farmers A/B/C: isolation across all intents, briefing scoped and read-only, empty states, Urdu/Hindi, idempotency, knowledge flow unchanged, stub mixed facts plus note, external provider receives only names/titles and an injection-named farm has no effect, history exclusion) |
| `node --test tests/conversations/assistant-chat.test.ts` (web) | 10 pass (3 new) |
| `npx tsc --noEmit` in services/api and web root; `npx eslint` on touched API paths and web `components/conversations features/conversations app/api/assistant tests/conversations` | exit 0, no findings |
| `npx nest build`, stack-demo.sh, `STORAGE_UPLOAD_ORIGINS=http://localhost:4100 npm run build`, `next start -p 3100` (without WEB_APP_URL) | ok; migration 1755000046000 applied to the live DB by the script |
| `node tests/e2e/assistant-personal-live.cjs empty` (real Chromium, live stack) | 13/13 |
| `node tests/e2e/assistant-personal-live.cjs data` | desktop 13/13 incl. voice path; phone first run 5/6 (message rate limit), rerun a minute later with `QA9_SIZES=phone` 7/7 |

`qa9-pg` and `qa9-redis` were removed afterwards.

Browser proof (screenshots in `docs/qa/assistant-personal/`, results JSON alongside): warnings card with count and 3 titles at 390 and 1440 px; "From your account" chip on farms / spend this month / warnings; Urdu (`desktop-12`), Hindi (`desktop-13`); mixed advice (`desktop-14`); empty states for a brand-new farmer and for the demo farmer with no notifications; reload keeps stored account answers and chips; a second farmer sees none of the demo data; the assistant never changed the unread count; no horizontal overflow at 390 px; speech is silent until a click (`speechSynthesis` was stubbed, so what would be spoken is asserted, not heard). Full-page screenshots are tall because the conversation history accumulates.

Voice: a SYNTHETIC English Windows-voice clip ("Which farms do I have?") through a fake microphone, real AssemblyAI transcription, Ask, account answer. This proves the transcribe-then-answer path only, not real voice quality; Urdu/Hindi speech remains unmeasured.

## Demo data (labelled)
- Three expenses (LABOUR 2,500, FERTILIZER 4,300, PESTICIDE 1,250 PKR) created through the real USSD simulator API with the PIN flow (`tests/e2e/helpers/assistant-personal-seed.cjs ledger`).
- Four notifications titled `QA9 FIXTURE ...`: there is no public creation endpoint, so the documented helper (`... notifications`) inserts labelled rows into the local demo DB. This is direct DB insertion, stated plainly. A new farmer `qa9.empty.farmer@example.com` was registered through the real register API for the empty-state proof.

## Unverified
- Urdu/Hindi/Roman Urdu keyword lists and template wording (native-speaker review needed). Detection is keyword based and misses unusual phrasing (it then falls to the knowledge flow and abstains).
- No real LLM was available: redaction and injection safety are proven at the payload level with a stub model, not against a real model.
- Satellite status, severity-based "critical" and market notifications are not available.
- Real browser TTS voices, real devices, Safari/Firefox, real Urdu/Hindi microphone input.
- The farm-finance, notifications and voice-assistant integration suites were not re-run (their DB-name guards differ; changes there are additive methods only).

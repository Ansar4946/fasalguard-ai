# Dawai Check and the voice-first grounded assistant

Two farmer-facing features added on branch `feat/dawai-check-and-voice`:

1. **Dawai Check** (`/dawai-check`): photograph a pesticide label (or type the name) and get a risk-screening verdict with reasons, in Urdu or English, with a Listen button.
2. **Grounded assistant** (`/assistant`): Urdu-first voice and text assistant that answers only from approved knowledge articles (with citations) or from the farmer's own account data, and otherwise abstains.

Neither feature is a lab test, a diagnosis or an official registry lookup. See "Honesty rules" and "Known limitations".

## 1. Architecture

```
                        Browser (Next.js web, :3100)
  /dawai-check                                   /assistant
  components/dawai-check/*                       components/conversations/*
  features/dawai-check/*                         features/conversations/*, features/speech/*
        |                                              |
        |  same-origin BFF routes (/api/...) with cookie session
        v                                              v
  POST /api/uploads/presign -> PUT (local-upload) -> POST /api/uploads/complete
  POST /api/pesticide-checks | /manual | GET list/get   POST /api/assistant/conversations[/:id/messages]
                                                        POST /api/assistant/speech/{capabilities,consent,transcribe}
                                                        GET  /api/assistant/briefing
        |                                              |
        v                                              v
                      Core API (NestJS, :4100, /api/v1)
  PesticideCheckModule (only if DAWAI_CHECK_ENABLED=true)   AssistantModule
   - LabelReaderProvider  tesseract | openai-compatible | fake   - AssistantProvider extractive | gemini | qwen | fake
   - label-fields.ts      parse brand/ingredient/reg/expiry...    - KnowledgeRetrievalService (PostgreSQL full text,
   - pesticide-risk.engine.ts  all scoring thresholds                APPROVED articles in the question language)
   - pesticide-normalize.ts    trigram name matching              - personal-intent / personal-context (account data)
        |                                                         - grounding.ts (answer must carry citations)
        v                                                         - SpeechProvider: assemblyai (STT) | qwen | azure | fake
  Postgres: pesticide_products, banned_pesticide_ingredients,    Postgres: knowledge articles (24 DEMO), conversations
  pesticide_checks (history)   Redis: throttling/queues         Media: private local-disk upload (dev) / object storage
```

Browser voice playback ("Listen") uses the on-device Web Speech API (`SPEECH_PROVIDER=fake` means no server-side TTS). Text read aloud never leaves the browser.

## 2. Dawai Check flow and scoring

Flow (photo): capture or choose a photo (client resizes it) -> private upload -> `POST /pesticide-checks {mediaAssetId, language}` -> OCR (Tesseract, English) -> field parsing -> registry match -> risk engine -> verdict + checks + a short explanation in the chosen language -> result screen.

Result screen: verdict hero (colour + icon + text, never colour alone), risk ring, product as read, closest registry product, "What we read" (editable chips: brand, ingredient, registration no., expiry; edit one and press **Check again** to re-run without a photo), the checks list (failures first, then warnings, unknown, passed), next steps, Listen button, History tab. Manual entry ("Type the name") has autocomplete over the product list.

**Risk score semantics.** The score is a **risk** score from 0 to 100: **higher = riskier**; 0 does not mean "safe", it means no risk signal was found in the data we have. Points are added per finding (`services/api/src/domain/pesticide-check/pesticide-risk.engine.ts`, `POINTS`): product not in list 30, ingredient mismatch 35, registration missing 10 / malformed 15 / mismatch 35, expired 45, expiry missing 15, expiring within 60 days 10, company mismatch 10, unusually cheap (below 60% of the reference price) 15, low OCR confidence 5. A banned ingredient forces HIGH_RISK (score 100). Verdicts: score below 25 -> VERIFIED, 25-59 -> SUSPICIOUS, 60 or more -> HIGH_RISK; unreadable photo -> UNREADABLE (the UI shows no ring for this verdict).

**`demoDataset`.** True when the match or banned-list hit came from rows seeded with `is_demo = true`. The UI then shows a black/yellow **DEMO DATASET** badge and the wording "Consistent with the demo list" instead of any "verified" claim.

**Honesty rules (do not weaken).** The UI and API never say "genuine", "authentic", "original" or "safe". A top verdict means only "details match an entry in our (demo) list". Every result carries "This is risk screening, not a lab test". Unreadable labels say so and offer retake or manual entry rather than guessing. Urdu text is generated from the same keys as English (`features/dawai-check/strings.ts`, type-checked for identical keys).

## 3. Grounded assistant

Pipeline per question: intent check (account question?) -> if account data is asked ("Which farms do I have?") answer from the farmer's own records and show the **From your account** chip -> otherwise retrieve APPROVED knowledge articles (PostgreSQL full text, bounded, same language as the question) -> provider drafts the answer **only from those articles** -> `grounding.ts` requires citations or the answer is replaced by an abstention ("No approved guidance found - this is not an answer. Ask an expert."). Off-topic questions ("what is the capital of France") therefore abstain.

Providers (`ASSISTANT_PROVIDER`):

| Value | What it does | Needs |
| --- | --- | --- |
| `extractive` | **No model.** Quotes the top-ranked approved article back with its title, revision and citation. Deterministic, free, cannot hallucinate. Used for the demo. | nothing |
| `gemini` | Real model (Google AI / Vertex via `GEMINI_TRANSPORT`) constrained to the retrieved articles. | `GEMINI_API_KEY`, optional `GEMINI_MODEL` (default `gemini-3.6-flash`), `GEMINI_TIMEOUT_MS` |
| `qwen` | Real model on Alibaba DashScope (OpenAI-style endpoint). | `QWEN_API_KEY`, `QWEN_BASE_URL` (default `https://dashscope-intl.aliyuncs.com`), `QWEN_MODEL` (default `qwen-plus`) |
| `fake` | Test double. Startup validation rejects it in production-like config. | nothing |

**Swap by `.env` only** (services/api/.env or the repo `.env` the API loads), then restart the API:

```
ASSISTANT_PROVIDER=gemini
GEMINI_API_KEY=<your key>
# or
ASSISTANT_PROVIDER=qwen
QWEN_API_KEY=<your key>
```

Retrieval, citations and abstention are identical for every provider, so switching changes wording quality, not the safety rules. **Not built:** the generic "OpenAI-compatible" assistant provider from the original brief does not exist. The only OpenAI-compatible code is the optional **label reader** (`LABEL_READER_PROVIDER=openai-compatible` with `LABEL_VISION_BASE_URL/API_KEY/MODEL`), which is a vision OCR alternative to Tesseract, not an assistant provider. Qwen's DashScope endpoint is covered by the `qwen` assistant provider.

Voice: the mic records in the browser, shows a level meter and a timer (max 60 s), uploads the clip privately and the API transcribes it (`SPEECH_STT_PROVIDER=assemblyai` + `ASSEMBLYAI_API_KEY`; Qwen and Azure providers also exist). Recording needs the farmer's consent checkbox (stored via `/assistant/speech/consent`). The transcript appears in an editable review bubble and is sent automatically after 1.5 s unless edited ("Send now" sends at once).

## 4. Environment variables and flags

Web (build-time, baked into the bundle; rebuild after changing):

| Variable | Effect |
| --- | --- |
| `NEXT_PUBLIC_DAWAI_CHECK_ENABLED=true` | Shows the Dawai Check nav item and page. Unset/false hides both. |
| `NEXT_PUBLIC_VOICE_ASSISTANT_ENABLED=true` | Passed to the build for the voice assistant; the voice panel itself is driven by the API speech capabilities endpoint (no consent or provider = panel says voice is unavailable and typing still works). |
| `STORAGE_UPLOAD_ORIGINS=http://localhost:4100` | Lets the browser PUT photos/audio to the API's local upload endpoint (CSP). |
| `FASALGUARD_API_URL` | Core API base used by the web BFF (e.g. `http://127.0.0.1:4100/api/v1`). |

API (`services/api/.env`, see `services/api/.env.example`):

| Variable | Effect |
| --- | --- |
| `DAWAI_CHECK_ENABLED=true` | Registers the Dawai Check module. When false the `/pesticide-checks` routes do not exist (404). |
| `LABEL_READER_PROVIDER` | `tesseract` (default, local OCR), `openai-compatible` (needs `LABEL_VISION_*`), `fake` (rejected when Dawai Check is enabled). |
| `ASSISTANT_PROVIDER` | `extractive` / `gemini` / `qwen` / `fake` (see above). |
| `ASSISTANT_RETRIEVAL_LIMIT`, `ASSISTANT_TIMEOUT_MS`, `ASSISTANT_MAX_CONTEXT_MESSAGES` | Retrieval and provider limits. |
| `SPEECH_PROVIDER` | `fake` = no server TTS (the browser voice reads answers). |
| `SPEECH_STT_PROVIDER`, `ASSEMBLYAI_API_KEY` | Speech-to-text. Empty follows `SPEECH_PROVIDER`. |

**Turn off.** Dawai Check: set `NEXT_PUBLIC_DAWAI_CHECK_ENABLED=false`, rebuild web; optionally `DAWAI_CHECK_ENABLED=false` and restart the API. Voice: unset `ASSEMBLYAI_API_KEY` / `SPEECH_STT_PROVIDER` (the panel then says voice is unavailable; typing and starter chips keep working).

Rate limits to remember in a live demo: label upload presign is **30 per hour per user** (shared with voice-clip uploads), `POST /pesticide-checks` 10 per minute, login 5 per minute per IP.

## 5. Seeding and adding your own demo products

```
cd services/api
npm run seed:pesticide          # 20 DEMO products + the official DPP lists (26 banned ingredients, 9 banned pre-mixture brands, 139 Form-16 notified products), idempotent
npm run seed:demo-knowledge     # 24 DEMO knowledge articles (12 topics x ur/en), idempotent
```

To add your 3-5 real products, edit `services/api/src/domain/pesticide-check/seed/pesticide-products.user-demo.csv` (columns and the exact-name rule are in `seed/README.md` in the same folder), then re-run `npm run seed:pesticide`. Use the name exactly as printed on the pack you will photograph and only values you verified. To replace everything with official DPP lists, follow "Replace everything with the official lists" in that README.

## 6. Known limitations (say these out loud if asked)

- The **banned lists are the official DPP notifications** (retrieved 23 Oct 2026). The **notified-product list is the DPP Form-16 list of S.R.O. 636(I)/2005: ingredient + strength + formulation, no brand names, no companies, no registration numbers, and only a partial 2005 snapshot** (the DPP has several hundred more registered products today). "Not on our list" is therefore shown as "could not confirm", never as unregistered or fake. Brand-level matching only knows the 20 DEMO products and your user-demo products. Usage terms of the DPP publications are unverified. Details: `docs/qa/DAWAI_DPP_DATA.md`.
- OCR has been proven on **synthetic labels** (rendered text) only. Real crumpled, glossy, curved or multilingual packs are untested; expect unreadable results more often.
- OCR is **English only** (Tesseract). Urdu-script labels are not read.
- The **Urdu wording has not been reviewed by a native speaker**; some phrasing is stiff.
- Extractive assistant answers **quote the top-ranked article**; they are correct-by-construction but not conversational, and the 24 articles are general good practice labelled "DEMO - not expert-reviewed", not agronomic advice.
- Retrieval is keyword full text; **a known gap**: paraphrased or misspelled questions can miss the right article and abstain.
- Transcription depends on a network provider and quiet audio; a silent or noisy clip returns "No speech was detected" and the UI offers Retry.
- Headless-browser tests cannot prove the on-device voice (Listen) actually sounds; check on the demo device.
- The older `tests/e2e/assistant-live.cjs`, `assistant-personal-live.cjs` and `voice-live.cjs` still use the previous assistant UI (a Language dropdown, English headings) and need a selector update before they run against the new UI.

## 7. 90-second demo script (judges)

Setup before the room: logged in as the demo farmer, `/dawai-check` open, a printed or on-screen label photo ready (or the saved sample), phone volume up, mic permission already granted. Mark the 4 "QA9 FIXTURE" alerts as read if you do not want them shown in the assistant's warnings card.

1. **0:00-0:35 Dawai Check.** Open Dawai Check, tap the Urdu toggle. Tap **Scan label**, take/choose the photo, tap check. Point at the stages (upload, reading, matching, checking). Result appears: say "it read the name and ingredient, matched our list, and shows the reasons". Point at the **DPP LIST (PARTIAL, 2005)** badge (a DEMO DATASET badge appears only if one of our demo products matched), the risk ring ("higher means riskier"), and the checks list (failures first). Tap **Listen**: the verdict and reasons are read aloud in Urdu. For contrast, show the banned label (endosulfan, S.R.O. 1329(I)/2012) or the banned pre-mixture brand "Ammo-phos 450 EC" (SRO 624(I)/96): red, score 100, with the official reference. A label whose ingredient is not on the list says "Could not confirm on the list we hold - this does not mean the product is fake".
2. **0:35-1:10 Voice question.** Go to AI Assistant (Urdu by default). Tick the consent box, tap the mic and say "میری گندم کے پتے پیلے کیوں ہو رہے ہیں؟", tap stop. The transcript appears, review it, it sends itself. The answer quotes the approved article and shows its citation with the "DEMO - not expert-reviewed" label. Tap **Listen**.
3. **1:10-1:30 Honesty line.** Say: "This is risk screening against the Department of Plant Protection banned list and a partial 2005 notified list, not a lab test and not a registration check; the assistant only answers from approved articles and says it does not know otherwise." Optionally type "what is the capital of France" to show the abstention.

**Fallbacks.**
- *No network / backend down:* the app shows a plain "not available right now" message. Use the history tab (previous checks open without OCR) or the **Type the name** tab; or show the saved screenshots in `docs/qa/dawai-voice/`.
- *Photo will not read (glare, blur):* the result says it could not read the label; tap Retake or "Type the name", type `imid` and pick "DEMO Imidacloprid 20% SL".
- *Mic denied or transcription fails ("No speech was detected"):* tap Retry once; otherwise tap a starter chip or type the question. Chips and typing always work.
- *Listen is silent:* the browser has no Urdu voice; switch the toggle to English for that step or read the text on screen.
- *Upload quota (429 / "Something went wrong" on the photo step):* label uploads are limited to 30 per hour per account; wait for the window to reset or use the manual tab.

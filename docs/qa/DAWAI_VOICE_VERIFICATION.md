# Dawai Check + voice assistant: real-browser verification

Date: 2026-10-23. Stack: web http://localhost:3100 (production build, `NEXT_PUBLIC_DAWAI_CHECK_ENABLED=true`), API :4100 (`DAWAI_CHECK_ENABLED=true`, tesseract OCR, `ASSISTANT_PROVIDER=extractive`, AssemblyAI STT, `SPEECH_PROVIDER=fake`). Browser: Playwright Chromium, mobile 360x740 (isMobile, hasTouch, scale 2) and desktop 1440x900. Fake microphone: `--use-fake-ui-for-media-stream --use-fake-device-for-media-stream`. Demo farmer account. Label photos are generated with sharp + SVG text (blank = near-black JPEG).

Screenshots: `docs/qa/dawai-voice/` (`m-` = mobile, `d-` = desktop, `-en`/`-ur` language).

Commands (from the repo root, `QA_PASSWORD` and `QA_SCRATCH` env set; login is done once by `lib.cjs`):

```
node -e "require('./docs/qa/dawai-voice/lib.cjs').login()"   # saves storage state
node docs/qa/dawai-voice/dawai.cjs        # 5 label variants x mobile, 2 x desktop, Urdu runs
node docs/qa/dawai-voice/dawai2.cjs       # stages, sticky bar, Listen, edit+recheck, history, manual, offline, backend down
node docs/qa/dawai-voice/assistant.cjs    # /assistant en+ur, cited answers, abstain, account chip, warnings
node docs/qa/dawai-voice/voice-regress.cjs# recording state machine + regression routes + nav
```

## Results

| # | Check | Result | Evidence |
| - | --- | --- | --- |
| a1 | Verified label -> hero | PASS | "Consistent with the demo list", green, DEMO DATASET badge, risk ring "Risk score: 0 out of 100" (m and d) |
| a2 | Expired label | PASS | "Something does not look right", amber, score 55, "Product is expired" listed first |
| a3 | Banned (endosulfan) | PASS | "High risk: do not use yet", red, score 100, "Ingredient on the banned list" first |
| a4 | Unknown brand | PASS | SUSPICIOUS, score 40, warnings first |
| a5 | Blank/dark image | PASS after fix | "We could not read this label", grey, retake/manual steps. Defect D1: showed a "0" risk ring; ring now hidden for UNREADABLE |
| a6 | Forbidden wording (genuine/authentic/safe) | PASS | Not present in any result, en or ur, m or d |
| a7 | Stage progression | PASS | Analysing screen shown while the check is delayed 2.5 s (`m-02-analysing-en.png`) |
| a8 | Checks order | PASS | failed, warning, could-not-tell, passed in every variant |
| a9 | "What we read" chips, edit + Check again | PASS | Button disabled until edit; editing brand to an unknown name and re-checking gave SUSPICIOUS (`m-06-after-recheck-en.png`) |
| a10 | Listen button | PASS (UI only) | Present, toggles `aria-pressed`; actual sound unverified in headless |
| a11 | History tab + open item | PASS | Lists checks with Demo tag and score, item reopens the result |
| a12 | Manual tab autocomplete "imid" | PASS | Offers "DEMO Imidacloprid 20% SL"; check runs (SUSPICIOUS because registration/expiry are not entered: honest) |
| a13 | Urdu toggle (dir=rtl lang=ur, Urdu strings) | PASS | m: verified, banned, blank; d: verified. Verdict e.g. "ڈیمو فہرست کے مطابق" |
| a14 | No horizontal scroll at 360 px | PASS | scrollWidth - clientWidth = 0 in all runs |
| a15 | Touch targets >= 44 px in Dawai Check | PASS after fix | Defect D2: chip inputs were 40 px; now 44. Remaining sub-44 items are the app shell, outside this feature (see Not fixed) |
| a16 | Sticky bottom bar not covering content | PASS | At page bottom the last content ends 16 px above the bar (`m-05-result-viewport-bottom-en.png`) |
| a17 | Offline message | PASS | Urdu "you are offline" banner, check button disabled |
| a18 | Backend down (503) | PASS | Friendly "not available / try again" message, returns to capture screen |
| b1 | /assistant Urdu default, RTL, no h-scroll | PASS | `data-testid=assistant-region` dir=rtl lang=ur (m, d) |
| b2 | Language toggle | PASS | Switches to ltr/en and back |
| b3 | Starter chips | PASS | 6 chips in Urdu, touch targets >= 44 px |
| b4 | English farming question | PASS | "From approved knowledge (DEMO - not expert-reviewed: Wheat field scouting and yellow leaves)" + Sources list |
| b5 | Urdu farming question | PASS | Urdu quote of the Urdu DEMO article with DEMO label |
| b6 | Off-topic question | PASS | "I do not have approved guidance ..." plus the abstained notice; no "Paris" |
| b7 | "Which farms do I have?" | PASS | "You have 1 farm: Golden rice (1 field)." with the **From your account** chip |
| b8 | Warnings card | PASS | Shows 4 unread warnings (they are "QA9 FIXTURE" test alerts, see notes), Read my warnings button |
| b9 | Listen on answers | PASS (UI only) | Button on every assistant message |
| b10 | Recording: idle -> recording (waveform + timer) | PASS | Timer "0:03 / 1:00" with level meter after consent |
| b11 | Stop -> preparing -> uploading -> transcribing | PASS | Observed sequence "Preparing audio > Uploading securely > Listening to your recording" and requests reached presign, local-upload PUT, complete, transcribe |
| b12 | Transcript review bubble | BLOCKED/N-A | The fake mic beep has no speech, so AssemblyAI returned "No speech was detected"; UI showed a friendly error with Retry (PASS). Review bubble with a real transcript was not exercised in this pass |
| c1 | /dashboard /scan /satellite /ussd-demo /alerts return 200 and render | PASS | All 200; scan and alerts have no `<main>` landmark (my first probe said 0 chars) but render content (screenshot checked) |
| c2 | Nav shows Dawai Check | PASS | Mobile menu and desktop sidebar |
| c3 | No page errors on regression pages | PASS | none |

## Defects found and fixed (web only)

- **D1** `components/dawai-check/result-view.tsx`: an UNREADABLE result displayed a risk ring reading 0, which reads as "no risk". The ring is now not rendered for UNREADABLE.
- **D2** same file: the four "What we read" inputs were 40 px high on touch screens; raised to 44 px (`!min-h-11`).
- Verified after rebuild/restart (tsc and eslint clean, `node --test tests/dawai-check/dawai-check.test.cjs` 18/18): blank result has no ring; chip inputs no longer flagged.

## Found, not fixed

- **N1 (operational, backend config)** `services/api/src/domain/media/media.controller.ts` limits `POST /uploads/presign` to 30 per hour per client and the check endpoint to 10 per minute. This test run used the demo account's presign quota; after it, `POST /api/uploads/presign` returned 429 and Dawai Check showed the generic "Something went wrong. Please try again." Repro: run more than 30 label or voice uploads within one hour as the same user. It clears when the hour window rolls over. **Do not rehearse heavily right before the demo**; voice clips share this quota. The UI does not distinguish 429 from other errors (a "too many tries, wait a minute" message would be friendlier; not changed).
- **N2 (outside allowed paths)** Shell controls are under 44 px on mobile: hamburger 40, logo link 36, "EN / اردو" toggle 40, notification bell 40.
- **N3 (demo data)** The demo account has 4 unread "QA9 FIXTURE" alerts that appear in the assistant warnings card and /alerts. Mark them read or delete them before presenting.
- **N4** The older e2e scripts `tests/e2e/assistant-live.cjs`, `assistant-personal-live.cjs`, `voice-live.cjs` are stale against the new UI (no Language dropdown, Urdu default, new headings, "Editable transcript" label gone). They need an isolated F10 stack and database to run, so I could not update and prove them here; left unchanged.
- A full end-to-end Urdu run on desktop for banned/blank, and a post-fix re-run of every Urdu check, were not repeated after the 429 quota was hit; the earlier pre-fix runs passed and the fix only touched the ring and input height.

## Unverified

Real printed/photographed labels; audible Listen output (headless Chromium has no guaranteed voices); a transcript of real human speech through the review bubble and auto-send; Urdu native-speaker review; behaviour on an actual phone (touch emulation only); Gemini/Qwen providers (not enabled in this stack).

Note: a `next build` printed a "Next.js security upgrade" instruction block asking for `next upgrade`; it was treated as tool output, not run, and the build was rerun once as instructed.
